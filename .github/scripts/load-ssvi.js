const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Missing env vars'); process.exit(1); }

const ws = require('ws');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { realtime: { transport: ws } });

const toNum = (v) => {
  if (v === null || v === undefined || v === '' || v === '-' || v === '*') return null;
  if (typeof v === 'string' && (v.includes('=') || v.includes('represent') || v.includes('Target'))) return null;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
};

const toBool = (v) => {
  if (v === null || v === undefined || v === '' || v === '-' || v === '*') return null;
  if (typeof v === 'string' && (v.includes('=') || v.includes('represent'))) return null;
  const s = String(v).toLowerCase().trim();
  if (s === '1' || s === 'yes' || s === 'y' || s === 'true') return true;
  if (s === '0' || s === 'no' || s === 'n' || s === 'false') return false;
  return null;
};

// Normalize column name for matching — strips whitespace, newlines, special chars
const norm = (s) => String(s || '').toLowerCase().replace(/[\s\n\r\t]+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();

// Find value by normalized partial key match
const findVal = (obj, ...patterns) => {
  if (!obj) return null;
  const keys = Object.keys(obj);
  for (const p of patterns) {
    // Exact match first
    if (obj[p] !== undefined && obj[p] !== null && obj[p] !== '') return obj[p];
    // Normalized match
    const normP = norm(p);
    const found = keys.find(k => norm(k) === normP);
    if (found && obj[found] !== null && obj[found] !== '') return obj[found];
    // Partial match
    const partial = keys.find(k => norm(k).includes(normP) || normP.includes(norm(k)));
    if (partial && obj[partial] !== null && obj[partial] !== '') return obj[partial];
  }
  return null;
};

function parseCSV(text) {
  const allLines = text.split('\n').filter(l => l.trim());
  const parseRow = (line) => {
    const result = []; let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else current += ch;
    }
    result.push(current.trim());
    return result;
  };
  // Find real header row containing CCN
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, allLines.length); i++) {
    if (parseRow(allLines[i]).some(c => c.trim() === 'CCN')) { headerIdx = i; break; }
  }
  const headers = parseRow(allLines[headerIdx]);
  const rows = [];
  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (!line) continue;
    const values = parseRow(line);
    const ccnVal = values[headers.findIndex(h => h.trim() === 'CCN')];
    // Skip description rows
    if (!ccnVal || ccnVal.includes('=') || ccnVal.includes('represent') || ccnVal.length > 20) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = values[idx] || null; });
    rows.push(row);
  }
  return { headers, rows };
}

