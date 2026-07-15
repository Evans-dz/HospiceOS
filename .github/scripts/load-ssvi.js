const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const ws = require('ws');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws }
});

function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];
  
  // Parse header — handle quoted fields
  const parseRow = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  console.log('CSV Headers:', headers.join(' | '));
  
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseRow(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || null;
    });
    rows.push(row);
  }
  return rows;
}

const toNum = (v) => {
  if (v === null || v === undefined || v === '' || v === '-' || v === '*') return null;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
};

const toBool = (v) => {
  if (v === null || v === undefined || v === '' || v === '-' || v === '*') return null;
  const s = String(v).toLowerCase().trim();
  if (s === '1' || s === 'yes' || s === 'y' || s === 'true') return true;
  if (s === '0' || s === 'no' || s === 'n' || s === 'false') return false;
  return null;
};

const get = (row, ...keys) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    const norm = k.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    const found = Object.keys(row).find(rk =>
      rk.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '') === norm
    );
    if (found && row[found] !== null && row[found] !== '') return row[found];
  }
  return null;
};

async function main() {
  console.log('Step 1: Downloading CMS SSVI ZIP...');
  const zipRes = await fetch('https://www.cms.gov/files/zip/ssvi.zip', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!zipRes.ok) throw new Error(`Download failed: ${zipRes.status}`);
  const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
  console.log(`Downloaded ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  console.log('Step 2: Extracting ZIP...');
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  console.log('Files:', entries.map(e => e.entryName).join(', '));

  // Find the Total SSVI Score CSV
  const totalCSVEntry = entries.find(e =>
    e.entryName.includes('Total_SSVI_Score') && e.entryName.endsWith('.csv')
  );
  const fy2025Entry = entries.find(e =>
    e.entryName.includes('FY2025_Data') && e.entryName.endsWith('.csv')
  );
  const fy2024Entry = entries.find(e =>
    e.entryName.includes('FY2024_Data') && e.entryName.endsWith('.csv')
  );
  const scoringEntry = entries.find(e =>
    e.entryName.includes('FY2025_Scoring') && e.entryName.endsWith('.csv')
  );
  const scoring2024Entry = entries.find(e =>
    e.entryName.includes('FY2024_Scoring') && e.entryName.endsWith('.csv')
  );

  console.log('Total CSV:', totalCSVEntry?.entryName);
  console.log('FY2025 Data:', fy2025Entry?.entryName);
  console.log('FY2024 Data:', fy2024Entry?.entryName);
  console.log('FY2025 Scoring:', scoringEntry?.entryName);
  console.log('FY2024 Scoring:', scoring2024Entry?.entryName);

  // Parse Total SSVI Score CSV (main scores)
  if (!totalCSVEntry) throw new Error('Cannot find Total_SSVI_Score CSV');
  
  const totalText = totalCSVEntry.getData().toString('utf8');
  const totalRows = parseCSV(totalText);
  console.log(`Total SSVI CSV: ${totalRows.length} rows`);
  if (totalRows[0]) console.log('Sample:', JSON.stringify(totalRows[0]));

  // Parse scoring components (measure flags)
  let scoring2025Rows = [];
  let scoring2024Rows = [];
  
  if (scoringEntry) {
    const text = scoringEntry.getData().toString('utf8');
    scoring2025Rows = parseCSV(text);
    console.log(`FY2025 Scoring: ${scoring2025Rows.length} rows`);
    if (scoring2025Rows[0]) console.log('FY2025 Scoring sample:', JSON.stringify(scoring2025Rows[0]));
  }

  if (scoring2024Entry) {
    const text = scoring2024Entry.getData().toString('utf8');
    scoring2024Rows = parseCSV(text);
    console.log(`FY2024 Scoring: ${scoring2024Rows.length} rows`);
    if (scoring2024Rows[0]) console.log('FY2024 Scoring sample:', JSON.stringify(scoring2024Rows[0]));
  }

  // Build lookup maps for scoring components by CCN
  const scoring2025Map = {};
  scoring2025Rows.forEach(r => {
    const ccn = get(r, 'CCN', 'ccn');
    if (ccn) scoring2025Map[String(ccn).trim().toUpperCase()] = r;
  });

  const scoring2024Map = {};
  scoring2024Rows.forEach(r => {
    const ccn = get(r, 'CCN', 'ccn');
    if (ccn) scoring2024Map[String(ccn).trim().toUpperCase()] = r;
  });

  console.log(`Scoring 2025 map: ${Object.keys(scoring2025Map).length} entries`);
  console.log(`Scoring 2024 map: ${Object.keys(scoring2024Map).length} entries`);

  // Map total rows
  console.log('Step 3: Mapping rows...');
  const mapped = totalRows.map((row, idx) => {
    const ccn = get(row, 'CCN', 'ccn', 'CMS Certification Number');
    if (!ccn) return null;

    const cleanCCN = String(ccn).trim().toUpperCase();
    const s25 = scoring2025Map[cleanCCN] || {};
    const s24 = scoring2024Map[cleanCCN] || {};

    if (idx === 0) {
      console.log('=== TOTAL ROW KEYS ===', Object.keys(row).join(' | '));
      console.log('=== SCORING 2025 KEYS ===', Object.keys(s25).join(' | '));
    }

    return {
      ccn: cleanCCN,
      hospice_name: get(row, 'Hospice Name', 'hospice_name', 'Name', 'Provider Name'),
      city: get(row, 'City', 'city'),
      state: get(row, 'State', 'state'),
      urban_rural: get(row, 'Urban/Rural', 'urban_rural', 'Urban Rural'),

      // FY2025 scores
      fy2025_total_ssvi: toNum(get(row,
        'FY2025', 'FY 2025', 'SSVI FY2025', 'FY2025 Total SSVI',
        'FY2025 SSVI Score', 'Total SSVI FY2025',
        'SSVI (Service and Spending Variation Index) Score FY2025'
      )),
      fy2025_spending_score: toNum(get(row,
        'Non-Hospice Spending Score FY2025',
        'Spending Score FY2025',
        'FY2025 Spending',
        'FY2025 Non-Hospice Spending Score'
      )),
      fy2025_utilization_score: toNum(get(row,
        'Utilization Score FY2025',
        'FY2025 Utilization',
        'FY2025 Utilization Score'
      )),

      // FY2024 scores
      fy2024_total_ssvi: toNum(get(row,
        'FY2024', 'FY 2024', 'SSVI FY2024', 'FY2024 Total SSVI',
        'FY2024 SSVI Score', 'Total SSVI FY2024',
        'SSVI (Service and Spending Variation Index) Score FY2024'
      )),
      fy2024_spending_score: toNum(get(row,
        'Non-Hospice Spending Score FY2024',
        'Spending Score FY2024',
        'FY2024 Spending',
        'FY2024 Non-Hospice Spending Score'
      )),
      fy2024_utilization_score: toNum(get(row,
        'Utilization Score FY2024',
        'FY2024 Utilization',
        'FY2024 Utilization Score'
      )),

      // FY2025 measure flags from scoring components
      fy2025_no_chc_gip: toBool(get(s25, 'No CHC or GIP', 'no_chc_gip', 'Provides no CHC or GIP days')),
      fy2025_nursing_facility: toBool(get(s25, 'Nursing Facility', 'nursing_facility', 'RHC days in nursing facility')),
      fy2025_last_two_days: toBool(get(s25, 'Last Two Days', 'last_two_days', 'Visits in last two RHC days')),
      fy2025_los_180: toBool(get(s25, 'LOS 180', 'los_180', 'Discharges LOS 180', 'Length of Stay 180')),
      fy2025_live_discharge: toBool(get(s25, 'Live Discharge', 'live_discharge', 'Live discharge rate')),
      fy2025_sn_minutes: toBool(get(s25, 'SN Minutes', 'sn_minutes', 'Skilled nursing minutes', 'SN minutes per RHC day')),
      fy2025_weekend_visits: toBool(get(s25, 'Weekend Visits', 'weekend_visits', 'Weekend RHC days')),
      fy2025_return_7days: toBool(get(s25, 'Return 7 Days', 'return_7days', 'Live discharges returning')),

      // FY2024 measure flags
      fy2024_no_chc_gip: toBool(get(s24, 'No CHC or GIP', 'no_chc_gip', 'Provides no CHC or GIP days')),
      fy2024_nursing_facility: toBool(get(s24, 'Nursing Facility', 'nursing_facility', 'RHC days in nursing facility')),
      fy2024_last_two_days: toBool(get(s24, 'Last Two Days', 'last_two_days', 'Visits in last two RHC days')),
      fy2024_los_180: toBool(get(s24, 'LOS 180', 'los_180', 'Discharges LOS 180', 'Length of Stay 180')),
      fy2024_live_discharge: toBool(get(s24, 'Live Discharge', 'live_discharge', 'Live discharge rate')),
      fy2024_sn_minutes: toBool(get(s24, 'SN Minutes', 'sn_minutes', 'Skilled nursing minutes')),
      fy2024_weekend_visits: toBool(get(s24, 'Weekend Visits', 'weekend_visits', 'Weekend RHC days')),
      fy2024_return_7days: toBool(get(s24, 'Return 7 Days', 'return_7days', 'Live discharges returning')),
    };
  }).filter(Boolean);

  console.log(`Mapped ${mapped.length} valid rows`);

  // Check how many have scores
  const withScores = mapped.filter(r => r.fy2025_total_ssvi !== null).length;
  console.log(`Rows with FY2025 SSVI score: ${withScores}`);

  if (mapped.length === 0) throw new Error('No rows mapped — check CSV parsing');

  console.log('Step 4: Upserting to Supabase in batches of 500...');
  const BATCH = 500;
  let inserted = 0, errors = 0;

  for (let i = 0; i < mapped.length; i += BATCH) {
    const batch = mapped.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const total = Math.ceil(mapped.length / BATCH);
    const { error } = await supabase.from('ssvi_scores').upsert(batch, { onConflict: 'ccn' });
    if (error) {
      console.error(`❌ Batch ${batchNum}/${total}:`, error.message);
      errors++;
    } else {
      inserted += batch.length;
      console.log(`✅ Batch ${batchNum}/${total} (${inserted}/${mapped.length})`);
    }
  }

  console.log(`\n===========================`);
  console.log(`✅ Complete: ${inserted} rows`);
  console.log(`❌ Errors: ${errors}`);
  const { count } = await supabase.from('ssvi_scores').select('*', { count: 'exact', head: true });
  console.log(`📊 Total in Supabase: ${count}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
