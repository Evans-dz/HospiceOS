const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('Missing env vars'); process.exit(1); }

const ws = require('ws');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { realtime: { transport: ws } });

function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];
  const parseRow = (line) => {
    const result = []; let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  };
  const headers = parseRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseRow(line);
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = values[idx] || null; });
    rows.push(row);
  }
  return { headers, rows };
}

const toNum = (v) => {
  if (!v || v === '-' || v === '*' || v === 'N/A') return null;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
};

const toBool = (v) => {
  if (!v || v === '-' || v === '*') return null;
  const s = String(v).toLowerCase().trim();
  if (s === '1' || s === 'yes' || s === 'y' || s === 'true') return true;
  if (s === '0' || s === 'no' || s === 'n' || s === 'false') return false;
  return null;
};

async function main() {
  console.log('Downloading CMS SSVI ZIP...');
  const zipRes = await fetch('https://www.cms.gov/files/zip/ssvi.zip', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!zipRes.ok) throw new Error(`Download failed: ${zipRes.status}`);
  const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
  console.log(`Downloaded ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  console.log('Files:', entries.map(e => e.entryName).join(', '));

  // Find all CSV files
  const findEntry = (pattern) => entries.find(e => e.entryName.includes(pattern) && e.entryName.endsWith('.csv'));
  
  const totalEntry = findEntry('Total_SSVI_Score');
  const fy2025Entry = findEntry('FY2025_Scoring');
  const fy2024Entry = findEntry('FY2024_Scoring');
  const fy2025DataEntry = findEntry('FY2025_Data');
  const fy2024DataEntry = findEntry('FY2024_Data');

  console.log('Total CSV:', totalEntry?.entryName);
  console.log('FY2025 Scoring:', fy2025Entry?.entryName);
  console.log('FY2024 Scoring:', fy2024Entry?.entryName);
  console.log('FY2025 Data:', fy2025DataEntry?.entryName);
  console.log('FY2024 Data:', fy2024DataEntry?.entryName);

  // Parse total scores CSV
  const { headers: totalHeaders, rows: totalRows } = parseCSV(totalEntry.getData().toString('utf8'));
  console.log(`Total CSV headers: ${totalHeaders.join(' | ')}`);
  console.log(`Total CSV rows: ${totalRows.length}`);
  if (totalRows[0]) console.log('Sample total row:', JSON.stringify(totalRows[0]));

  // Parse scoring components
  let scoring2025Rows = [], scoring2024Rows = [];
  let scoring2025Headers = [], scoring2024Headers = [];

  if (fy2025Entry) {
    const parsed = parseCSV(fy2025Entry.getData().toString('utf8'));
    scoring2025Headers = parsed.headers;
    scoring2025Rows = parsed.rows;
    console.log(`FY2025 Scoring headers: ${scoring2025Headers.join(' | ')}`);
    console.log(`FY2025 Scoring rows: ${scoring2025Rows.length}`);
    if (scoring2025Rows[0]) console.log('FY2025 Scoring sample:', JSON.stringify(scoring2025Rows[0]));
  }

  if (fy2024Entry) {
    const parsed = parseCSV(fy2024Entry.getData().toString('utf8'));
    scoring2024Headers = parsed.headers;
    scoring2024Rows = parsed.rows;
    console.log(`FY2024 Scoring headers: ${scoring2024Headers.join(' | ')}`);
    if (scoring2024Rows[0]) console.log('FY2024 Scoring sample:', JSON.stringify(scoring2024Rows[0]));
  }

  // Build CCN lookup maps
  const map2025 = {};
  scoring2025Rows.forEach(r => { const c = r['CCN']; if (c) map2025[c.trim().toUpperCase()] = r; });
  const map2024 = {};
  scoring2024Rows.forEach(r => { const c = r['CCN']; if (c) map2024[c.trim().toUpperCase()] = r; });

  console.log(`Scoring maps — 2025: ${Object.keys(map2025).length}, 2024: ${Object.keys(map2024).length}`);

  // Map all rows
  const mapped = totalRows.map((row, idx) => {
    const ccn = row['CCN'];
    if (!ccn || ccn.trim() === '') return null;
    const cleanCCN = ccn.trim().toUpperCase();
    const s25 = map2025[cleanCCN] || {};
    const s24 = map2024[cleanCCN] || {};

    if (idx === 0) {
      console.log('\n=== TOTAL COLUMNS ===');
      totalHeaders.forEach(h => console.log(`  "${h}" = ${JSON.stringify(row[h])}`));
      console.log('=== SCORING 2025 COLUMNS ===');
      scoring2025Headers.forEach(h => console.log(`  "${h}" = ${JSON.stringify(s25[h])}`));
      console.log('=== END SAMPLE ===\n');
    }

    // The Total SSVI Score CSV has these columns based on logs:
    // CCN | Hospice Name | Non-Hospice Spending Score (and likely SSVI total + Utilization)
    // We'll grab by position if name matching fails

    // Try all possible column name variations for total SSVI
    const allKeys25 = Object.keys(s25);
    const allKeysTotal = Object.keys(row);

    // Find SSVI score — try every key that contains 'ssvi' or 'total' or 'score'
    const findScore = (obj, patterns) => {
      for (const p of patterns) {
        if (obj[p] !== undefined && obj[p] !== null && obj[p] !== '') return obj[p];
      }
      // Try case-insensitive partial match
      const keys = Object.keys(obj);
      for (const p of patterns) {
        const found = keys.find(k => k.toLowerCase().includes(p.toLowerCase()));
        if (found && obj[found] !== null && obj[found] !== '') return obj[found];
      }
      return null;
    };

    return {
      ccn: cleanCCN,
      hospice_name: row['Hospice Name'] || null,
      city: row['City'] || s25['City'] || null,
      state: row['State'] || s25['State'] || null,
      urban_rural: row['Hospice Address Urban/Rural (U/R)'] || row['Urban/Rural'] || s25['Hospice Address Urban/Rural (U/R)'] || null,

      // Total scores — from total CSV
      fy2025_total_ssvi: toNum(findScore(row, ['SSVI', 'Total SSVI', 'FY2025 Total', 'Score'])),
      fy2025_spending_score: toNum(row['Non-Hospice Spending Score'] || findScore(row, ['Spending Score', 'Non-Hospice'])),
      fy2025_utilization_score: toNum(findScore(row, ['Utilization Score', 'Utilization'])),

      // FY2024 — likely in separate columns or rows
      fy2024_total_ssvi: toNum(findScore(s24, ['SSVI', 'Total SSVI', 'Score'])),
      fy2024_spending_score: toNum(s24['Non-Hospice Spending Score'] || findScore(s24, ['Spending Score', 'Non-Hospice'])),
      fy2024_utilization_score: toNum(findScore(s24, ['Utilization Score', 'Utilization'])),

      // FY2025 measure flags from scoring components
      fy2025_no_chc_gip: toBool(findScore(s25, ['No CHC', 'CHC or GIP', 'no_chc'])),
      fy2025_nursing_facility: toBool(findScore(s25, ['Nursing Facility', 'nursing_facility'])),
      fy2025_last_two_days: toBool(findScore(s25, ['Last Two', 'last_two'])),
      fy2025_los_180: toBool(findScore(s25, ['LOS 180', '180 Day', 'los_180'])),
      fy2025_live_discharge: toBool(findScore(s25, ['Live Discharge', 'live_discharge'])),
      fy2025_sn_minutes: toBool(findScore(s25, ['SN Minutes', 'Skilled Nursing Minutes', 'sn_minutes'])),
      fy2025_weekend_visits: toBool(findScore(s25, ['Weekend', 'weekend_visits'])),
      fy2025_return_7days: toBool(findScore(s25, ['Return', '7 Day', 'return_7'])),

      // FY2024 measure flags
      fy2024_no_chc_gip: toBool(findScore(s24, ['No CHC', 'CHC or GIP'])),
      fy2024_nursing_facility: toBool(findScore(s24, ['Nursing Facility'])),
      fy2024_last_two_days: toBool(findScore(s24, ['Last Two'])),
      fy2024_los_180: toBool(findScore(s24, ['LOS 180', '180 Day'])),
      fy2024_live_discharge: toBool(findScore(s24, ['Live Discharge'])),
      fy2024_sn_minutes: toBool(findScore(s24, ['SN Minutes', 'Skilled Nursing Minutes'])),
      fy2024_weekend_visits: toBool(findScore(s24, ['Weekend'])),
      fy2024_return_7days: toBool(findScore(s24, ['Return', '7 Day'])),
    };
  }).filter(Boolean);

  console.log(`Mapped ${mapped.length} rows`);
  const withScores = mapped.filter(r => r.fy2025_total_ssvi !== null).length;
  console.log(`With FY2025 SSVI score: ${withScores}`);

  console.log('Upserting to Supabase...');
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

  console.log(`\n===========================`);
  console.log(`✅ Complete: ${inserted} rows`);
  console.log(`❌ Errors: ${errors}`);
  const { count } = await supabase.from('ssvi_scores').select('*', { count: 'exact', head: true });
  console.log(`📊 Total in Supabase: ${count}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
