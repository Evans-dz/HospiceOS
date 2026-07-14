const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('Step 1: Downloading CMS SSVI ZIP from cms.gov...');
  
  const zipRes = await fetch('https://www.cms.gov/files/zip/ssvi.zip', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  
  if (!zipRes.ok) throw new Error(`Download failed: ${zipRes.status} ${zipRes.statusText}`);
  
  const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
  console.log(`Downloaded ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  console.log('Step 2: Extracting ZIP...');
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  console.log('Files in ZIP:', entries.map(e => e.entryName).join(', '));

  const xlsxEntry = entries.find(e =>
    e.entryName.toLowerCase().endsWith('.xlsx') ||
    e.entryName.toLowerCase().endsWith('.xls')
  );

  if (!xlsxEntry) {
    console.log('All entries:', entries.map(e => `${e.entryName} (${e.header.size} bytes)`));
    throw new Error('No Excel file found in ZIP');
  }

  console.log(`Step 3: Parsing Excel file: ${xlsxEntry.entryName}`);
  const xlsxBuffer = xlsxEntry.getData();
  const workbook = XLSX.read(xlsxBuffer, { type: 'buffer' });

  console.log('Sheet names:', workbook.SheetNames.join(', '));

  // Use the Total SSVI Score sheet (first sheet or one containing "total")
  const targetSheet = workbook.SheetNames.find(n =>
    n.toLowerCase().includes('total')
  ) || workbook.SheetNames[0];

  console.log(`Using sheet: "${targetSheet}"`);
  const sheet = workbook.Sheets[targetSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  console.log(`Found ${rows.length} rows`);
  if (rows.length > 0) {
    console.log('Column names:', Object.keys(rows[0]).join(' | '));
    console.log('Sample row:', JSON.stringify(rows[0]));
  }

  // Flexible column mapper
  const get = (row, ...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
      const lk = k.toLowerCase();
      const found = Object.keys(row).find(rk => rk.toLowerCase() === lk);
      if (found !== undefined && row[found] !== null && row[found] !== '') return row[found];
    }
    return null;
  };

  const toNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const toBool = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'boolean') return v;
    if (v === 1 || v === '1' || v === 'Yes' || v === 'yes' || v === 'Y') return true;
    if (v === 0 || v === '0' || v === 'No' || v === 'no' || v === 'N') return false;
    return null;
  };

  console.log('Step 4: Mapping rows to database schema...');

  const mapped = rows.map((row, idx) => {
    const ccn = get(row, 'CCN', 'ccn', 'CMS Certification Number', 'Provider CCN', 'PROVIDER_CCN');
    if (!ccn) {
      if (idx < 3) console.log(`Row ${idx} missing CCN, keys:`, Object.keys(row).slice(0, 10));
      return null;
    }

    return {
      ccn: String(ccn).trim().toUpperCase(),
      hospice_name: get(row, 'Hospice Name', 'HOSPICE NAME', 'Provider Name', 'PROVIDER NAME', 'Name', 'NAME', 'Facility Name'),
      city: get(row, 'City', 'CITY', 'Provider City'),
      state: get(row, 'State', 'STATE', 'Provider State'),
      urban_rural: get(row, 'Urban/Rural', 'Urban_Rural', 'URBAN_RURAL', 'Urban Rural'),

      fy2025_total_ssvi: toNum(get(row, 'FY 2025 Total SSVI Score', 'FY2025 Total SSVI', 'FY2025_Total_SSVI', 'Total SSVI FY2025', 'FY2025 SSVI')),
      fy2025_spending_score: toNum(get(row, 'FY 2025 Non-Hospice Spending Score', 'FY2025 Non-Hospice Spending Score', 'FY2025_Spending_Score', 'FY2025 Spending Score')),
      fy2025_utilization_score: toNum(get(row, 'FY 2025 Utilization Score', 'FY2025 Utilization Score', 'FY2025_Utilization_Score')),

      fy2024_total_ssvi: toNum(get(row, 'FY 2024 Total SSVI Score', 'FY2024 Total SSVI', 'FY2024_Total_SSVI', 'Total SSVI FY2024', 'FY2024 SSVI')),
      fy2024_spending_score: toNum(get(row, 'FY 2024 Non-Hospice Spending Score', 'FY2024 Non-Hospice Spending Score', 'FY2024_Spending_Score')),
      fy2024_utilization_score: toNum(get(row, 'FY 2024 Utilization Score', 'FY2024 Utilization Score', 'FY2024_Utilization_Score')),

      fy2025_no_chc_gip: toBool(get(row, 'FY 2025 No CHC or GIP Days', 'FY2025 No CHC or GIP', 'FY2025_No_CHC_GIP')),
      fy2025_nursing_facility: toBool(get(row, 'FY 2025 RHC Days in Nursing Facility', 'FY2025 Nursing Facility', 'FY2025_Nursing_Facility')),
      fy2025_last_two_days: toBool(get(row, 'FY 2025 Visits in Last Two Days', 'FY2025 Last Two Days', 'FY2025_Last_Two_Days')),
      fy2025_los_180: toBool(get(row, 'FY 2025 LOS 180 Days', 'FY2025 LOS 180', 'FY2025_LOS_180', 'FY 2025 Discharges LOS 180')),
      fy2025_live_discharge: toBool(get(row, 'FY 2025 Live Discharge Rate', 'FY2025 Live Discharge', 'FY2025_Live_Discharge')),
      fy2025_sn_minutes: toBool(get(row, 'FY 2025 Skilled Nursing Minutes', 'FY2025 SN Minutes', 'FY2025_SN_Minutes')),
      fy2025_weekend_visits: toBool(get(row, 'FY 2025 Weekend Visits', 'FY2025 Weekend Visits', 'FY2025_Weekend_Visits')),
      fy2025_return_7days: toBool(get(row, 'FY 2025 Return 7 Days', 'FY2025 Return 7 Days', 'FY2025_Return_7Days')),

      fy2025_spending_per_day: toNum(get(row, 'FY 2025 Non-Hospice Spending Per Day', 'FY2025 Spending Per Day', 'FY2025_Spending_Per_Day')),
      fy2025_total_spending: toNum(get(row, 'FY 2025 Total Non-Hospice Spending', 'FY2025 Total Spending', 'FY2025_Total_Spending')),

      fy2024_no_chc_gip: toBool(get(row, 'FY 2024 No CHC or GIP Days', 'FY2024 No CHC or GIP', 'FY2024_No_CHC_GIP')),
      fy2024_nursing_facility: toBool(get(row, 'FY 2024 RHC Days in Nursing Facility', 'FY2024 Nursing Facility', 'FY2024_Nursing_Facility')),
      fy2024_last_two_days: toBool(get(row, 'FY 2024 Visits in Last Two Days', 'FY2024 Last Two Days', 'FY2024_Last_Two_Days')),
      fy2024_los_180: toBool(get(row, 'FY 2024 LOS 180 Days', 'FY2024 LOS 180', 'FY2024_LOS_180')),
      fy2024_live_discharge: toBool(get(row, 'FY 2024 Live Discharge Rate', 'FY2024 Live Discharge', 'FY2024_Live_Discharge')),
      fy2024_sn_minutes: toBool(get(row, 'FY 2024 Skilled Nursing Minutes', 'FY2024 SN Minutes', 'FY2024_SN_Minutes')),
      fy2024_weekend_visits: toBool(get(row, 'FY 2024 Weekend Visits', 'FY2024 Weekend Visits', 'FY2024_Weekend_Visits')),
      fy2024_return_7days: toBool(get(row, 'FY 2024 Return 7 Days', 'FY2024 Return 7 Days', 'FY2024_Return_7Days')),

      fy2024_spending_per_day: toNum(get(row, 'FY 2024 Non-Hospice Spending Per Day', 'FY2024 Spending Per Day', 'FY2024_Spending_Per_Day')),
      fy2024_total_spending: toNum(get(row, 'FY 2024 Total Non-Hospice Spending', 'FY2024 Total Spending', 'FY2024_Total_Spending')),
    };
  }).filter(Boolean);

  console.log(`Mapped ${mapped.length} valid rows (${rows.length - mapped.length} skipped)`);

  if (mapped.length === 0) {
    throw new Error('No rows mapped — check column names above');
  }

  console.log('Step 5: Inserting into Supabase in batches of 500...');
  const BATCH_SIZE = 500;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    const batch = mapped.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(mapped.length / BATCH_SIZE);

    const { error } = await supabase
      .from('ssvi_scores')
      .upsert(batch, { onConflict: 'ccn' });

    if (error) {
      console.error(`❌ Batch ${batchNum}/${totalBatches} failed:`, error.message);
      errors++;
    } else {
      inserted += batch.length;
      console.log(`✅ Batch ${batchNum}/${totalBatches} done (${inserted}/${mapped.length} rows)`);
    }
  }

  console.log(`\n=============================`);
  console.log(`✅ Complete: ${inserted} rows inserted`);
  console.log(`❌ Failed batches: ${errors}`);
  
  const { count } = await supabase
    .from('ssvi_scores')
    .select('*', { count: 'exact', head: true });
  console.log(`📊 Total rows in Supabase: ${count}`);
  console.log(`=============================`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
