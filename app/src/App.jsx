import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  FileText, ShieldCheck, MessageSquare, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronRight, Send, Sparkles,
  TrendingUp, TrendingDown, Clock, BookOpen, Loader2,
  Minus, Upload, DollarSign, AlertCircle, X,
  BarChart3, Calendar, Home, PieChart, Files, Library,
  Trash2, Eye, Search, Bot, Activity, Target, Zap,
} from "lucide-react";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

const MODEL = "claude-sonnet-4-6";
const SUPABASE_URL = "https://ojqdfodqffipwtpnvdkz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qcWRmb2RxZmZpcHd0cG52ZGt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0NzI4MzgsImV4cCI6MjA2ODA0ODgzOH0.aFGODMJSCjLlGqLcPtJAaJfcFy0TGxGGHs7v8gu-LBE";

// ─── SUPABASE CCN LOOKUP ──────────────────────────────────────────────────────
async function lookupCCN(ccn) {
  const clean = ccn.trim().toUpperCase();
  const res = await fetch(`/api/ssvi?ccn=${encodeURIComponent(clean)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Lookup failed: ${res.status}`);
  }
  return await res.json();
}
  });
  if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);
  const data = await res.json();
  return data.length > 0 ? data[0] : null;
}

// ─── SUPABASE PLACEHOLDER ─────────────────────────────────────────────────────
const SUPABASE_READY = false;
const DEMO_ORG_ID = "demo_org_001";

async function saveDocumentToLibrary(orgId, doc) {
  if (!SUPABASE_READY) {
    const key = `connectshield_docs_${orgId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    existing.unshift(doc);
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 100)));
    return doc;
  }
}

async function getDocumentLibrary(orgId) {
  if (!SUPABASE_READY) {
    const key = `connectshield_docs_${orgId}`;
    return JSON.parse(localStorage.getItem(key) || "[]");
  }
}

async function deleteDocumentFromLibrary(orgId, docId) {
  if (!SUPABASE_READY) {
    const key = `connectshield_docs_${orgId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.setItem(key, JSON.stringify(existing.filter(d => d.id !== docId)));
    return true;
  }
}

// ─── CLAUDE API ───────────────────────────────────────────────────────────────
async function callClaude(system, userText, maxTokens = 4000) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${txt.substring(0, 300)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(String(data.error));
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  if (!text) throw new Error("Empty response from Claude");
  return text;
}

// ─── 6-STRATEGY JSON PARSER ───────────────────────────────────────────────────
function parseJSON(raw) {
  if (!raw || typeof raw !== "string") return null;
  try { return JSON.parse(raw.trim()); } catch {}
  try { return JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()); } catch {}
  try {
    let depth = 0, start = -1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === "{") { if (depth === 0) start = i; depth++; }
      else if (raw[i] === "}") { depth--; if (depth === 0 && start !== -1) { try { return JSON.parse(raw.substring(start, i + 1)); } catch {} } }
    }
  } catch {}
  try {
    let s = raw.trim();
    const firstBrace = s.indexOf("{");
    if (firstBrace !== -1) {
      s = s.substring(firstBrace);
      const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) s += '"';
      let openBraces = 0, openBrackets = 0, inStr = false;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '"' && (i === 0 || s[i-1] !== '\\')) inStr = !inStr;
        if (!inStr) { if (c === '{') openBraces++; else if (c === '}') openBraces--; else if (c === '[') openBrackets++; else if (c === ']') openBrackets--; }
      }
      s += "]".repeat(Math.max(0, openBrackets));
      s += "}".repeat(Math.max(0, openBraces));
      try { return JSON.parse(s); } catch {}
    }
  } catch {}
  return null;
}

function safeDefault(overrides = {}) {
  return {
    agencyName: "Unknown Agency", providerNumber: "", reportPeriod: "",
    reportsAnalyzed: [], overallComplianceScore: 0, overallRiskLevel: "medium",
    ssviScore: null, ssviUtilizationScore: null, ssviSpendingScore: 3.21,
    ssviIsEstimated: true, ssviFindings: [],
    capData: { capYear: "2026", totalBeneficiaryCount: null, perBeneficiaryCap: 34738.63, capLimit: null, netReimbursement: null, capExposure: null, capUtilizationPct: null },
    psrMetrics: { totalMedicareDays: null, totalClaims: null, totalUnduplicatedCensus: null, avgLengthOfStay: null, snVisitUnits: null, rnUnitsPerDay: null, netReimbursement: null, grossReimbursement: null },
    qualityMetrics: { cahpsOverallScore: null, cahpsNationalAvg: null, pepperOutlierFlags: 0, qapiProjectCount: 0, surveyDeficiencyCount: 0, surveyConditionLevel: false, openDeficiencies: 0 },
    complianceCategories: [], criticalFindings: [], _parseWarning: true, ...overrides,
  };
}

