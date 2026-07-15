const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');
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
  console.log('Files in ZIP:', entries.map(e => e.entryName).join(', '));

  const xlsxEntry = entries.find(e =>
    e.entryName.toLowerCase().endsWith('.xlsx') ||
    e.entryName.toLowerCase().endsWith('.xls')
  );
  if (!xlsxEntry) throw new Error('No Excel file found in ZIP');

  console.log(`Step 3: Parsing Excel: ${xlsxEntry.entryName}`);
  const workbook = XLSX.read(xlsxEntry.getData(), { type: 'buffer' });
  console.log('Sheets:', workbook.SheetNames.join(', '));

  // Use first sheet (Total SSVI Score)
  const sheetName = workbook.SheetNames[0];
  console.log(`Using sheet: "${sheetName}"`);
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  console.log(`Found ${rows.length} rows`);
  if (rows.length > 0) {
    console.log('ALL column names:', Object.keys(rows[0]).join(' | '));
    console.log('Sample row:', JSON.stringify(rows[0]));
    console.log('Sample row 2:', JSON.stringify(rows[1]));
  }

  // After seeing the actual columns, map them
  const toNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  };

  const toBool = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase().trim();
    if (s === '1' || s === 'yes' || s === 'y' || s === 'true') return true;
    if (s === '0' || s === 'no' || s === 'n' || s === 'false') return false;
    return null;
  };

  // Flexible column getter — tries exact match then case-insensitive
  const get = (row, ...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null) return row[k];
      const found = Object.keys(row).find(rk =>
        rk.toLowerCase().replace(/[\s\n\r_-]/g, '') === k.toLowerCase().replace(/[\s\n\r_-]/g, '')
      );
      if (found && row[found] !== null && row[found] !== undefined) return row[found];
    }
    return null;
  };

  console.log('Step 4: Mapping rows...');
  const mapped = rows.map((row, idx) => {
    const ccn = get(row, 'CCN', 'ccn', 'CMS Certification Number', 'Provider CCN');
    if (!ccn) return null;

    const result = {
      ccn: String(ccn).trim().toUpperCase(),
      hospice_name: get(row,
        'Hospice Name', 'HOSPICE NAME', 'Provider Name', 'Name', 'NAME',
        'Facility Name', 'FACILITY NAME'
      ),
      city: get(row, 'City', 'CITY', 'Provider City'),
      state: get(row, 'State', 'STATE', 'Provider State'),
      urban_rural: get(row, 'Urban/Rural', 'Urban_Rural', 'Urban Rural', 'URBAN_RURAL'),
    };

    // Print all keys for first row so we can see what CMS calls the score columns
    if (idx === 0) {
      console.log('\n=== FIRST ROW FULL DATA ===');
      Object.keys(row).forEach(k => {
        console.log(`  "${k}" = ${JSON.stringify(row[k])}`);
      });
      console.log('=== END FIRST ROW ===\n');
    }

    // Try every possible variation of column names CMS might use
    result.fy2025_total_ssvi = toNum(get(row,
      'FY 2025 Total SSVI Score',
      'FY2025 Total SSVI Score',
      'FY2025 SSVI',
      'FY 2025 SSVI',
      'Total SSVI FY2025',
      'SSVI (Service and Spending Variation Index) Score\r\n(0 = Target Range and 16 = Highest Outliers),\r\nFY2025',
      'SSVI (Service and Spending Variation Index) Score\n(0 = Target Range and 16 = Highest Outliers),\nFY2025'
    ));

    result.fy2025_spending_score = toNum(get(row,
      'FY 2025 Non-Hospice Spending Score',
      'FY2025 Non-Hospice Spending Score',
      'FY2025 Spending Score',
      'Non-Hospice Spending Score\r\n(0 = Lowest and 8 = Highest),\r\nFY2025',
      'Non-Hospice Spending Score\n(0 = Lowest and 8 = Highest),\nFY2025'
    ));

    result.fy2025_utilization_score = toNum(get(row,
      'FY 2025 Utilization Score',
      'FY2025 Utilization Score',
      'Utilization Score\r\n(0 = Target Range and 8 = Highest Outliers),\r\nFY2025',
      'Utilization Score\n(0 = Target Range and 8 = Highest Outliers),\nFY2025'
    ));

    result.fy2024_total_ssvi = toNum(get(row,
      'FY 2024 Total SSVI Score',
      'FY2024 Total SSVI Score',
      'FY2024 SSVI',
      'FY 2024 SSVI',
      'Total SSVI FY2024',
      'SSVI (Service and Spending Variation Index) Score\r\n(0 = Target Range and 16 = Highest Outliers),\r\nFY2024',
      'SSVI (Service and Spending Variation Index) Score\n(0 = Target Range and 16 = Highest Outliers),\nFY2024'
    ));

    result.fy2024_spending_score = toNum(get(row,
      'FY 2024 Non-Hospice Spending Score',
      'FY2024 Non-Hospice Spending Score',
      'Non-Hospice Spending Score\r\n(0 = Lowest and 8 = Highest),\r\nFY2024',
      'Non-Hospice Spending Score\n(0 = Lowest and 8 = Highest),\nFY2024'
    ));

    result.fy2024_utilization_score = toNum(get(row,
      'FY 2024 Utilization Score',
      'FY2024 Utilization Score',
      'Utilization Score\r\n(0 = Target Range and 8 = Highest Outliers),\r\nFY2024',
      'Utilization Score\n(0 = Target Range and 8 = Highest Outliers),\nFY2024'
    ));

    return result;
  }).filter(Boolean);

  console.log(`Mapped ${mapped.length} valid rows`);

  console.log('Step 5: Upserting to Supabase...');
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
  console.log(`❌ Errors: ${errors} batches`);

  const { count } = await supabase.from('ssvi_scores').select('*', { count: 'exact', head: true });
  console.log(`📊 Total in Supabase: ${count}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