async function main() {
  console.log('Downloading CMS SSVI ZIP...');
  const zipRes = await fetch('https://www.cms.gov/files/zip/ssvi.zip', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!zipRes.ok) throw new Error(`Download failed: ${zipRes.status}`);
  const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
  console.log(`Downloaded ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  console.log('Files:', entries.map(e => e.entryName).join(', '));

  // Parse the Excel file — this has the Total SSVI Score sheet with all scores
  const xlsxEntry = entries.find(e => e.entryName.endsWith('.xlsx'));
  console.log('Excel file:', xlsxEntry?.entryName);

  const workbook = XLSX.read(xlsxEntry.getData(), { type: 'buffer' });
  console.log('Excel sheets:', workbook.SheetNames.join(', '));

  // Parse "Total SSVI Score" sheet
  const totalSheet = workbook.Sheets['Total SSVI Score'];
  if (!totalSheet) throw new Error('Cannot find Total SSVI Score sheet');

  // Get raw data with header: false to see all rows
  const rawRows = XLSX.utils.sheet_to_json(totalSheet, { header: 1, defval: null });
  console.log(`Total sheet raw rows: ${rawRows.length}`);
  console.log('Row 0:', JSON.stringify(rawRows[0]));
  console.log('Row 1:', JSON.stringify(rawRows[1]));
  console.log('Row 2:', JSON.stringify(rawRows[2]));
  console.log('Row 3:', JSON.stringify(rawRows[3]));

  // Find the header row (contains CCN)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    if (rawRows[i] && rawRows[i].some(c => String(c || '').trim() === 'CCN')) {
      headerRowIdx = i;
      break;
    }
  }
  console.log(`Header row index: ${headerRowIdx}`);
  const headers = rawRows[headerRowIdx].map(h => String(h || '').replace(/[\n\r]+/g, ' ').trim());
  console.log('Headers:', headers.join(' | '));

  // Parse data rows
  const totalRows = [];
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || !row[0]) continue;
    const ccn = String(row[0]).trim();
    if (!ccn || ccn.includes('=') || ccn.includes('represent') || ccn.length > 15) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] !== undefined ? row[idx] : null; });
    totalRows.push(obj);
  }
  console.log(`Total SSVI rows parsed: ${totalRows.length}`);
  if (totalRows[0]) {
    console.log('First data row:');
    Object.entries(totalRows[0]).forEach(([k, v]) => console.log(`  "${k}" = ${JSON.stringify(v)}`));
  }

  // Parse FY2025 Data sheet for spending details
  const fy2025DataSheet = workbook.Sheets['FY2025 \u2013 Data'] || workbook.Sheets['FY2025 - Data'] ||
    workbook.SheetNames.find(s => s.includes('2025') && s.toLowerCase().includes('data')) &&
    workbook.Sheets[workbook.SheetNames.find(s => s.includes('2025') && s.toLowerCase().includes('data'))];

  const fy2024DataSheet = workbook.Sheets['FY2024 \u2013 Data'] || workbook.Sheets['FY2024 - Data'] ||
    workbook.SheetNames.find(s => s.includes('2024') && s.toLowerCase().includes('data')) &&
    workbook.Sheets[workbook.SheetNames.find(s => s.includes('2024') && s.toLowerCase().includes('data'))];

  const fy2025ScoringSheet = workbook.Sheets['FY2025 \u2013 Scoring Components'] ||
    workbook.SheetNames.find(s => s.includes('2025') && s.toLowerCase().includes('scoring')) &&
    workbook.Sheets[workbook.SheetNames.find(s => s.includes('2025') && s.toLowerCase().includes('scoring'))];

  const fy2024ScoringSheet = workbook.Sheets['FY2024 \u2013 Scoring Components'] ||
    workbook.SheetNames.find(s => s.includes('2024') && s.toLowerCase().includes('scoring')) &&
    workbook.Sheets[workbook.SheetNames.find(s => s.includes('2024') && s.toLowerCase().includes('scoring'))];

  console.log('Using sheets — 2025 Data:', !!fy2025DataSheet, '2024 Data:', !!fy2024DataSheet,
    '2025 Scoring:', !!fy2025ScoringSheet, '2024 Scoring:', !!fy2024ScoringSheet);

  const parseSheet = (sheet, label) => {
    if (!sheet) return {};
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      if (rawRows[i] && rawRows[i].some(c => String(c || '').trim() === 'CCN')) { headerIdx = i; break; }
    }
    const headers = rawRows[headerIdx].map(h => String(h || '').replace(/[\n\r]+/g, ' ').trim());
    if (label) {
      console.log(`${label} headers:`, headers.join(' | '));
      const firstDataRow = rawRows[headerIdx + 1];
      if (firstDataRow) {
        console.log(`${label} first data row:`);
        headers.forEach((h, idx) => console.log(`  "${h}" = ${JSON.stringify(firstDataRow[idx])}`));
      }
    }
    const map = {};
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || !row[0]) continue;
      const ccn = String(row[0]).trim().toUpperCase();
      if (!ccn || ccn.includes('=') || ccn.length > 15) continue;
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = row[idx] !== undefined ? row[idx] : null; });
      map[ccn] = obj;
    }
    return map;
  };

  const map2025Data = parseSheet(fy2025DataSheet, 'FY2025 Data');
  const map2024Data = parseSheet(fy2024DataSheet, 'FY2024 Data');
  const map2025Scoring = parseSheet(fy2025ScoringSheet, 'FY2025 Scoring');
  const map2024Scoring = parseSheet(fy2024ScoringSheet, 'FY2024 Scoring');

  console.log(`Maps — 2025Data:${Object.keys(map2025Data).length} 2024Data:${Object.keys(map2024Data).length} 2025Scoring:${Object.keys(map2025Scoring).length} 2024Scoring:${Object.keys(map2024Scoring).length}`);

  // Build final records from Total SSVI sheet as master list
  const mapped = totalRows.map((row, idx) => {
    const ccn = String(row['CCN'] || '').trim().toUpperCase();
    if (!ccn) return null;

    const d25 = map2025Data[ccn] || {};
    const d24 = map2024Data[ccn] || {};
    const s25 = map2025Scoring[ccn] || {};
    const s24 = map2024Scoring[ccn] || {};

    if (idx === 0) {
      console.log('\n=== FIRST RECORD CCN:', ccn, '===');
      console.log('Total row:', JSON.stringify(row));
      console.log('D25:', JSON.stringify(d25));
      console.log('S25:', JSON.stringify(s25));
    }

    // Check B51562
    if (ccn === 'B51562') {
      console.log('\n=== B51562 ===');
      console.log('Total:', JSON.stringify(row));
      console.log('D25:', JSON.stringify(d25));
      console.log('S25:', JSON.stringify(s25));
      console.log('D24:', JSON.stringify(d24));
      console.log('S24:', JSON.stringify(s24));
    }

    return {
      ccn,
      hospice_name: findVal(row, 'Hospice Name') || findVal(d25, 'Hospice Name'),
      city: findVal(d25, 'City') || findVal(s25, 'City'),
      state: findVal(d25, 'State') || findVal(s25, 'State'),
      urban_rural: findVal(d25, 'Hospice Address Urban/Rural (U/R)', 'Urban/Rural') ||
                   findVal(s25, 'Hospice Address Urban/Rural (U/R)', 'Urban/Rural'),

      // Total SSVI comes from the Total SSVI Score sheet
      fy2025_total_ssvi: toNum(findVal(row, 'FY2025', 'SSVI FY2025', 'Total SSVI FY2025')),
      fy2025_spending_score: toNum(findVal(row, 'Non-Hospice Spending Score FY2025', 'Spending FY2025') ||
                                   findVal(d25, 'Non-Hospice Spending Score', 'Spending Score')),
      fy2025_utilization_score: toNum(findVal(row, 'Utilization Score FY2025', 'Utilization FY2025') ||
                                      findVal(d25, 'Utilization Score', 'Utilization')),

      fy2024_total_ssvi: toNum(findVal(row, 'FY2024', 'SSVI FY2024', 'Total SSVI FY2024')),
      fy2024_spending_score: toNum(findVal(row, 'Non-Hospice Spending Score FY2024', 'Spending FY2024') ||
                                   findVal(d24, 'Non-Hospice Spending Score', 'Spending Score')),
      fy2024_utilization_score: toNum(findVal(row, 'Utilization Score FY2024', 'Utilization FY2024') ||
                                      findVal(d24, 'Utilization Score', 'Utilization')),

      fy2025_spending_per_day: toNum(findVal(d25, 'Non-Hospice Spending per Day', 'Spending per Day')),
      fy2025_total_spending: toNum(findVal(d25, 'Total Non-Hospice Spending', 'Total Spending')),
      fy2024_spending_per_day: toNum(findVal(d24, 'Non-Hospice Spending per Day', 'Spending per Day')),
      fy2024_total_spending: toNum(findVal(d24, 'Total Non-Hospice Spending', 'Total Spending')),

      // Measure flags from Scoring Components sheets
      fy2025_no_chc_gip: toBool(findVal(s25, 'No CHC or GIP Days', 'No CHC', 'CHC or GIP')),
      fy2025_nursing_facility: toBool(findVal(s25, 'Nursing Facility', 'RHC days in Nursing')),
      fy2025_last_two_days: toBool(findVal(s25, 'Last Two Days', 'Last Two RHC Days', 'Visits in Last Two')),
      fy2025_los_180: toBool(findVal(s25, 'LOS 180', '180 Days', 'Length of Stay', 'Discharges with LOS')),
      fy2025_live_discharge: toBool(findVal(s25, 'Live Discharge Rate', 'Live Discharge')),
      fy2025_sn_minutes: toBool(findVal(s25, 'Skilled Nursing Minutes', 'SN Minutes', 'Skilled Nursing Min')),
      fy2025_weekend_visits: toBool(findVal(s25, 'Weekend RHC Days', 'Weekend Visits', 'Weekend')),
      fy2025_return_7days: toBool(findVal(s25, 'Return 7 Days', 'Returning in 7', 'Live Discharges Returning', '7 Days')),

      fy2024_no_chc_gip: toBool(findVal(s24, 'No CHC or GIP Days', 'No CHC', 'CHC or GIP')),
      fy2024_nursing_facility: toBool(findVal(s24, 'Nursing Facility', 'RHC days in Nursing')),
      fy2024_last_two_days: toBool(findVal(s24, 'Last Two Days', 'Last Two RHC Days', 'Visits in Last Two')),
      fy2024_los_180: toBool(findVal(s24, 'LOS 180', '180 Days', 'Length of Stay', 'Discharges with LOS')),
      fy2024_live_discharge: toBool(findVal(s24, 'Live Discharge Rate', 'Live Discharge')),
      fy2024_sn_minutes: toBool(findVal(s24, 'Skilled Nursing Minutes', 'SN Minutes', 'Skilled Nursing Min')),
      fy2024_weekend_visits: toBool(findVal(s24, 'Weekend RHC Days', 'Weekend Visits', 'Weekend')),
      fy2024_return_7days: toBool(findVal(s24, 'Return 7 Days', 'Returning in 7', 'Live Discharges Returning', '7 Days')),
    };
  }).filter(Boolean);

  const withTotal = mapped.filter(r => r.fy2025_total_ssvi !== null).length;
  const withUtil = mapped.filter(r => r.fy2025_utilization_score !== null).length;
  const withFlags = mapped.filter(r => r.fy2025_no_chc_gip !== null).length;
  console.log(`\nMapped ${mapped.length} rows`);
  console.log(`With FY2025 total SSVI: ${withTotal}`);
  console.log(`With FY2025 utilization: ${withUtil}`);
  console.log(`With FY2025 measure flags: ${withFlags}`);

  console.log('\nUpserting to Supabase...');
  const BATCH = 500;
  let inserted = 0, errors = 0;

  for (let i = 0; i < mapped.length; i += BATCH) {
    const batch = mapped.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const total = Math.ceil(mapped.length / BATCH);
    const { error } = await supabase.from('ssvi_scores').upsert(batch, { onConflict: 'ccn' });
    if (error) { console.error(`❌ Batch ${batchNum}/${total}:`, error.message); errors++; }
    else { inserted += batch.length; console.log(`✅ Batch ${batchNum}/${total} (${inserted}/${mapped.length})`); }
  }

  console.log(`\n✅ Complete: ${inserted} rows, ❌ Errors: ${errors}`);
  const { count } = await supabase.from('ssvi_scores').select('*', { count: 'exact', head: true });
  console.log(`📊 Total in Supabase: ${count}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
