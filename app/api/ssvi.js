export default async function handler(req, res) {
  const { ccn } = req.query;
  if (!ccn) return res.status(400).json({ error: "CCN required" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  try {
    const clean = ccn.trim().toUpperCase();
    const url = `${SUPABASE_URL}/rest/v1/ssvi_scores?ccn=eq.${encodeURIComponent(clean)}&limit=1`;
    const response = await fetch(url, {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `Supabase error: ${text}` });
    }
    const data = await response.json();
    if (data.length === 0) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(data[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export const config = { maxDuration: 10 };