async function callClaudeWithRetry(system, userText, maxTokens, maxRetries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const raw = await callClaude(system, userText, maxTokens);
      const parsed = parseJSON(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      if (attempt === maxRetries) return safeDefault();
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  return safeDefault();
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const severityColor = (s) => s === "high" ? "#D14343" : s === "medium" ? "#C98A1F" : "#2E9E62";
const scoreColor = (s) => s >= 85 ? "#2E9E62" : s >= 70 ? "#C98A1F" : "#D14343";
const ssviColor = (s) => s <= 4 ? "#2E9E62" : s <= 7 ? "#C98A1F" : "#D14343";
const ssviLabel = (s) => s <= 4 ? "Low Risk" : s <= 7 ? "Moderate Risk" : "High Risk";
const statusColor = (s) => s === "good" ? "#2E9E62" : s === "warn" ? "#C98A1F" : "#D14343";
const fmt = (n, dec = 0) => n != null ? Number(n).toLocaleString(undefined, { maximumFractionDigits: dec }) : "—";
const fmtD = (n) => n != null ? `$${fmt(n)}` : "—";

const REPORT_TYPES = [
  { id: "psr", label: "PS&R Summary", color: "#B8863F" },
  { id: "beneficiary", label: "Beneficiary Count", color: "#B8863F" },
  { id: "pepper", label: "PEPPER Report", color: "#6B7FD4" },
  { id: "cahps", label: "CAHPS Survey", color: "#6B7FD4" },
  { id: "qapi", label: "QAPI Documents", color: "#2E9E62" },
  { id: "policy", label: "Policy Manuals", color: "#2E9E62" },
  { id: "survey", label: "Survey Results", color: "#D14343" },
  { id: "cms_public", label: "CMS Public Data", color: "#64708A" },
];

function getReportTypeLabel(id) { return REPORT_TYPES.find(r => r.id === id)?.label || id; }

function detectReportType(filename, text) {
  const fn = filename.toLowerCase();
  const tx = (text || "").toLowerCase().substring(0, 2000);
  if (fn.includes("pepper") || tx.includes("program for evaluating payment")) return "pepper";
  if (fn.includes("cahps") || tx.includes("cahps") || tx.includes("consumer assessment of healthcare")) return "cahps";
  if (fn.includes("qapi") || tx.includes("quality assurance and performance improvement")) return "qapi";
  if (fn.includes("survey") || tx.includes("statement of deficiencies") || tx.includes("cms-2567")) return "survey";
  if (fn.includes("policy") || fn.includes("manual") || fn.includes("procedure")) return "policy";
  if (fn.includes("beneficiar") || fn.includes("b51562") || fn.includes("hcr01") || tx.includes("beneficiary count summary") || tx.includes("fractional beneficiary") || tx.includes("cap year")) return "beneficiary";
  if (fn.includes("compare") || tx.includes("hospice compare")) return "cms_public";
  if (tx.includes("provider statistical and reimbursement") || tx.includes("provider summary report") || tx.includes("statistic section") || tx.includes("medicare days") || fn.includes("summary25")) return "psr";
  return "psr";
}

// ─── PDF EXTRACTION ───────────────────────────────────────────────────────────
async function extractPDFText(file) {
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const ab = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(" ") + "\n";
  }
  return text;
}

// ─── PROMPTS ──────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT_1 = `You are a Medicare hospice compliance expert for Connect Shield, an executive compliance intelligence platform.

PS&R REPORT 810 STRUCTURE — extract these exact fields:
STATISTIC SECTION: MEDICARE DAYS | CLAIMS | TOTAL UNDUPLICATED CENSUS COUNT (each has multiple period columns)
CHARGE SECTION: 0551=Skilled Nursing 15-min units | 0561=Social Work | 0571=Aide | 0651=RHC days | 0250=Pharmacy
REIMBURSEMENT SECTION: GROSS REIMBURSEMENT | SEQUESTRATION | NET REIMBURSEMENT

BENEFICIARY COUNT B51562: Cap Year | Full Count | Fractional Count | Total Count table

CALCULATIONS:
- AvgLOS = Medicare Days ÷ Unduplicated Census
- RN intensity = Rev 0551 units ÷ Medicare Days (flag under 1.0)
- CAP limit = Total Beneficiaries × per-cap (FY2025=$34,159.74, FY2026=$34,738.63)
- CAP exposure = Net Reimbursement − CAP limit
- CAP utilization% = (Net Reimbursement ÷ CAP limit) × 100

SSVI UTILIZATION SCORE (0-8): Start 0. RN<0.75→+3, 0.75-1.0→+2, 1.0-1.5→+1. AvgLOS>180→+2, 120-180→+1. GIP>10%→+1. Cap at 8.
SSVI Spending Score = 3.21 unless actual CMS data provided.
Total SSVI = Utilization + Spending. National avg = 6.42.

OVERALL SCORE (0-100): Start 85. CAP exceeded→-20. CAP 85-100%→-10. RN<0.75→-15. RN 0.75-1.0→-8. SSVI>10→-10. SSVI 8-10→-5. Declining RN→-5.

Return ONLY valid JSON starting with { ending with }. No markdown. Complete the entire JSON:

{"agencyName":"string","providerNumber":"string","reportPeriod":"string","reportsAnalyzed":["list"],"overallComplianceScore":0,"overallRiskLevel":"medium","ssviScore":0,"ssviUtilizationScore":0,"ssviSpendingScore":3.21,"ssviIsEstimated":true,"ssviFindings":[{"measure":"string","detail":"string","status":"warn"}],"capData":{"capYear":"2026","totalBeneficiaryCount":null,"perBeneficiaryCap":34738.63,"capLimit":null,"netReimbursement":null,"capExposure":null,"capUtilizationPct":null},"psrMetrics":{"totalMedicareDays":null,"totalClaims":null,"totalUnduplicatedCensus":null,"avgLengthOfStay":null,"snVisitUnits":null,"rnUnitsPerDay":null,"netReimbursement":null,"grossReimbursement":null},"qualityMetrics":{"cahpsOverallScore":null,"cahpsNationalAvg":null,"pepperOutlierFlags":0,"qapiProjectCount":0,"surveyDeficiencyCount":0,"surveyConditionLevel":false,"openDeficiencies":0},"complianceCategories":[{"id":"rn_intensity","label":"RN Visit Intensity","score":0,"source":"PS&R 810","riskLevel":"medium","clawbackAmount":0,"summary":"string","factors":[{"weight":60,"label":"string","status":"warn","detail":"string"},{"weight":40,"label":"string","status":"warn","detail":"string"}],"actions":["string"]},{"id":"cap_exposure","label":"Medicare CAP Exposure","score":0,"source":"PS&R + Beneficiary Count","riskLevel":"high","clawbackAmount":0,"summary":"string","factors":[{"weight":70,"label":"string","status":"warn","detail":"string"},{"weight":30,"label":"string","status":"good","detail":"string"}],"actions":["string"]},{"id":"length_of_stay","label":"Length of Stay","score":0,"source":"PS&R 810","riskLevel":"low","clawbackAmount":0,"summary":"string","factors":[{"weight":60,"label":"string","status":"good","detail":"string"},{"weight":40,"label":"string","status":"good","detail":"string"}],"actions":["string"]},{"id":"billing_trend","label":"Billing Trend","score":0,"source":"PS&R 810","riskLevel":"low","clawbackAmount":0,"summary":"string","factors":[{"weight":50,"label":"string","status":"good","detail":"string"},{"weight":50,"label":"string","status":"good","detail":"string"}],"actions":["string"]}]}

Use ACTUAL numbers. Calculate precisely. Keep strings under 25 words.`;

const SYSTEM_PROMPT_2 = `You are a Medicare hospice compliance expert. Generate 3 more compliance categories and 3 critical findings. Keep strings under 25 words. Return ONLY valid JSON:

{"complianceCategories":[{"id":"level_of_care","label":"Level of Care Mix","score":90,"source":"PS&R 810","riskLevel":"low","clawbackAmount":0,"summary":"string","factors":[{"weight":60,"label":"string","status":"good","detail":"string"},{"weight":40,"label":"string","status":"good","detail":"string"}],"actions":["string"]},{"id":"survey_readiness","label":"Survey Readiness","score":75,"source":"General Assessment","riskLevel":"medium","clawbackAmount":0,"summary":"string","factors":[{"weight":50,"label":"string","status":"good","detail":"string"},{"weight":50,"label":"string","status":"warn","detail":"string"}],"actions":["string"]},{"id":"pharmacy_utilization","label":"Pharmacy & Ancillary","score":80,"source":"PS&R 810","riskLevel":"low","clawbackAmount":0,"summary":"string","factors":[{"weight":60,"label":"string","status":"good","detail":"string"},{"weight":40,"label":"string","status":"good","detail":"string"}],"actions":["string"]}],"criticalFindings":[{"severity":"high","category":"string","source":"string","finding":"string under 25 words","recommendation":"string under 20 words","clawbackRisk":0},{"severity":"high","category":"string","source":"string","finding":"string under 25 words","recommendation":"string under 20 words","clawbackRisk":0},{"severity":"medium","category":"string","source":"string","finding":"string under 25 words","recommendation":"string under 20 words","clawbackRisk":0}]}

Use real numbers from the report data provided.`;

// ─── SSVI MEASURE DEFINITIONS ─────────────────────────────────────────────────
const SSVI_MEASURES = [
  { key: "no_chc_gip", label: "No CHC or GIP Days", description: "Hospice billed no continuous home care or general inpatient days", flagThreshold: "Flagged if hospice has zero CHC and zero GIP days", remedy: "Ensure crisis care levels are being utilized and documented appropriately for eligible patients" },
  { key: "nursing_facility", label: "RHC Days in Nursing Facility", description: "Percentage of routine home care days delivered in a nursing facility", flagThreshold: "Flagged at ≥40% of RHC days in nursing facility", remedy: "Review patient mix and ensure community-based patients are being admitted appropriately" },
  { key: "last_two_days", label: "Visits in Last Two RHC Days of Life", description: "Percentage of patients who received a skilled visit in the last two days of life", flagThreshold: "Flagged at ≤87.5% (FY2025) — must be above this threshold", remedy: "Implement end-of-life visit protocols ensuring skilled nurse contact in final 48 hours" },
  { key: "los_180", label: "Discharges with LOS ≥180 Days", description: "Percentage of discharged patients who had a length of stay of 180+ days", flagThreshold: "Flagged at ≥33.3% of discharges with LOS over 180 days", remedy: "Conduct eligibility reviews at 180-day mark; strengthen terminal prognosis documentation" },
  { key: "live_discharge", label: "Live Discharge Rate", description: "Percentage of discharges that were live (patient left hospice while still alive)", flagThreshold: "Flagged at ≥46.7% live discharge rate", remedy: "Review admission criteria; ensure patients genuinely meet 6-month prognosis requirement" },
  { key: "sn_minutes", label: "Skilled Nursing Minutes per RHC Day", description: "Average skilled nursing minutes delivered per routine home care day", flagThreshold: "Flagged at ≤9.9 minutes per RHC day — must be above this", remedy: "Increase RN visit frequency and duration; ensure all skilled nursing time is documented and billed" },
  { key: "weekend_visits", label: "Weekend RHC Days with Skilled Visit", description: "Percentage of weekend routine home care days that included a skilled visit", flagThreshold: "Flagged at ≤4.8% of weekend days having skilled visits", remedy: "Build weekend visit staffing protocols; schedule regular skilled nurse weekend rounds" },
  { key: "return_7days", label: "Live Discharges Returning in 7 Days", description: "Percentage of live discharges who returned to the same hospice within 7 days", flagThreshold: "Flagged at ≥18.2% of live discharges returning within 7 days", remedy: "Review discharge planning process; ensure patients are not being cycled inappropriately" },
];

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 84, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score || 0));
  const color = scoreColor(pct);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E3E7ED" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c - (pct/100)*c}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fontFamily="IBM Plex Mono, monospace" fontSize={size * 0.26} fontWeight="600" fill="#16202E">{pct}</text>
    </svg>
  );
}

function SSVIRing({ score, size = 84, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(16, score || 0));
  const color = ssviColor(pct);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E3E7ED" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c - ((pct/16)*c)}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      <text x="50%" y="45%" textAnchor="middle" dominantBaseline="central"
        fontFamily="IBM Plex Mono, monospace" fontSize={size * 0.26} fontWeight="600" fill="#16202E">{pct}</text>
      <text x="50%" y="68%" textAnchor="middle" dominantBaseline="central"
        fontFamily="IBM Plex Mono, monospace" fontSize={size * 0.14} fill="#64708A">/16</text>
    </svg>
  );
}

function RiskBadge({ level, clawback }) {
  if (!level) return null;
  const isHigh = level === "high", isMed = level === "medium";
  const bg = isHigh ? "#FDECEA" : isMed ? "#FEF3E2" : "#EAF6EF";
  const color = isHigh ? "#D14343" : isMed ? "#C98A1F" : "#2E9E62";
  return (
    <div className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5"
      style={{ background: bg, border: `1px solid ${color}30` }}>
      <span>{isHigh ? "🔴" : isMed ? "🟡" : "🟢"}</span>
      <span className="text-sm font-mono font-semibold" style={{ color }}>
        {isHigh ? "High" : isMed ? "Medium" : "Low"} Audit Risk
      </span>
      {clawback > 0 && <span className="text-sm font-mono" style={{ color }}>· Clawback: <strong>{fmtD(clawback)}</strong></span>}
    </div>
  );
}

// ─── CCN LOOKUP FIELD ─────────────────────────────────────────────────────────
function CCNLookup({ onSSVIData, compact = false }) {
  const [ccn, setCcn] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleLookup = async () => {
    if (!ccn.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await lookupCCN(ccn.trim());
      if (!data) {
        setError(`No SSVI data found for CCN "${ccn.trim()}". Check the CCN and try again.`);
      } else {
        setResult(data);
        if (onSSVIData) onSSVIData(data);
      }
    } catch (e) {
      setError("Lookup error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#B8863F" }}>
          CMS Certification Number (CCN) Lookup
        </div>
        <div className="flex gap-2">
          <input
            value={ccn}
            onChange={(e) => setCcn(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            placeholder="Enter your CCN (e.g. B51562) — pulls your actual published CMS SSVI score instantly"
            className="flex-1 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none"
            style={{ background: "#FFFFFF", border: "1.5px solid #C7CDD8", color: "#16202E", fontSize: "13px" }}
          />
          <button
            onClick={handleLookup}
            disabled={loading || !ccn.trim()}
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shrink-0"
            style={{ background: ccn.trim() ? "#14213D" : "#E3E7ED", color: ccn.trim() ? "#F3F5F8" : "#8992A3" }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {loading ? "Looking up…" : "Look Up"}
          </button>
        </div>
        <div className="text-xs font-mono mt-1.5" style={{ color: "#8992A3" }}>
          Your CCN is on your PS&R report next to your provider name · All 7,059 US hospices in our database · Zero PHI
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
          <AlertCircle size={15} color="#D14343" className="shrink-0 mt-0.5" />
          <span className="text-sm" style={{ color: "#B23A2E" }}>{error}</span>
        </div>
      )}

      {result && (
        <div className="rounded-xl p-4" style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} color="#2E9E62" />
            <span className="text-sm font-medium" style={{ color: "#1A6E41" }}>
              Found: {result.hospice_name} · CCN {result.ccn}
            </span>
          </div>
          <div className="flex gap-4 flex-wrap">
            <div className="text-xs font-mono" style={{ color: "#1A6E41" }}>
              FY2025 SSVI: <strong>{result.fy2025_total_ssvi ?? "—"}/16</strong>
              {result.fy2025_total_ssvi != null && ` (${ssviLabel(result.fy2025_total_ssvi)})`}
            </div>
            <div className="text-xs font-mono" style={{ color: "#1A6E41" }}>
              FY2024 SSVI: <strong>{result.fy2024_total_ssvi ?? "—"}/16</strong>
            </div>
            {result.fy2025_total_ssvi != null && result.fy2024_total_ssvi != null && (
              <div className="text-xs font-mono" style={{ color: result.fy2025_total_ssvi > result.fy2024_total_ssvi ? "#D14343" : "#2E9E62" }}>
                {result.fy2025_total_ssvi > result.fy2024_total_ssvi ? "↑" : "↓"} {Math.abs(result.fy2025_total_ssvi - result.fy2024_total_ssvi)} pts year-over-year
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SSVI BREAKDOWN PANEL ─────────────────────────────────────────────────────
function SSVIBreakdownPanel({ ssviData, estimatedData }) {
  const [open, setOpen] = useState(true);

  const hasReal = ssviData != null;
  const score25 = hasReal ? ssviData.fy2025_total_ssvi : estimatedData?.ssviScore;
  const util25 = hasReal ? ssviData.fy2025_utilization_score : estimatedData?.ssviUtilizationScore;
  const spend25 = hasReal ? ssviData.fy2025_spending_score : estimatedData?.ssviSpendingScore;
  const score24 = hasReal ? ssviData.fy2024_total_ssvi : null;

  if (score25 == null && score24 == null) return null;

  const getMeasureStatus = (key, fy = "fy2025") => {
    if (!hasReal) return null;
    return ssviData[`${fy}_${key}`];
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 text-left">
        <div className="flex items-center gap-3">
          <SSVIRing score={score25 || 0} size={56} stroke={6} />
          <div>
            <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "#64708A" }}>SSVI — Service &amp; Spending Variation Index</div>
            <div className="text-lg mt-0.5" style={{ fontFamily: "Fraunces, serif", color: "#16202E" }}>
              {ssviLabel(score25 || 0)} · {score25 ?? "—"}/16
              {!hasReal && <span className="text-sm font-mono ml-2" style={{ color: "#64708A" }}>(estimated from PS&R)</span>}
              {hasReal && <span className="text-xs font-mono ml-2 px-2 py-0.5 rounded" style={{ background: "#EAF6EF", color: "#2E9E62" }}>✓ CMS Published Score</span>}
            </div>
            <div className="text-xs font-mono mt-0.5" style={{ color: "#64708A" }}>
              National avg: 6.42 · Median: 7 · Scores ≥10 trigger CMS program integrity review
              {score24 != null && ` · FY2024: ${score24}/16`}
            </div>
          </div>
        </div>
        {open ? <ChevronDown size={18} color="#64708A" /> : <ChevronRight size={18} color="#64708A" />}
      </button>

      {open && (
        <div className="px-5 pb-6 pt-1 space-y-5" style={{ borderTop: "1px solid #E3E7ED" }}>
          {/* Subscores */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-4" style={{ background: "#F5F6F8" }}>
              <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>Utilization Score</div>
              <div className="text-2xl font-mono mt-1" style={{ color: ssviColor(util25 || 0) }}>{util25 ?? "—"}<span className="text-sm">/8</span></div>
              <div className="text-xs font-mono mt-0.5" style={{ color: "#64708A" }}>Based on 8 claims-based utilization measures</div>
            </div>
            <div className="rounded-xl p-4" style={{ background: "#F5F6F8" }}>
              <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>Non-Hospice Spending Score{!hasReal && " (est.)"}</div>
              <div className="text-2xl font-mono mt-1" style={{ color: ssviColor(spend25 || 0) }}>{spend25 ?? "—"}<span className="text-sm">/8</span></div>
              <div className="text-xs font-mono mt-0.5" style={{ color: "#64708A" }}>Part A/B spending for enrolled beneficiaries</div>
            </div>
          </div>

          {/* 9 Measures breakdown */}
          <div>
            <div className="text-xs uppercase tracking-widest font-mono mb-3" style={{ color: "#64708A" }}>
              The 9 CMS SSVI Measures — FY2025 Scoring Breakdown
            </div>
            <div className="space-y-3">
              {SSVI_MEASURES.map((measure, i) => {
                const flagged = hasReal ? getMeasureStatus(measure.key) : null;
                const points = flagged === true ? 1 : 0;
                return (
                  <div key={measure.key} className="rounded-xl p-4"
                    style={{ background: flagged === true ? "#FDECEA" : flagged === false ? "#EAF6EF" : "#F5F6F8", border: `1px solid ${flagged === true ? "#F3B8AC" : flagged === false ? "#A8DFC0" : "#E3E7ED"}` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded"
                            style={{ background: flagged === true ? "#D14343" : flagged === false ? "#2E9E62" : "#64708A", color: "#FFFFFF" }}>
                            Measure {i + 1}
                          </span>
                          {flagged === true && <span className="text-[11px] font-mono" style={{ color: "#D14343" }}>+1 POINT (flagged)</span>}
                          {flagged === false && <span className="text-[11px] font-mono" style={{ color: "#2E9E62" }}>0 POINTS (passing)</span>}
                          {flagged === null && <span className="text-[11px] font-mono" style={{ color: "#8992A3" }}>Upload CCN for actual score</span>}
                        </div>
                        <div className="text-sm font-medium mt-1" style={{ color: "#16202E" }}>{measure.label}</div>
                        <div className="text-xs mt-1" style={{ color: "#64708A" }}>{measure.description}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid md:grid-cols-2 gap-2">
                      <div className="rounded-lg p-2.5" style={{ background: "rgba(0,0,0,0.04)" }}>
                        <div className="text-[10px] font-mono uppercase" style={{ color: "#8992A3" }}>CMS Flag Threshold</div>
                        <div className="text-xs mt-0.5" style={{ color: "#16202E" }}>{measure.flagThreshold}</div>
                      </div>
                      <div className="rounded-lg p-2.5" style={{ background: "rgba(0,0,0,0.04)" }}>
                        <div className="text-[10px] font-mono uppercase" style={{ color: "#B8863F" }}>Proposed Remedy</div>
                        <div className="text-xs mt-0.5" style={{ color: "#16202E" }}>{measure.remedy}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Year over year */}
          {score24 != null && score25 != null && (
            <div className="rounded-xl p-4" style={{ background: "#F5F6F8" }}>
              <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#64708A" }}>Year-Over-Year Trend</div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-xs font-mono" style={{ color: "#8992A3" }}>FY2024</div>
                  <div className="text-2xl font-mono" style={{ color: ssviColor(score24) }}>{score24}</div>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-lg font-mono" style={{ color: score25 > score24 ? "#D14343" : "#2E9E62" }}>
                    {score25 > score24 ? "↑" : "↓"} {Math.abs(score25 - score24)} pts
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-mono" style={{ color: "#8992A3" }}>FY2025</div>
                  <div className="text-2xl font-mono" style={{ color: ssviColor(score25) }}>{score25}</div>
                </div>
              </div>
              {score25 > score24 && (
                <div className="mt-2 text-xs font-mono" style={{ color: "#D14343" }}>
                  ⚠ Score increased {score25 - score24} points year-over-year — rising SSVI indicates increasing CMS scrutiny
                </div>
              )}
            </div>
          )}

          {!hasReal && (
            <div className="rounded-xl p-3" style={{ background: "#F5F6F8" }}>
              <div className="text-xs font-mono" style={{ color: "#64708A" }}>
                <strong>To see actual CMS measure flags:</strong> Enter your CCN in the lookup field above. Your actual published SSVI score will replace this estimate and show exactly which of the 9 measures you were flagged on with your specific values.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ analysisData, ssviData }) {
  const [openId, setOpenId] = useState(null);
  const [ccnResult, setCcnResult] = useState(ssviData);

  useEffect(() => { setCcnResult(ssviData); }, [ssviData]);

  const hasAnyData = analysisData || ccnResult;

  if (!hasAnyData) {
    return (
      <div className="space-y-6">
        {/* Empty state hero */}
        <div className="rounded-2xl p-10 text-center" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "#F7F0E1" }}>
            <ShieldCheck size={28} color="#B8863F" />
          </div>
          <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl mb-2">
            Welcome to Connect Shield
          </div>
          <p className="text-sm max-w-lg mx-auto" style={{ color: "#64708A" }}>
            Your executive compliance intelligence platform. Enter your CCN below for instant SSVI lookup, or upload your CMS reports for a full AI-powered compliance analysis.
          </p>
        </div>

        {/* CCN lookup on dashboard */}
        <div className="rounded-2xl p-6" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <CCNLookup onSSVIData={(data) => { setCcnResult(data); }} />
        </div>

        {/* Quick stats placeholder */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["SSVI Score", "CAP Utilization", "RN Intensity", "Compliance Index"].map(label => (
            <div key={label} className="rounded-xl p-4" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED" }}>
              <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{label}</div>
              <div className="text-2xl font-mono mt-1" style={{ color: "#C7CDD8" }}>—</div>
              <div className="text-[11px] font-mono mt-1" style={{ color: "#C7CDD8" }}>Upload reports to populate</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const d = analysisData;
  const cap = d?.capData || {};
  const metrics = d?.psrMetrics || {};
  const quality = d?.qualityMetrics || {};
  const categories = d?.complianceCategories || [];
  const findings = d?.criticalFindings || [];

  // Merge real SSVI data if available
  const effectiveSsviScore = ccnResult?.fy2025_total_ssvi ?? d?.ssviScore;
  const effectiveSsviUtil = ccnResult?.fy2025_utilization_score ?? d?.ssviUtilizationScore;
  const effectiveSsviSpend = ccnResult?.fy2025_spending_score ?? d?.ssviSpendingScore;
  const isRealSsvi = ccnResult?.fy2025_total_ssvi != null;
  const agencyName = ccnResult?.hospice_name || d?.agencyName || "Unknown Agency";

  return (
    <div className="space-y-5">
      {d?._parseWarning && (
        <div className="rounded-xl p-3 flex items-start gap-3" style={{ background: "#FEF3E2", border: "1px solid #F0C87A" }}>
          <AlertCircle size={15} color="#C98A1F" className="shrink-0 mt-0.5" />
          <div className="text-sm" style={{ color: "#7A5700" }}>
            <strong>Tip:</strong> Upload both PS&R Report 810 and Beneficiary Count B51562 together for the most complete analysis. Enter your CCN above for actual published SSVI scores.
          </div>
        </div>
      )}

      {/* CCN lookup bar always visible on dashboard */}
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <CCNLookup onSSVIData={(data) => setCcnResult(data)} />
      </div>

      {/* Main scorecard */}
      {d && (
        <div className="rounded-2xl p-6" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-start gap-5 flex-wrap">
            {d.overallComplianceScore > 0 && <ScoreRing score={d.overallComplianceScore} size={96} stroke={9} />}
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "#64708A" }}>Composite Compliance Index</div>
              <div className="text-2xl mt-1" style={{ fontFamily: "Fraunces, serif", color: "#16202E" }}>{agencyName}</div>
              {d.reportPeriod && <div className="text-sm mt-0.5 font-mono" style={{ color: "#64708A" }}>Period: {d.reportPeriod}</div>}
              {d.overallRiskLevel && <div className="mt-2"><RiskBadge level={d.overallRiskLevel} clawback={cap.capExposure || 0} /></div>}
            </div>
          </div>
          {d.reportsAnalyzed?.length > 0 && (
            <div className="flex gap-2 mt-4 flex-wrap">
              {d.reportsAnalyzed.map(r => (
                <span key={r} className="text-xs font-mono px-2 py-1 rounded"
                  style={{ background: "#EAF6EF", color: "#2E9E62", border: "1px solid #A8DFC0" }}>✓ {r}</span>
              ))}
              {isRealSsvi && (
                <span className="text-xs font-mono px-2 py-1 rounded"
                  style={{ background: "#F7F0E1", color: "#B8863F", border: "1px solid #E8CFA0" }}>✓ CMS SSVI Score (CCN {ccnResult.ccn})</span>
              )}
            </div>
          )}
          {categories.length > 0 && (
            <div className="w-full flex flex-wrap gap-2 pt-4 mt-4 border-t" style={{ borderColor: "#E3E7ED" }}>
              {categories.map(c => (
                <button key={c.id} onClick={() => setOpenId(openId === c.id ? null : c.id)}
                  className="text-left rounded-lg px-3 py-2 transition-colors"
                  style={{ background: openId === c.id ? "#F7F0E1" : "transparent", border: `1px solid ${openId === c.id ? "#E8CFA0" : "#E3E7ED"}`, flex: "1 1 140px", minWidth: 0 }}>
                  <div className="text-[11px] font-mono truncate" style={{ color: "#64708A" }}>{c.label}</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-mono" style={{ color: scoreColor(c.score) }}>{c.score}</span>
                    {c.clawbackAmount > 0 && <span className="text-[11px] font-mono" style={{ color: "#D14343" }}>⚠ {fmtD(c.clawbackAmount)}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SSVI Full Breakdown */}
      <SSVIBreakdownPanel
        ssviData={isRealSsvi ? ccnResult : null}
        estimatedData={d ? { ssviScore: effectiveSsviScore, ssviUtilizationScore: effectiveSsviUtil, ssviSpendingScore: effectiveSsviSpend } : null}
      />

      {/* CAP */}
      {(cap.capLimit != null || cap.netReimbursement != null) && (
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2 mb-4">
            <PieChart size={16} color="#B8863F" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Medicare Aggregate CAP — Cap Year {cap.capYear}</span>
            {cap.capExposure > 0 && <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "#FDECEA", color: "#D14343" }}>🔴 EXCEEDED</span>}
          </div>
          {cap.capUtilizationPct != null && (
            <>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-mono" style={{ color: "#16202E" }}>Cap Utilization</span>
                <span className="text-sm font-mono font-bold" style={{ color: cap.capUtilizationPct >= 100 ? "#D14343" : cap.capUtilizationPct >= 85 ? "#C98A1F" : "#2E9E62" }}>
                  {Number(cap.capUtilizationPct).toFixed(1)}%
                </span>
              </div>
              <div className="w-full rounded-full h-2.5" style={{ background: "#E3E7ED" }}>
                <div className="h-2.5 rounded-full transition-all"
                  style={{ width: `${Math.min(cap.capUtilizationPct, 100)}%`, background: cap.capUtilizationPct >= 100 ? "#D14343" : cap.capUtilizationPct >= 85 ? "#C98A1F" : "#2E9E62" }} />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Total Beneficiaries", value: cap.totalBeneficiaryCount ? Number(cap.totalBeneficiaryCount).toFixed(4) : "—", warn: false },
              { label: "Per-Beneficiary Cap", value: fmtD(cap.perBeneficiaryCap), warn: false },
              { label: "Aggregate Cap Limit", value: fmtD(cap.capLimit), warn: false },
              { label: "Net Reimbursement", value: fmtD(cap.netReimbursement), warn: cap.capExposure > 0 },
            ].map((m, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: m.warn ? "#FEF3E2" : "#F5F6F8" }}>
                <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
                <div className="text-base font-mono mt-1" style={{ color: m.warn ? "#C98A1F" : "#16202E" }}>{m.value}</div>
              </div>
            ))}
          </div>
          {cap.capExposure > 0 && (
            <div className="mt-3 p-4 rounded-xl" style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
              <div className="text-sm font-semibold" style={{ color: "#D14343" }}>🔴 CAP EXCEEDED — {fmtD(cap.capExposure)} owed to CMS</div>
              <div className="text-sm mt-1" style={{ color: "#B23A2E" }}>Net reimbursement exceeds aggregate cap. CMS will initiate clawback. Remittance required within 60 days of cap year close. Contact your MAC immediately.</div>
            </div>
          )}
          {!cap.capExposure && cap.capLimit > 0 && cap.netReimbursement > 0 && (
            <div className="mt-3 p-3 rounded-xl flex items-center gap-3" style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
              <CheckCircle2 size={16} color="#2E9E62" className="shrink-0" />
              <div className="text-sm" style={{ color: "#1A6E41" }}>Under cap. Remaining headroom: {fmtD(cap.capLimit - cap.netReimbursement)}.</div>
            </div>
          )}
        </div>
      )}

      {/* PS&R Key Metrics */}
      {metrics && Object.values(metrics).some(v => v != null) && (
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} color="#B8863F" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Leading Indicators — SSVI Risk Drivers</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Medicare Days", value: metrics.totalMedicareDays != null ? fmt(metrics.totalMedicareDays) : "—", warn: false, sub: "Total RHC days billed" },
              { label: "Unduplicated Census", value: metrics.totalUnduplicatedCensus != null ? fmt(metrics.totalUnduplicatedCensus) : "—", warn: false, sub: "Unique patients served" },
              { label: "Avg Length of Stay", value: metrics.avgLengthOfStay != null ? `${metrics.avgLengthOfStay} days` : "—", warn: metrics.avgLengthOfStay > 180, sub: "Nat'l avg ~89 days" },
              { label: "SN Units (Rev 0551)", value: metrics.snVisitUnits != null ? fmt(metrics.snVisitUnits) : "—", warn: false, sub: "15-min nursing increments" },
              { label: "RN Intensity", value: metrics.rnUnitsPerDay != null ? `${metrics.rnUnitsPerDay} u/day` : "—", warn: metrics.rnUnitsPerDay < 1.0, sub: metrics.rnUnitsPerDay < 1.0 ? "⚠ Below 1.0 SSVI threshold" : "≥1.0 passing" },
              { label: "Total Claims", value: metrics.totalClaims != null ? fmt(metrics.totalClaims) : "—", warn: false, sub: "Medicare claims filed" },
              { label: "Gross Reimbursement", value: fmtD(metrics.grossReimbursement), warn: false, sub: "Before sequestration" },
              { label: "Net Reimbursement", value: fmtD(metrics.netReimbursement), warn: false, sub: "After 2% sequestration" },
            ].map((m, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: m.warn ? "#FEF3E2" : "#F5F6F8" }}>
                <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
                <div className="text-base font-mono mt-1 font-semibold" style={{ color: m.warn ? "#C98A1F" : "#16202E" }}>{m.value}</div>
                {m.sub && <div className="text-[10px] font-mono mt-0.5" style={{ color: m.warn ? "#C98A1F" : "#8992A3" }}>{m.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quality */}
      {(quality.cahpsOverallScore != null || quality.surveyDeficiencyCount > 0 || quality.pepperOutlierFlags > 0) && (
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Target size={16} color="#B8863F" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Quality &amp; Survey Metrics</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "CAHPS Score", value: quality.cahpsOverallScore != null ? `${quality.cahpsOverallScore}%` : "—", warn: quality.cahpsOverallScore < 75, sub: quality.cahpsNationalAvg ? `Nat'l: ${quality.cahpsNationalAvg}%` : "Upload CAHPS report" },
              { label: "Survey Deficiencies", value: quality.surveyDeficiencyCount ?? "—", warn: quality.surveyDeficiencyCount > 0, sub: quality.surveyConditionLevel ? "⚠ Condition-level cited" : quality.openDeficiencies > 0 ? `${quality.openDeficiencies} open` : "All closed" },
              { label: "PEPPER Flags", value: quality.pepperOutlierFlags ?? "—", warn: quality.pepperOutlierFlags > 0, sub: quality.pepperOutlierFlags > 0 ? "Above outlier threshold" : "Within normal range" },
              { label: "QAPI Projects", value: quality.qapiProjectCount ?? "—", warn: quality.qapiProjectCount === 0, sub: quality.qapiProjectCount > 0 ? "Active PIPs documented" : "No active PIPs found" },
            ].map((m, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: m.warn ? "#FEF3E2" : "#F5F6F8" }}>
                <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
                <div className="text-lg font-mono mt-1 font-semibold" style={{ color: m.warn ? "#C98A1F" : "#16202E" }}>{m.value}</div>
                {m.sub && <div className="text-[10px] font-mono mt-0.5" style={{ color: m.warn ? "#C98A1F" : "#8992A3" }}>{m.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical Findings */}
      {findings.length > 0 && (
        <div className="rounded-2xl p-5 space-y-3" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} color="#D14343" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Critical Findings</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded ml-auto" style={{ background: "#FDECEA", color: "#D14343" }}>{findings.filter(f => f.severity === "high").length} High Priority</span>
          </div>
          {findings.map((f, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-xl" style={{ background: "#F5F6F8" }}>
              <span className="text-[10px] uppercase font-mono px-2 py-1 rounded shrink-0 h-fit"
                style={{ background: severityColor(f.severity) + "1A", color: severityColor(f.severity) }}>{f.severity}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="text-xs font-mono" style={{ color: "#B8863F" }}>{f.category}</div>
                  {f.source && <div className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#E3E7ED", color: "#64708A" }}>{f.source}</div>}
                </div>
                <div className="text-sm" style={{ color: "#16202E" }}>{f.finding}</div>
                <div className="text-sm mt-1" style={{ color: "#64708A" }}>→ {f.recommendation}</div>
                {f.clawbackRisk > 0 && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded"
                    style={{ background: "#FDECEA", color: "#D14343" }}>
                    <DollarSign size={11} />Clawback Risk: {fmtD(f.clawbackRisk)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Drill-Down */}
      {categories.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest font-mono px-1" style={{ color: "#64708A" }}>Compliance Category Breakdown</div>
          {categories.map(cat => {
            const open = openId === cat.id;
            return (
              <div key={cat.id} className="rounded-2xl overflow-hidden"
                style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
                <button onClick={() => setOpenId(open ? null : cat.id)}
                  className="w-full flex items-center gap-4 p-4 text-left">
                  <ScoreRing score={cat.score} size={48} stroke={5} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-base">{cat.label}</span>
                      {cat.source && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#E3E7ED", color: "#64708A" }}>{cat.source}</span>}
                      {cat.clawbackAmount > 0 && <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "#FDECEA", color: "#D14343" }}>🔴 {fmtD(cat.clawbackAmount)}</span>}
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "#64708A" }}>{cat.summary}</p>
                  </div>
                  <div className={`text-xs font-mono px-2 py-1 rounded shrink-0`}
                    style={{ background: cat.riskLevel === "high" ? "#FDECEA" : cat.riskLevel === "medium" ? "#FEF3E2" : "#EAF6EF", color: severityColor(cat.riskLevel) }}>
                    {cat.riskLevel}
                  </div>
                  {open ? <ChevronDown size={16} color="#64708A" /> : <ChevronRight size={16} color="#64708A" />}
                </button>
                {open && (
                  <div className="px-4 pb-5 pt-1 space-y-4" style={{ borderTop: "1px solid #E3E7ED" }}>
                    {cat.factors?.length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-widest font-mono mt-3 mb-2" style={{ color: "#64708A" }}>Scoring Factors</div>
                        <div className="space-y-2">
                          {cat.factors.map((f, i) => (
                            <div key={i} className="flex items-start gap-3">
                              <div className="w-9 shrink-0 text-right text-[11px] font-mono pt-0.5" style={{ color: "#8992A3" }}>{f.weight}%</div>
                              <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: statusColor(f.status) }} />
                              <div className="flex-1">
                                <div className="text-sm" style={{ color: "#16202E" }}>{f.label}</div>
                                <div className="text-xs mt-0.5" style={{ color: "#64708A" }}>{f.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {cat.actions?.length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#B8863F" }}>Recommended Actions</div>
                        <ul className="space-y-1.5">
                          {cat.actions.map((a, i) => (
                            <li key={i} className="text-sm flex gap-2" style={{ color: "#16202E" }}>
                              <CheckCircle2 size={14} className="shrink-0 mt-0.5" color="#2E9E62" />{a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <RecertificationTracker />
    </div>
  );
}

// ─── UPLOAD HUB ───────────────────────────────────────────────────────────────
function UploadHub({ onAnalysisData, hasData, onDocsUpdated, onSSVIData }) {
  const [files, setFiles] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
    setFiles(prev => { const ex = new Set(prev.map(f => f.name)); return [...prev, ...dropped.filter(f => !ex.has(f.name))]; });
  }, []);

  const onFileSelect = (e) => {
    const selected = Array.from(e.target.files).filter(f => f.type === "application/pdf");
    setFiles(prev => { const ex = new Set(prev.map(f => f.name)); return [...prev, ...selected.filter(f => !ex.has(f.name))]; });
    e.target.value = "";
  };

  const analyze = async () => {
    if (files.length === 0) return;
    setAnalyzing(true); setError(null);
    try {
      const reportSummaries = {};
      const extractedTexts = {};
      for (const file of files) {
        setProgress(`Reading ${file.name}…`);
        const text = await extractPDFText(file);
        const type = detectReportType(file.name, text);
        extractedTexts[file.name] = { type, text };
        reportSummaries[type] = (reportSummaries[type] || "") + `\n\n=== ${file.name} ===\n${text.substring(0, 2500)}`;
      }
      setProgress("Saving to Document Library…");
      for (const file of files) {
        const { type, text } = extractedTexts[file.name];
        await saveDocumentToLibrary(DEMO_ORG_ID, {
          id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          filename: file.name, reportType: type, reportTypeLabel: getReportTypeLabel(type),
          fileSize: file.size, uploadedAt: new Date().toISOString(),
          textPreview: text.substring(0, 600), orgId: DEMO_ORG_ID,
        });
      }
      if (onDocsUpdated) onDocsUpdated();
      const reportsFound = Object.keys(reportSummaries);
      const combinedText = Object.entries(reportSummaries)
        .map(([type, text]) => `\n\n====== ${type.toUpperCase()} REPORT ======\n${text}`)
        .join("\n").substring(0, 6000);
      const header = `REPORTS: ${reportsFound.join(", ")}\n\n`;
      setProgress(`Analyzing ${files.length} report${files.length > 1 ? "s" : ""} — Part 1 of 2…`);
      const part1 = await callClaudeWithRetry(SYSTEM_PROMPT_1, header + combinedText, 4000, 3);
      setProgress("Generating findings — Part 2 of 2…");
      const context2 = `AGENCY: ${part1.agencyName}\nSCORE: ${part1.overallComplianceScore}\nRN: ${part1.psrMetrics?.rnUnitsPerDay}\nCAP: ${fmtD(part1.capData?.capExposure)}\nSSVI: ${part1.ssviScore}/16\n\n${header}${combinedText}`;
      const part2 = await callClaudeWithRetry(SYSTEM_PROMPT_2, context2, 3000, 3);
      const merged = {
        ...part1,
        reportsAnalyzed: reportsFound.map(getReportTypeLabel),
        complianceCategories: [...(part1.complianceCategories || []), ...(part2.complianceCategories || [])],
        criticalFindings: part2.criticalFindings || [],
      };
      onAnalysisData(merged);
      setFiles([]);
    } catch (e) {
      setError("Analysis error: " + e.message);
    } finally { setAnalyzing(false); setProgress(""); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl">Report Upload Center</div>
        <p className="text-sm mt-1" style={{ color: "#64708A" }}>
          Enter your CCN for instant SSVI lookup, then upload your CMS reports for a complete AI compliance analysis. All uploads save to your Document Library.
        </p>
      </div>

      {/* CCN Lookup — full width */}
      <div className="rounded-2xl p-6" style={{ background: "#FFFFFF", border: "1.5px solid #E8CFA0", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Search size={16} color="#B8863F" />
          <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Step 1 — Enter Your CCN for Instant SSVI Score</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "#F7F0E1", color: "#B8863F" }}>Recommended First</span>
        </div>
        <CCNLookup onSSVIData={onSSVIData} />
      </div>

      {/* Drop zone */}
      <div className="rounded-2xl p-6" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Upload size={16} color="#B8863F" />
          <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Step 2 — Upload Reports for AI Analysis</span>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !analyzing && fileRef.current?.click()}
          className="rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all"
          style={{ background: dragOver ? "#F7F0E1" : "#F5F6F8", border: `2px dashed ${dragOver ? "#B8863F" : "#C7CDD8"}` }}>
          <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" onChange={onFileSelect} />
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#F7F0E1" }}>
            <Files size={24} color="#B8863F" />
          </div>
          <div>
            <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Drop all your reports here</div>
            <div className="text-sm mt-1" style={{ color: "#64708A" }}>
              PS&R 810 · Beneficiary Count B51562 · PEPPER · CAHPS · QAPI · Survey Results · Policy Manuals · CMS Public Data
            </div>
            <div className="text-xs mt-2 font-mono" style={{ color: "#8992A3" }}>
              PDF only · Multiple files at once · AI auto-detects report type · All saved to Document Library
            </div>
          </div>
        </div>

        {/* Accepted types */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          {REPORT_TYPES.map(r => (
            <div key={r.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: "#F5F6F8" }}>
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.color }} />
              <span className="text-[11px] font-mono" style={{ color: "#64708A" }}>{r.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected files */}
      {files.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-base">
              {files.length} file{files.length > 1 ? "s" : ""} ready to analyze
            </div>
            <button onClick={() => setFiles([])} className="text-xs font-mono underline" style={{ color: "#64708A" }}>Clear all</button>
          </div>
          <div className="space-y-2 mb-4">
            {files.map(f => {
              const typeId = detectReportType(f.name, "");
              const type = REPORT_TYPES.find(r => r.id === typeId);
              return (
                <div key={f.name} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: "#F5F6F8" }}>
                  <FileText size={14} color="#B8863F" className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: "#16202E" }}>{f.name}</div>
                    <div className="text-[11px] font-mono" style={{ color: "#64708A" }}>{type?.label || "Auto-detecting"} · {(f.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button onClick={() => setFiles(prev => prev.filter(x => x.name !== f.name))}><X size={13} color="#8992A3" /></button>
                </div>
              );
            })}
          </div>
          {analyzing ? (
            <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "#FBF3E4", border: "1px solid #EAD3A3" }}>
              <Loader2 size={16} color="#B8863F" className="animate-spin shrink-0" />
              <div>
                <div className="text-sm font-medium" style={{ color: "#B8863F" }}>{progress}</div>
                <div className="text-xs font-mono mt-0.5" style={{ color: "#8992A3" }}>AI analyzing all reports — up to 90 seconds. Do not close this tab.</div>
              </div>
            </div>
          ) : (
            <button onClick={analyze}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium"
              style={{ background: "#14213D", color: "#F3F5F8" }}>
              <Sparkles size={15} />
              Analyze {files.length} Report{files.length > 1 ? "s" : ""} — Generate Compliance Dashboard
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
          <AlertCircle size={15} color="#D14343" className="shrink-0 mt-0.5" />
          <span className="text-sm flex-1" style={{ color: "#B23A2E" }}>{error}</span>
          <button onClick={() => setError(null)}><X size={13} color="#B23A2E" /></button>
        </div>
      )}

      {hasData && !analyzing && (
        <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
          <CheckCircle2 size={16} color="#2E9E62" className="shrink-0" />
          <div className="text-sm flex-1" style={{ color: "#1A6E41" }}>
            <strong>Analysis complete.</strong> Reports saved to Document Library. View your dashboard for full compliance scorecard.
          </div>
          <button onClick={() => onAnalysisData(null)}
            className="text-xs font-mono px-3 py-1.5 rounded-lg shrink-0"
            style={{ background: "#FDECEA", color: "#D14343", border: "1px solid #F3B8AC" }}>Clear</button>
        </div>
      )}

      {/* EIDM hint */}
      <div className="rounded-xl p-4" style={{ background: "#F5F6F8", border: "1px solid #E3E7ED" }}>
        <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#64708A" }}>💡 How to pull these reports from CMS CASPER</div>
        <div className="text-xs font-mono space-y-1" style={{ color: "#64708A" }}>
          <div>Log into <strong style={{ color: "#16202E" }}>EIDM</strong> at eidm.cms.gov → navigate to <strong style={{ color: "#16202E" }}>CASPER</strong> → Hospice Reports</div>
          <div>PS&R Summary = <strong style={{ color: "#B8863F" }}>Report Type 810</strong> · Beneficiary Count = <strong style={{ color: "#B8863F" }}>Report B51562</strong></div>
          <div>SSVI public scores = <strong style={{ color: "#B8863F" }}>cms.gov/medicare/quality/hospice</strong> → download provider-level SSVI data file</div>
        </div>
      </div>
    </div>
  );
}

// ─── DOCUMENT LIBRARY ─────────────────────────────────────────────────────────
function DocumentLibrary({ refreshTrigger }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewDoc, setViewDoc] = useState(null);

  const loadDocs = async () => {
    setLoading(true);
    const data = await getDocumentLibrary(DEMO_ORG_ID);
    setDocs(data || []);
    setLoading(false);
  };

  useEffect(() => { loadDocs(); }, [refreshTrigger]);

  const handleDelete = async (docId) => {
    await deleteDocumentFromLibrary(DEMO_ORG_ID, docId);
    loadDocs();
  };

  const typeColor = (type) => REPORT_TYPES.find(r => r.id === type)?.color || "#64708A";

  return (
    <div className="space-y-5">
      <div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl">Document Library</div>
        <p className="text-sm mt-1" style={{ color: "#64708A" }}>
          All uploaded reports stored per clinic. Atlas reads these to answer your compliance questions.
          {!SUPABASE_READY && <span className="ml-1 font-mono" style={{ color: "#C98A1F" }}>(Session storage — connect Supabase auth for permanent multi-tenant storage)</span>}
        </p>
      </div>
      {loading ? (
        <div className="flex items-center gap-3 p-8 justify-center">
          <Loader2 size={20} className="animate-spin" color="#B8863F" />
          <span className="text-sm font-mono" style={{ color: "#64708A" }}>Loading…</span>
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center"
          style={{ background: "#FFFFFF", border: "2px dashed #C7CDD8" }}>
          <Library size={32} color="#C7CDD8" />
          <div style={{ fontFamily: "Fraunces, serif", color: "#8992A3" }} className="text-xl">No documents yet</div>
          <p className="text-sm" style={{ color: "#8992A3" }}>Upload reports in Report Upload — they appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm font-mono" style={{ color: "#64708A" }}>{docs.length} document{docs.length > 1 ? "s" : ""} · Org: {DEMO_ORG_ID}</div>
          {docs.map(doc => (
            <div key={doc.id} className="rounded-2xl p-4 flex items-start gap-3"
              style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: typeColor(doc.reportType) + "15" }}>
                <FileText size={16} style={{ color: typeColor(doc.reportType) }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "#16202E" }}>{doc.filename}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded"
                    style={{ background: typeColor(doc.reportType) + "15", color: typeColor(doc.reportType) }}>{doc.reportTypeLabel}</span>
                  <span className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{(doc.fileSize / 1024).toFixed(0)} KB</span>
                  <span className="text-[11px] font-mono" style={{ color: "#8992A3" }}>
                    {new Date(doc.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                {viewDoc === doc.id && doc.textPreview && (
                  <div className="mt-2 p-2.5 rounded-lg text-xs font-mono"
                    style={{ background: "#F5F6F8", color: "#64708A", whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto" }}>
                    {doc.textPreview}…
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => setViewDoc(viewDoc === doc.id ? null : doc.id)}
                  className="p-1.5 rounded-lg" style={{ background: "#F5F6F8" }}>
                  <Eye size={13} color="#64708A" />
                </button>
                <button onClick={() => handleDelete(doc.id)}
                  className="p-1.5 rounded-lg" style={{ background: "#F5F6F8" }}>
                  <Trash2 size={13} color="#D14343" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CHART REVIEW ─────────────────────────────────────────────────────────────
const SAMPLE_CHART = `Recertification Narrative — Episode 3
Patient has end-stage COPD. Patient continues to decline. Family reports patient is more tired.
IDG note (same date): Goals reviewed, no changes.
SN visit note (10 days prior): O2 sat 88% on 4L, increased dyspnea on exertion, patient using accessory muscles, unable to complete ADLs without rest breaks, weight down 6 lbs in 30 days.
Physician certification: signed, no date visible on this copy.
Face-to-face encounter note: "Patient seen, appropriate for hospice, continues to decline."`;

function ChartReview() {
  const [text, setText] = useState(SAMPLE_CHART);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const analyze = async () => {
    if (!text.trim()) return;
    setLoading(true); setError(null); setResult(null);
    const system = `You are a hospice compliance auditor for Connect Shield. Audit this chart against Medicare Hospice CoP. Start with { end with }. No other text: {"overallAssessment":"2 sentence summary","issues":[{"severity":"high","category":"string","finding":"string","recommendation":"string"}],"strengths":["string"]} Max 3 issues, 2 strengths.`;
    const parsed = await callClaudeWithRetry(system, text, 2000, 3);
    if (parsed && parsed.overallAssessment) setResult(parsed);
    else setError("Could not analyze chart. Please try again.");
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <div className="flex items-center gap-2 mb-1">
          <FileText size={16} color="#B8863F" />
          <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Chart Auditor</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded ml-auto" style={{ background: "#F5F6F8", color: "#64708A" }}>Medicare Hospice CoP</span>
        </div>
        <p className="text-sm mb-3" style={{ color: "#64708A" }}>Paste chart text, certifications, or IDG notes. AI flags missing elements and signature gaps against hospice Conditions of Participation.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9}
          className="w-full rounded-xl p-3 text-sm font-mono focus:outline-none"
          style={{ background: "#F5F6F8", border: "1px solid #E3E7ED", color: "#16202E" }} />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={analyze} disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
            style={{ background: "#B8863F", color: "#1B2740" }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? "Analyzing…" : "Analyze Chart"}
          </button>
          <button onClick={() => { setText(SAMPLE_CHART); setResult(null); setError(null); }}
            className="text-xs underline" style={{ color: "#64708A" }}>Reset to sample</button>
        </div>
      </div>
      {error && <div className="rounded-xl p-3 text-sm" style={{ background: "#FDECEA", color: "#B23A2E" }}>{error}</div>}
      {result && (
        <div className="rounded-2xl p-5 space-y-4" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED" }}>
          <div>
            <div className="text-xs uppercase tracking-widest font-mono mb-1" style={{ color: "#64708A" }}>Assessment</div>
            <p className="text-sm" style={{ color: "#16202E" }}>{result.overallAssessment}</p>
          </div>
          {result.issues?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#64708A" }}>Findings</div>
              <div className="space-y-2">
                {result.issues.map((iss, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-xl" style={{ background: "#F5F6F8" }}>
                    <span className="text-[10px] uppercase font-mono px-2 py-1 rounded shrink-0 h-fit"
                      style={{ background: severityColor(iss.severity) + "1A", color: severityColor(iss.severity) }}>{iss.severity}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-mono mb-0.5" style={{ color: "#B8863F" }}>{iss.category}</div>
                      <div className="text-sm" style={{ color: "#16202E" }}>{iss.finding}</div>
                      <div className="text-sm mt-1" style={{ color: "#64708A" }}>→ {iss.recommendation}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.strengths?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#64708A" }}>What's solid</div>
              <ul className="space-y-1">
                {result.strengths.map((s, i) => (
                  <li key={i} className="text-sm flex gap-2" style={{ color: "#16202E" }}>
                    <CheckCircle2 size={14} className="shrink-0 mt-0.5" color="#2E9E62" />{s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── REGULATORY WATCH ─────────────────────────────────────────────────────────
const REG_UPDATES = [
  { id:"r1", date:"2026-06-24", source:"CMS", tag:"Conditions of Participation", severity:"high",
    title:"Hospice election statement addendum — clarified timing requirement",
    summary:"CMS clarified that the election statement addendum must be provided within the same 3-day window as the election statement itself.",
    impact:"If your intake workflow allows the addendum to be sent after the election statement, that gap is now a compliance finding.",
    checklist:["Update intake SOP so addendum trigger fires at election.","Retrain admissions staff on the 3-day window.","Audit last 30 days of elections for addendum timing gaps."] },
  { id:"r2", date:"2026-06-10", source:"CMS", tag:"Payment / Billing", severity:"high",
    title:"FY2027 Hospice Proposed Rule — SSVI introduced as public scoring tool",
    summary:"CMS introduced the SSVI (0-16 scale) built from 9 claims-based measures. Utilization Score (0-8) covers RN visit intensity, LOS, live discharge, GIP ratio, weekend visits, end-of-life patterns. Non-Hospice Spending Score (0-8) covers Part A/B spending. Scores posted publicly.",
    impact:"Scores ≥10 signal meaningful deviation and may trigger program integrity review. Enter your CCN in Connect Shield for instant SSVI lookup.",
    checklist:["Enter your CCN in Connect Shield for instant SSVI score.","Review RN intensity — Rev 0551 units ÷ Medicare days. Under 1.0 is flagged.","Pull PS&R Report 810 and Beneficiary Count B51562 from CASPER and upload.","Review all 8 utilization measures in your Connect Shield SSVI breakdown.","Brief your clinical team on weekend visit and end-of-life visit requirements."] },
  { id:"r3", date:"2026-05-14", source:"OIG", tag:"Program Integrity", severity:"medium",
    title:"OIG work plan adds hospice GIP level-of-care review",
    summary:"OIG focused on GIP level-of-care determinations — whether documentation supports acuity required for GIP billing.",
    impact:"GIP documentation is a near-term audit target. Pre-emptive auditing strongly advised.",
    checklist:["Audit all open and recent GIP stays for acuity documentation.","Share OIG focus area with DON and billing team."] },
  { id:"r4", date:"2026-04-30", source:"CMS", tag:"Survey / Oversight", severity:"medium",
    title:"CMS posts provider-level SSVI scores publicly on Hospice Center webpage",
    summary:"FY2024 and FY2025 SSVI scores publicly posted. National avg: 6.42, median: 7. 833 hospices (12.5%) scored ≥10.",
    impact:"Referral sources, families, and payers can see your score. High scores are visible to anyone researching your agency.",
    checklist:["Enter your CCN in Connect Shield to see your published score.","If score ≥8, develop remediation plan before next cycle.","Document SSVI outlier response in your QAPI program."] },
];

function RegulatoryWatch() {
  const [checked, setChecked] = useState({});
  const toggle = (id, i) => setChecked(c => ({ ...c, [`${id}-${i}`]: !c[`${id}-${i}`] }));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen size={16} color="#B8863F" />
        <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Regulatory Watch</span>
      </div>
      <p className="text-sm -mt-2" style={{ color: "#64708A" }}>New and changed hospice requirements, translated into what your agency needs to do.</p>
      {REG_UPDATES.map(r => {
        const total = r.checklist.length;
        const done = r.checklist.filter((_, i) => checked[`${r.id}-${i}`]).length;
        return (
          <div key={r.id} className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-mono px-2 py-1 rounded"
                  style={{ background: severityColor(r.severity) + "1A", color: severityColor(r.severity) }}>{r.severity} impact</span>
                <span className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{r.source} · {r.tag}</span>
              </div>
              <span className="text-[11px] font-mono flex items-center gap-1 shrink-0" style={{ color: "#8992A3" }}>
                <Clock size={11} />{r.date}
              </span>
            </div>
            <h3 className="mt-2 text-base" style={{ fontFamily: "Fraunces, serif", color: "#16202E" }}>{r.title}</h3>
            <p className="text-sm mt-1.5" style={{ color: "#64708A" }}>{r.summary}</p>
            <div className="mt-2 p-3 rounded-lg text-sm" style={{ background: "#F5F6F8", color: "#16202E" }}>
              <span className="font-mono text-xs" style={{ color: "#B8863F" }}>What it means for you: </span>{r.impact}
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs uppercase tracking-widest font-mono" style={{ color: "#64708A" }}>Action checklist</span>
                <span className="text-xs font-mono" style={{ color: done === total ? "#2E9E62" : "#64708A" }}>{done}/{total} done</span>
              </div>
              {r.checklist.map((item, i) => {
                const key = `${r.id}-${i}`;
                const isChecked = !!checked[key];
                return (
                  <button key={i} onClick={() => toggle(r.id, i)}
                    className="w-full flex items-start gap-2 text-left p-2 rounded-lg mb-1"
                    style={{ background: isChecked ? "#EAF6EF" : "transparent" }}>
                    <div className="w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center"
                      style={{ border: `1.5px solid ${isChecked ? "#2E9E62" : "#C7CDD8"}`, background: isChecked ? "#2E9E62" : "transparent" }}>
                      {isChecked && <CheckCircle2 size={10} color="#FFFFFF" />}
                    </div>
                    <span className="text-sm" style={{ color: isChecked ? "#64708A" : "#16202E", textDecoration: isChecked ? "line-through" : "none" }}>{item}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ATLAS (formerly Copilot) ─────────────────────────────────────────────────
function Atlas({ analysisData, ssviData }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "I'm Atlas, your compliance intelligence assistant. I have access to your uploaded documents and SSVI data. Ask me about your PS&R metrics, SSVI score breakdown, CAP exposure, survey findings, or any hospice regulatory question." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [libraryDocs, setLibraryDocs] = useState([]);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { getDocumentLibrary(DEMO_ORG_ID).then(docs => setLibraryDocs(docs || [])); }, []);

  const buildContext = () => {
    let ctx = "CLINIC DATA:\n";
    if (ssviData) {
      ctx += `CCN: ${ssviData.ccn} — ${ssviData.hospice_name}\n`;
      ctx += `FY2025 SSVI: ${ssviData.fy2025_total_ssvi}/16 (Utilization: ${ssviData.fy2025_utilization_score}/8, Spending: ${ssviData.fy2025_spending_score}/8)\n`;
      ctx += `FY2024 SSVI: ${ssviData.fy2024_total_ssvi}/16\n`;
      const flagged = SSVI_MEASURES.filter(m => ssviData[`fy2025_${m.key}`] === true).map(m => m.label);
      if (flagged.length > 0) ctx += `Flagged measures: ${flagged.join(", ")}\n`;
    }
    if (analysisData) {
      ctx += `Agency: ${analysisData.agencyName}\nSSVI estimated: ${analysisData.ssviScore}/16\nCompliance Score: ${analysisData.overallComplianceScore}/100\nRisk: ${analysisData.overallRiskLevel}\nCAP Exposure: ${fmtD(analysisData.capData?.capExposure || 0)}\nRN Intensity: ${analysisData.psrMetrics?.rnUnitsPerDay} units/day\n`;
      if (analysisData.criticalFindings?.length > 0) ctx += `Critical Findings: ${analysisData.criticalFindings.map(f => `[${f.severity}] ${f.finding}`).join(" | ")}\n`;
    }
    if (libraryDocs.length > 0) {
      ctx += `\nDOCUMENT LIBRARY (${libraryDocs.length} docs):\n`;
      libraryDocs.slice(0, 6).forEach(doc => {
        ctx += `- ${doc.reportTypeLabel}: ${doc.filename}\n`;
        if (doc.textPreview) ctx += `  ${doc.textPreview.substring(0, 200)}\n`;
      });
    }
    return ctx;
  };

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const system = `You are Atlas, an AI compliance intelligence assistant inside Connect Shield — an executive compliance platform for hospice CEOs, owners, and Directors of Clinical Services. You have access ONLY to this clinic's data.

${buildContext()}

Answer questions about PS&R Report 810, Beneficiary Count B51562, PEPPER, CAHPS, QAPI, survey deficiencies, SSVI scoring (0-16, lower is better, national avg 6.42, 9 utilization measures each worth 1 point plus non-hospice spending score 0-8), MAC/RAC audits, CAP exposure, and Medicare Hospice CoP. Reference revenue codes (0551=SN visits 15-min, 0651=RHC days) and dollar amounts from this clinic's data. Keep answers under 200 words, conversational but precise.`;
      const reply = await callClaude(system, q, 600);
      setMessages(m => [...m, { role: "assistant", text: reply.trim() }]);
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", text: "Something went wrong — please try again." }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="rounded-2xl flex flex-col h-[65vh] md:h-[calc(100vh-7rem)] md:max-h-[52rem]"
      style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
      <div className="p-4 flex items-center gap-2" style={{ borderBottom: "1px solid #E3E7ED" }}>
        <Bot size={16} color="#B8863F" />
        <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Atlas</span>
        <span className="text-xs font-mono" style={{ color: "#64708A" }}>Compliance Intelligence</span>
        <div className="ml-auto flex items-center gap-2">
          {analysisData && <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "#EAF6EF", color: "#2E9E62" }}>✓ Analysis loaded</span>}
          {ssviData && <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "#F7F0E1", color: "#B8863F" }}>✓ SSVI {ssviData.fy2025_total_ssvi}/16</span>}
          {libraryDocs.length > 0 && <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "#F5F6F8", color: "#64708A" }}>📚 {libraryDocs.length} docs</span>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm"
              style={{ background: m.role === "user" ? "#B8863F" : "#F5F6F8", color: m.role === "user" ? "#1B2740" : "#16202E" }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl px-3 py-2 text-sm flex items-center gap-2" style={{ background: "#F5F6F8", color: "#64708A" }}>
              <Loader2 size={12} className="animate-spin" /> thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-3 flex gap-2" style={{ borderTop: "1px solid #E3E7ED" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask Atlas about your SSVI score, CAP exposure, RN intensity…"
          className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
          style={{ background: "#F5F6F8", border: "1px solid #E3E7ED", color: "#16202E" }} />
        <button onClick={send} disabled={loading}
          className="rounded-xl px-3 flex items-center justify-center"
          style={{ background: "#B8863F", color: "#1B2740" }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── RECERT TRACKER ───────────────────────────────────────────────────────────
const MOCK_PATIENTS = [
  { name: "James MacIntyre", day: 174, totalDays: 180, ftfComplete: false, diagnosis: "End-stage COPD" },
  { name: "Eleanor Vasquez", day: 162, totalDays: 180, ftfComplete: true, diagnosis: "CHF, Stage IV" },
  { name: "Robert Chung", day: 171, totalDays: 180, ftfComplete: false, diagnosis: "Dementia, FAST 7C" },
];

function RecertificationTracker() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 text-left">
        <div className="flex items-center gap-2">
          <Calendar size={15} color="#B8863F" />
          <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-base">Recertification Windows &amp; FTF Tracking</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "#FDECEA", color: "#D14343" }}>2 Missing FTF</span>
        </div>
        {open ? <ChevronDown size={16} color="#64708A" /> : <ChevronRight size={16} color="#64708A" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 space-y-3" style={{ borderTop: "1px solid #E3E7ED" }}>
          <p className="text-sm" style={{ color: "#64708A" }}>Medicare requires a Face-to-Face encounter prior to the 180-day recertification. Missing by one day causes 100% claim suspension.</p>
          {MOCK_PATIENTS.map((p, i) => {
            const pct = (p.day / p.totalDays) * 100;
            const isRed = p.day >= 170 && !p.ftfComplete;
            const isWarn = p.day >= 160 && !p.ftfComplete;
            const barColor = isRed ? "#D14343" : isWarn ? "#C98A1F" : "#2E9E62";
            return (
              <div key={i} className="rounded-xl p-3"
                style={{ background: isRed ? "#FDECEA" : isWarn ? "#FEF3E2" : "#F5F6F8", border: `1px solid ${barColor}20` }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="font-medium text-sm" style={{ color: "#16202E" }}>{p.name}</div>
                    <div className="text-xs font-mono" style={{ color: "#64708A" }}>{p.diagnosis}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-semibold" style={{ color: barColor }}>Day {p.day}/{p.totalDays}</div>
                    {!p.ftfComplete && p.day >= 170 && <div className="text-[10px] font-mono mt-0.5 px-1.5 py-0.5 rounded" style={{ background: "#FDECEA", color: "#D14343" }}>⚠ Missing FTF</div>}
                    {p.ftfComplete && <div className="text-[10px] font-mono mt-0.5 px-1.5 py-0.5 rounded" style={{ background: "#EAF6EF", color: "#2E9E62" }}>✓ FTF Done</div>}
                  </div>
                </div>
                <div className="w-full rounded-full h-1.5" style={{ background: "#E3E7ED" }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── NAV & SHELL ──────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "upload", label: "Report Upload", icon: Upload },
  { id: "library", label: "Document Library", icon: Library },
  { id: "chart", label: "Chart Review", icon: FileText },
  { id: "reg", label: "Regulatory Watch", icon: BookOpen },
  { id: "atlas", label: "Atlas", icon: Bot },
];

const CONTENT_MAX_W = {
  dashboard: "max-w-5xl", upload: "max-w-4xl", library: "max-w-4xl",
  chart: "max-w-4xl", reg: "max-w-4xl", atlas: "max-w-2xl",
};

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#B8863F" }}>
        <ShieldCheck size={19} color="#1B2740" />
      </div>
      <div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#F3F5F8" }} className="text-xl leading-none">Connect Shield</div>
        <div className="text-[11px] font-mono mt-0.5" style={{ color: "#93A0B8" }}>Hospice Compliance Intelligence</div>
      </div>
    </div>
  );
}

function InstallBanner() {
  const [prompt, setPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  if (!prompt || dismissed) return null;
  return (
    <div className="flex items-center gap-3 mx-4 md:mx-8 mt-4 rounded-xl px-4 py-3"
      style={{ background: "#FBF3E4", border: "1px solid #EAD3A3" }}>
      <ShieldCheck size={15} color="#B8863F" className="shrink-0" />
      <span className="text-sm flex-1" style={{ color: "#16202E" }}>Install Connect Shield for quick, full-screen access.</span>
      <button onClick={async () => { prompt.prompt(); await prompt.userChoice; setPrompt(null); }}
        className="text-xs font-medium rounded-lg px-3 py-1.5 shrink-0"
        style={{ background: "#B8863F", color: "#1B2740" }}>Install</button>
      <button onClick={() => setDismissed(true)} className="text-xs shrink-0" style={{ color: "#64708A" }}>Not now</button>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function ConnectShield() {
  const [tab, setTab] = useState("dashboard");
  const [analysisData, setAnalysisData] = useState(null);
  const [ssviData, setSsviData] = useState(null);
  const [libRefresh, setLibRefresh] = useState(0);

  const handleAnalysisData = (data) => {
    setAnalysisData(data);
    if (data) setTab("dashboard");
  };

  const handleSsviData = (data) => {
    setSsviData(data);
    setTab("dashboard");
  };

  return (
    <div style={{ background: "#F5F6F8", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}
      className="flex flex-col md:flex-row">
      <style>{FONT_IMPORT}</style>
      <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:h-screen md:sticky md:top-0 px-5 py-6"
        style={{ background: "#14213D", borderRight: "1px solid #1E2C4E" }}>
        <Logo />
        <nav className="mt-8 flex flex-col gap-0.5">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-left transition-colors"
                style={{ background: active ? "#1E2C4E" : "transparent", color: active ? "#F3F5F8" : "#93A0B8" }}>
                <Icon size={15} />{t.label}
              </button>
            );
          })}
        </nav>

        {/* Agency card in sidebar */}
        {(analysisData || ssviData) && (
          <div className="mt-4 rounded-xl px-3 py-3" style={{ background: "#1E2C4E" }}>
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#6B7A99" }}>Active Agency</div>
            <div className="text-xs font-medium mt-1 truncate" style={{ color: "#F3F5F8" }}>
              {ssviData?.hospice_name || analysisData?.agencyName || "Unknown"}
            </div>
            {ssviData?.ccn && <div className="text-[10px] font-mono mt-0.5" style={{ color: "#6B7A99" }}>CCN: {ssviData.ccn}</div>}
            {ssviData?.fy2025_total_ssvi != null && (
              <div className="mt-2 flex items-center gap-2">
                <div className="text-[10px] font-mono" style={{ color: "#93A0B8" }}>FY2025 SSVI</div>
                <div className="text-sm font-mono font-bold" style={{ color: ssviColor(ssviData.fy2025_total_ssvi) }}>
                  {ssviData.fy2025_total_ssvi}/16
                </div>
              </div>
            )}
            {analysisData?.overallComplianceScore > 0 && (
              <div className="mt-1 flex items-center gap-2">
                <div className="text-[10px] font-mono" style={{ color: "#93A0B8" }}>Compliance</div>
                <div className="text-sm font-mono font-bold" style={{ color: scoreColor(analysisData.overallComplianceScore) }}>
                  {analysisData.overallComplianceScore}/100
                </div>
              </div>
            )}
            <div className="flex gap-1 mt-2 flex-wrap">
              {ssviData && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#2E9E6220", color: "#2E9E62" }}>SSVI ✓</span>}
              {analysisData && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#2E9E6220", color: "#2E9E62" }}>PS&R ✓</span>}
            </div>
          </div>
        )}

        <div className="mt-auto space-y-2">
          <div className="text-[10px] font-mono leading-relaxed" style={{ color: "#4A5568" }}>
            © 2026 Connect Shield · connect-shield.com
          </div>
          <div className="text-[10px] font-mono" style={{ color: "#4A5568" }}>
            Hospice Compliance Intelligence Platform
          </div>
          {!SUPABASE_READY && <div className="text-[10px] font-mono" style={{ color: "#C98A1F" }}>⚠ Supabase auth: pending</div>}
        </div>
      </aside>

      <div className="md:hidden px-4 pt-5 pb-3" style={{ background: "#14213D" }}>
        <Logo />
      </div>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <InstallBanner />
        <div className={`${CONTENT_MAX_W[tab] || "max-w-5xl"} mx-auto px-4 md:px-8 py-4 md:py-6 pb-28 md:pb-10`}>
          {tab === "dashboard" && <Dashboard analysisData={analysisData} ssviData={ssviData} />}
          {tab === "upload" && (
            <UploadHub
              onAnalysisData={handleAnalysisData}
              hasData={!!analysisData}
              onDocsUpdated={() => setLibRefresh(n => n + 1)}
              onSSVIData={handleSsviData}
            />
          )}
          {tab === "library" && <DocumentLibrary refreshTrigger={libRefresh} />}
          {tab === "chart" && <ChartReview />}
          {tab === "reg" && <RegulatoryWatch />}
          {tab === "atlas" && <Atlas analysisData={analysisData} ssviData={ssviData} />}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 flex items-stretch z-10"
        style={{ background: "#14213D", borderTop: "1px solid #1E2C4E", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[9px] font-medium"
              style={{ color: active ? "#B8863F" : "#93A0B8" }}>
              <Icon size={17} />{t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
