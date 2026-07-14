import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  FileText, ShieldCheck, MessageSquare, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronRight, Send, Sparkles,
  TrendingUp, TrendingDown, Clock, BookOpen, Loader2,
  Minus, Upload, DollarSign, AlertCircle, X,
  BarChart3, Calendar, ArrowRight,
  Home, PieChart, Files, Library, Trash2, Eye,
} from "lucide-react";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

const MODEL = "claude-sonnet-4-6";

// ─── SUPABASE PLACEHOLDER ─────────────────────────────────────────────────────
// When Supabase is ready, replace these with real Supabase client calls
// import { createClient } from '@supabase/supabase-js'
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const SUPABASE_READY = false; // flip to true when Supabase is connected

async function saveDocumentToLibrary(orgId, doc) {
  if (!SUPABASE_READY) {
    // Store in localStorage as interim solution (per-session only)
    const key = `aihospice_docs_${orgId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    existing.unshift(doc);
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
    return doc;
  }
  // SUPABASE: uncomment when ready
  // const { data, error } = await supabase
  //   .from('documents')
  //   .insert([{ organization_id: orgId, ...doc }])
  // return data;
}

async function getDocumentLibrary(orgId) {
  if (!SUPABASE_READY) {
    const key = `aihospice_docs_${orgId}`;
    return JSON.parse(localStorage.getItem(key) || "[]");
  }
  // SUPABASE: uncomment when ready
  // const { data } = await supabase
  //   .from('documents')
  //   .select('*')
  //   .eq('organization_id', orgId)
  //   .order('created_at', { ascending: false })
  // return data;
}

async function deleteDocumentFromLibrary(orgId, docId) {
  if (!SUPABASE_READY) {
    const key = `aihospice_docs_${orgId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.setItem(key, JSON.stringify(existing.filter(d => d.id !== docId)));
    return true;
  }
  // SUPABASE: uncomment when ready
  // await supabase.from('documents').delete().eq('id', docId).eq('organization_id', orgId)
}

// Demo org ID — replace with real auth session org ID when Supabase is ready
const DEMO_ORG_ID = "demo_org_001";

// ─── ROBUST CLAUDE CALLER ─────────────────────────────────────────────────────
async function callClaude(system, userText, maxTokens = 2000) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text.substring(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

// ─── ULTRA-ROBUST JSON PARSER ─────────────────────────────────────────────────
// 5 fallback strategies — should never fail
function parseJSON(raw) {
  if (!raw || typeof raw !== "string") throw new Error("Empty or invalid response");
  
  // Strategy 1: direct parse
  try { return JSON.parse(raw.trim()); } catch {}
  
  // Strategy 2: strip markdown fences
  try { return JSON.parse(raw.replace(/```json[\s\S]*?```/g, m => m.replace(/```json\n?/,"").replace(/\n?```/,"")).replace(/```/g,"").trim()); } catch {}
  
  // Strategy 3: extract first complete balanced JSON object
  try {
    let depth = 0, start = -1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === "{") { if (depth === 0) start = i; depth++; }
      else if (raw[i] === "}") { depth--; if (depth === 0 && start !== -1) {
        const candidate = raw.substring(start, i + 1);
        try { return JSON.parse(candidate); } catch {}
      }}
    }
  } catch {}
  
  // Strategy 4: try to fix truncated JSON by closing open structures
  try {
    let candidate = raw.trim();
    if (candidate.includes("{") && !candidate.endsWith("}")) {
      const opens = (candidate.match(/\{/g) || []).length;
      const closes = (candidate.match(/\}/g) || []).length;
      candidate += "}".repeat(Math.max(0, opens - closes));
      return JSON.parse(candidate);
    }
  } catch {}

  // Strategy 5: return a safe default structure so the app never crashes
  console.warn("All JSON parse strategies failed, returning safe default");
  return {
    agencyName: "Unknown Agency",
    overallComplianceScore: 0,
    overallRiskLevel: "medium",
    ssviScore: null,
    ssviIsEstimated: true,
    reportsAnalyzed: [],
    complianceCategories: [],
    criticalFindings: [],
    capData: {},
    psrMetrics: {},
    qualityMetrics: {},
    ssviFindings: [],
    parseError: "Analysis returned incomplete data. Try uploading reports again.",
  };
}

// ─── COLORS & HELPERS ─────────────────────────────────────────────────────────
const severityColor = (s) => s === "high" ? "#D14343" : s === "medium" ? "#C98A1F" : "#2E9E62";
const scoreColor = (s) => s >= 85 ? "#2E9E62" : s >= 70 ? "#C98A1F" : "#D14343";
const ssviColor = (s) => s <= 4 ? "#2E9E62" : s <= 7 ? "#C98A1F" : "#D14343";
const ssviLabel = (s) => s <= 4 ? "Low Risk" : s <= 7 ? "Moderate Risk" : "High Risk";
const statusColor = (s) => s === "good" ? "#2E9E62" : s === "warn" ? "#C98A1F" : "#D14343";

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

function detectReportType(filename, text) {
  const fn = filename.toLowerCase();
  const tx = text.toLowerCase().substring(0, 1500);
  if (fn.includes("pepper") || tx.includes("program for evaluating payment")) return "pepper";
  if (fn.includes("cahps") || tx.includes("cahps") || tx.includes("consumer assessment of healthcare")) return "cahps";
  if (fn.includes("qapi") || tx.includes("quality assurance and performance improvement")) return "qapi";
  if (fn.includes("survey") || tx.includes("statement of deficiencies") || tx.includes("cms-2567") || tx.includes("plan of correction")) return "survey";
  if (fn.includes("policy") || fn.includes("manual") || fn.includes("procedure")) return "policy";
  if (fn.includes("beneficiar") || fn.includes("b51562") || fn.includes("hcr01") || tx.includes("beneficiary count summary") || tx.includes("streamlined hospice beneficiary") || tx.includes("full beneficiary count") || tx.includes("fractional beneficiary")) return "beneficiary";
  if (fn.includes("compare") || tx.includes("hospice compare") || tx.includes("cms public")) return "cms_public";
  if (tx.includes("provider statistical and reimbursement") || tx.includes("provider summary report") || tx.includes("report type: 810") || fn.includes("summary25") || fn.includes("810")) return "psr";
  return "psr";
}

function getReportTypeLabel(id) {
  return REPORT_TYPES.find(r => r.id === id)?.label || id;
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
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const ab = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text;
}

// ─── ANALYSIS PROMPTS ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT_1 = `You are a Medicare hospice compliance expert analyzing CMS reports for AIHospiceOS.

PS&R REPORT 810 STRUCTURE:
- STATISTIC SECTION: Medicare Days (Rev 0651 days), Claims count, Total Unduplicated Census Count
- CHARGE SECTION revenue codes: 0551=Skilled Nursing 15-min units, 0561=Social Work 15-min, 0571=Aide 15-min, 0651=Routine Home Care days, 0250=Pharmacy
- REIMBURSEMENT SECTION: Gross Reimbursement, Sequestration (2%), Net Reimbursement

BENEFICIARY COUNT B51562: Table with Cap Year | Full Beneficiary Count | Fractional Beneficiary Count | Total Beneficiary Count
CAP limits: FY2025=$34,159.74/beneficiary, FY2026=$34,738.63/beneficiary
CAP exposure = Net Reimbursement minus (Total Beneficiaries × per-beneficiary cap). Positive = owes CMS.

SSVI CALCULATION (0-16, lower is better, national avg 6.42):
- Utilization Score 0-8: RN intensity = Rev 0551 units ÷ Medicare days. Under 1.0 = +3pts, 1.0-1.5 = +1pt. LOS over 180 days avg = +2pts, 120-180 = +1pt. GIP presence = +1pt if over 10%.
- Spending Score 0-8: Use 3.21 (national avg) unless CMS public data provides actual score.
- If CMS public data has actual SSVI score, use it and set ssviIsEstimated=false.

PEPPER: Flags outlier billing patterns vs national/jurisdiction benchmarks.
CAHPS: Family satisfaction scores 0-100 scale.
QAPI: Performance improvement documentation quality.
SURVEY: CMS-2567 deficiency citations and Conditions of Participation status.

Respond with ONLY valid JSON. Start with { end with }. No markdown. No explanation:

{"agencyName":"string","providerNumber":"string","reportPeriod":"string","reportsAnalyzed":["list"],"overallComplianceScore":number,"overallRiskLevel":"high|medium|low","ssviScore":number,"ssviUtilizationScore":number,"ssviSpendingScore":number,"ssviIsEstimated":true,"ssviFindings":[{"measure":"string","detail":"string","status":"good|warn|risk"}],"capData":{"capYear":"2026","totalBeneficiaryCount":null,"perBeneficiaryCap":34738.63,"capLimit":null,"netReimbursement":null,"capExposure":null,"capUtilizationPct":null},"psrMetrics":{"totalMedicareDays":null,"totalClaims":null,"totalUnduplicatedCensus":null,"avgLengthOfStay":null,"snVisitUnits":null,"rnUnitsPerDay":null,"netReimbursement":null,"grossReimbursement":null},"qualityMetrics":{"cahpsOverallScore":null,"cahpsNationalAvg":null,"pepperOutlierFlags":0,"qapiProjectCount":0,"surveyDeficiencyCount":0,"surveyConditionLevel":false,"openDeficiencies":0},"complianceCategories":[{"id":"string","label":"string","score":number,"source":"string","riskLevel":"high|medium|low","clawbackAmount":0,"summary":"string","factors":[{"weight":number,"label":"string","status":"good|warn|risk","detail":"string"}],"actions":["string"]}]}

Fill ALL fields with real data from reports. Use null only when data truly not found.`;

const SYSTEM_PROMPT_2 = `You are a Medicare hospice compliance expert. Generate additional compliance categories and critical findings from the same report data.

Respond with ONLY valid JSON. Start with { end with }. No markdown:

{"complianceCategories":[{"id":"string","label":"string","score":number,"source":"string","riskLevel":"high|medium|low","clawbackAmount":0,"summary":"string with actual numbers","factors":[{"weight":number,"label":"string","status":"good|warn|risk","detail":"string with actual data"}],"actions":["specific action"]}],"criticalFindings":[{"severity":"high|medium|low","category":"string","source":"string","finding":"string with specific numbers","recommendation":"string","clawbackRisk":0}]}

Generate 3-5 compliance categories covering areas not in the first response (Survey Compliance, Quality Measures, QAPI Program, PEPPER Outlier Risk, Billing Trend). Include up to 5 critical findings with specific dollar amounts and data points. Use actual numbers from the reports.`;

// ─── SCORE RING ───────────────────────────────────────────────────────────────
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
  const fillPct = (pct / 16) * 100;
  const color = ssviColor(pct);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E3E7ED" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c - (fillPct/100)*c}
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
      {clawback > 0 && (
        <span className="text-sm font-mono" style={{ color }}>
          · Clawback: <strong>${Number(clawback).toLocaleString()}</strong>
        </span>
      )}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ analysisData }) {
  const [openId, setOpenId] = useState(null);

  if (!analysisData) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl p-12 flex flex-col items-center justify-center gap-4 text-center"
          style={{ background: "#FFFFFF", border: "2px dashed #C7CDD8" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "#F7F0E1" }}>
            <Upload size={28} color="#B8863F" />
          </div>
          <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl">
            No reports uploaded yet
          </div>
          <p className="text-sm max-w-lg" style={{ color: "#64708A" }}>
            Go to Report Upload and submit your CMS reports. Upload any combination of PS&R, Beneficiary Count, PEPPER, CAHPS, QAPI, Survey Results, Policy Manuals, or CMS Public Data. Every report uploaded is saved to your Document Library for future reference.
          </p>
          <div className="flex gap-2 mt-2 flex-wrap justify-center">
            {["PS&R 810", "Beneficiary Count", "PEPPER", "CAHPS", "QAPI", "Survey Results"].map((item) => (
              <span key={item} className="text-xs font-mono px-3 py-1.5 rounded-full"
                style={{ background: "#F5F6F8", color: "#64708A", border: "1px solid #E3E7ED" }}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const d = analysisData;
  const cap = d.capData || {};
  const metrics = d.psrMetrics || {};
  const quality = d.qualityMetrics || {};
  const categories = d.complianceCategories || [];
  const findings = d.criticalFindings || [];

  return (
    <div className="space-y-6">
      {d.parseError && (
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "#FEF3E2", border: "1px solid #F0C87A" }}>
          <AlertCircle size={16} color="#C98A1F" className="shrink-0 mt-0.5" />
          <div className="text-sm" style={{ color: "#7A5700" }}>
            <strong>Partial analysis:</strong> {d.parseError} — Showing available data below.
          </div>
        </div>
      )}

      {/* Main scorecard */}
      <div className="rounded-2xl p-6"
        style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <div className="flex items-start gap-5 flex-wrap">
          {d.overallComplianceScore > 0 && <ScoreRing score={d.overallComplianceScore} size={104} stroke={9} />}
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "#64708A" }}>
              Composite Compliance Index
            </div>
            <div className="text-2xl mt-1" style={{ fontFamily: "Fraunces, serif", color: "#16202E" }}>
              {d.agencyName || "Unknown Agency"}
            </div>
            {d.reportPeriod && (
              <div className="text-sm mt-1 font-mono" style={{ color: "#64708A" }}>Period: {d.reportPeriod}</div>
            )}
            {d.overallRiskLevel && (
              <div className="mt-2">
                <RiskBadge level={d.overallRiskLevel} clawback={cap.capExposure || 0} />
              </div>
            )}
          </div>
        </div>

        {d.reportsAnalyzed?.length > 0 && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {d.reportsAnalyzed.map((r) => (
              <span key={r} className="text-xs font-mono px-2 py-1 rounded"
                style={{ background: "#EAF6EF", color: "#2E9E62", border: "1px solid #A8DFC0" }}>
                ✓ {r}
              </span>
            ))}
          </div>
        )}

        {categories.length > 0 && (
          <div className="w-full flex flex-wrap gap-3 pt-5 mt-4 border-t" style={{ borderColor: "#E3E7ED" }}>
            {categories.map((c) => (
              <button key={c.id} onClick={() => setOpenId(openId === c.id ? null : c.id)}
                className="text-left rounded-lg px-3 py-2 transition-colors"
                style={{
                  background: openId === c.id ? "#F7F0E1" : "transparent",
                  border: `1px solid ${openId === c.id ? "#E8CFA0" : "#E3E7ED"}`,
                  flex: "1 1 150px", minWidth: 0,
                }}>
                <div className="text-[11px] font-mono truncate" style={{ color: "#64708A" }}>{c.label}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-mono" style={{ color: scoreColor(c.score) }}>{c.score}</span>
                  {c.clawbackAmount > 0 && (
                    <span className="text-[11px] font-mono" style={{ color: "#D14343" }}>
                      ⚠ ${Number(c.clawbackAmount).toLocaleString()}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SSVI */}
      {d.ssviScore != null && (
        <div className="rounded-2xl p-6"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-start gap-5 flex-wrap">
            <SSVIRing score={d.ssviScore} size={96} stroke={9} />
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "#64708A" }}>
                SSVI — Service &amp; Spending Variation Index
              </div>
              <div className="text-xl mt-1" style={{ fontFamily: "Fraunces, serif", color: "#16202E" }}>
                {ssviLabel(d.ssviScore)} · Score {d.ssviScore}/16
                {d.ssviIsEstimated && <span className="text-sm font-mono ml-2" style={{ color: "#64708A" }}>(estimated)</span>}
              </div>
              <div className="text-sm mt-1" style={{ color: "#64708A" }}>
                FY2025 national avg: 6.42 · Median: 7 · Scores ≥10 trigger CMS program integrity review
              </div>
              <div className="mt-2 flex gap-3 flex-wrap">
                {d.ssviUtilizationScore != null && (
                  <div className="rounded-lg px-3 py-1.5 text-sm font-mono" style={{ background: "#F5F6F8" }}>
                    Utilization: <strong style={{ color: ssviColor(d.ssviUtilizationScore) }}>{d.ssviUtilizationScore}/8</strong>
                  </div>
                )}
                {d.ssviSpendingScore != null && (
                  <div className="rounded-lg px-3 py-1.5 text-sm font-mono" style={{ background: "#F5F6F8" }}>
                    Non-Hospice Spending: <strong>{d.ssviSpendingScore}/8</strong>
                    {d.ssviIsEstimated && <span style={{ color: "#64708A" }}> (est.)</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
          {d.ssviIsEstimated && (
            <div className="mt-4 p-3 rounded-xl" style={{ background: "#F5F6F8" }}>
              <div className="text-xs font-mono" style={{ color: "#64708A" }}>
                <strong>SSVI accuracy note:</strong> Utilization Score calculated from PS&R data (RN intensity, LOS, LOC mix). Spending Score uses national avg 3.21 — upload CMS Public Data or your actual Hospice Compare SSVI score for exact figure. Pull Reports 832/833 from CASPER for discharge/readmission data.
              </div>
            </div>
          )}
          {d.ssviScore >= 10 && (
            <div className="mt-3 p-3 rounded-xl flex items-start gap-3" style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
              <AlertTriangle size={16} color="#D14343" className="shrink-0 mt-0.5" />
              <div className="text-sm" style={{ color: "#B23A2E" }}>
                <strong>High SSVI Warning:</strong> Scores ≥10 indicate meaningful deviation from CMS peer norms. CMS posts scores publicly — referral sources and payers can see this. Elevated program integrity scrutiny likely.
              </div>
            </div>
          )}
          {d.ssviFindings?.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs uppercase tracking-widest font-mono mb-1" style={{ color: "#64708A" }}>SSVI Risk Factors</div>
              {d.ssviFindings.map((f, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "#F5F6F8" }}>
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ background: f.status === "risk" ? "#D14343" : f.status === "warn" ? "#C98A1F" : "#2E9E62" }} />
                  <div className="flex-1">
                    <div className="text-sm" style={{ color: "#16202E" }}>{f.measure}</div>
                    <div className="text-xs mt-0.5" style={{ color: "#64708A" }}>{f.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CAP */}
      {cap.capLimit != null && (
        <div className="rounded-2xl p-5"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2 mb-4">
            <PieChart size={16} color="#B8863F" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">
              Medicare Aggregate CAP — Cap Year {cap.capYear}
            </span>
            {cap.capExposure > 0 && (
              <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "#FDECEA", color: "#D14343" }}>🔴 CAP EXCEEDED</span>
            )}
          </div>
          {cap.capUtilizationPct != null && (
            <>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-mono" style={{ color: "#16202E" }}>Cap Utilization</span>
                <span className="text-sm font-mono font-bold"
                  style={{ color: cap.capUtilizationPct >= 100 ? "#D14343" : cap.capUtilizationPct >= 85 ? "#C98A1F" : "#2E9E62" }}>
                  {Number(cap.capUtilizationPct).toFixed(1)}%
                </span>
              </div>
              <div className="w-full rounded-full h-3" style={{ background: "#E3E7ED" }}>
                <div className="h-3 rounded-full transition-all"
                  style={{ width: `${Math.min(cap.capUtilizationPct, 100)}%`, background: cap.capUtilizationPct >= 100 ? "#D14343" : cap.capUtilizationPct >= 85 ? "#C98A1F" : "#2E9E62" }} />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Total Beneficiaries", value: cap.totalBeneficiaryCount ? Number(cap.totalBeneficiaryCount).toFixed(4) : "—", warn: false },
              { label: "Per-Beneficiary Cap", value: cap.perBeneficiaryCap ? `$${Number(cap.perBeneficiaryCap).toLocaleString()}` : "—", warn: false },
              { label: "Aggregate Cap Limit", value: cap.capLimit ? `$${Number(cap.capLimit).toLocaleString(undefined,{maximumFractionDigits:0})}` : "—", warn: false },
              { label: "Net Reimbursement", value: cap.netReimbursement ? `$${Number(cap.netReimbursement).toLocaleString(undefined,{maximumFractionDigits:0})}` : "—", warn: cap.capExposure > 0 },
            ].map((m, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: m.warn ? "#FEF3E2" : "#F5F6F8" }}>
                <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
                <div className="text-base font-mono mt-1" style={{ color: m.warn ? "#C98A1F" : "#16202E" }}>{m.value}</div>
              </div>
            ))}
          </div>
          {cap.capExposure > 0 && (
            <div className="mt-3 p-4 rounded-xl" style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
              <div className="text-sm font-semibold" style={{ color: "#D14343" }}>
                🔴 CAP EXCEEDED — ${Number(cap.capExposure).toLocaleString(undefined,{maximumFractionDigits:0})} owed to CMS
              </div>
              <div className="text-sm mt-1" style={{ color: "#B23A2E" }}>
                Net reimbursement exceeds aggregate cap. CMS will initiate clawback. Remittance required within 60 days of cap year close. Contact your MAC immediately.
              </div>
            </div>
          )}
          {!cap.capExposure && cap.capLimit > 0 && cap.netReimbursement > 0 && (
            <div className="mt-3 p-3 rounded-xl flex items-center gap-3" style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
              <CheckCircle2 size={16} color="#2E9E62" className="shrink-0" />
              <div className="text-sm" style={{ color: "#1A6E41" }}>
                Under cap. Headroom remaining: ${Number(cap.capLimit - cap.netReimbursement).toLocaleString(undefined,{maximumFractionDigits:0})}.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quality Metrics */}
      {(quality.cahpsOverallScore != null || quality.surveyDeficiencyCount > 0 || quality.pepperOutlierFlags > 0 || quality.qapiProjectCount > 0) && (
        <div className="rounded-2xl p-5"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} color="#B8863F" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Quality &amp; Survey Metrics</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "CAHPS Score", value: quality.cahpsOverallScore != null ? `${quality.cahpsOverallScore}%` : "—", warn: quality.cahpsOverallScore < 75, sub: quality.cahpsNationalAvg ? `Nat'l: ${quality.cahpsNationalAvg}%` : null },
              { label: "Survey Deficiencies", value: quality.surveyDeficiencyCount ?? "—", warn: quality.surveyDeficiencyCount > 0, sub: quality.surveyConditionLevel ? "⚠ Condition-level" : quality.openDeficiencies > 0 ? `${quality.openDeficiencies} open` : null },
              { label: "PEPPER Outlier Flags", value: quality.pepperOutlierFlags ?? "—", warn: quality.pepperOutlierFlags > 0, sub: quality.pepperOutlierFlags > 0 ? "Above threshold" : "Within range" },
              { label: "QAPI Projects", value: quality.qapiProjectCount ?? "—", warn: quality.qapiProjectCount === 0, sub: quality.qapiProjectCount > 0 ? "Active PIPs" : "No PIPs" },
            ].map((m, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: m.warn ? "#FEF3E2" : "#F5F6F8" }}>
                <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
                <div className="text-lg font-mono mt-1" style={{ color: m.warn ? "#C98A1F" : "#16202E" }}>{m.value}</div>
                {m.sub && <div className="text-[11px] font-mono mt-0.5" style={{ color: m.warn ? "#C98A1F" : "#8992A3" }}>{m.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PS&R Metrics */}
      {metrics && Object.values(metrics).some(v => v != null) && (
        <div className="rounded-2xl p-5"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} color="#B8863F" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">PS&amp;R Utilization Metrics</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Medicare Days", value: metrics.totalMedicareDays != null ? Number(metrics.totalMedicareDays).toLocaleString() : "—", warn: false },
              { label: "Total Claims", value: metrics.totalClaims != null ? Number(metrics.totalClaims).toLocaleString() : "—", warn: false },
              { label: "Unduplicated Census", value: metrics.totalUnduplicatedCensus != null ? Number(metrics.totalUnduplicatedCensus).toLocaleString() : "—", warn: false },
              { label: "Avg Length of Stay", value: metrics.avgLengthOfStay != null ? `${metrics.avgLengthOfStay} days` : "—", warn: metrics.avgLengthOfStay > 180 },
              { label: "SN Units (Rev 0551)", value: metrics.snVisitUnits != null ? Number(metrics.snVisitUnits).toLocaleString() : "—", warn: false },
              { label: "RN Intensity (units/day)", value: metrics.rnUnitsPerDay != null ? metrics.rnUnitsPerDay : "—", warn: metrics.rnUnitsPerDay < 1.0 },
              { label: "Gross Reimbursement", value: metrics.grossReimbursement != null ? `$${Number(metrics.grossReimbursement).toLocaleString(undefined,{maximumFractionDigits:0})}` : "—", warn: false },
              { label: "Net Reimbursement", value: metrics.netReimbursement != null ? `$${Number(metrics.netReimbursement).toLocaleString(undefined,{maximumFractionDigits:0})}` : "—", warn: false },
            ].map((m, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: m.warn ? "#FEF3E2" : "#F5F6F8" }}>
                <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
                <div className="text-base font-mono mt-1" style={{ color: m.warn ? "#C98A1F" : "#16202E" }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical Findings */}
      {findings.length > 0 && (
        <div className="rounded-2xl p-5 space-y-3"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} color="#D14343" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Critical Findings</span>
          </div>
          {findings.map((f, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-xl" style={{ background: "#F5F6F8" }}>
              <span className="text-[10px] uppercase font-mono px-2 py-1 rounded shrink-0 h-fit"
                style={{ background: severityColor(f.severity) + "1A", color: severityColor(f.severity) }}>
                {f.severity}
              </span>
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
                    <DollarSign size={11} />Clawback Risk: ${Number(f.clawbackRisk).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Drill-Down */}
      {categories.length > 0 && (
        <div className="space-y-3">
          {categories.map((cat) => {
            const open = openId === cat.id;
            return (
              <div key={cat.id} className="rounded-2xl overflow-hidden"
                style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
                <button onClick={() => setOpenId(open ? null : cat.id)}
                  className="w-full flex items-center gap-4 p-4 text-left">
                  <ScoreRing score={cat.score} size={54} stroke={6} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-base">{cat.label}</span>
                      {cat.source && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#E3E7ED", color: "#64708A" }}>{cat.source}</span>}
                      {cat.clawbackAmount > 0 && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "#FDECEA", color: "#D14343" }}>
                          🔴 ${Number(cat.clawbackAmount).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-1 truncate" style={{ color: "#64708A" }}>{cat.summary}</p>
                  </div>
                  {open ? <ChevronDown size={18} color="#64708A" /> : <ChevronRight size={18} color="#64708A" />}
                </button>
                {open && (
                  <div className="px-4 pb-5 pt-1 space-y-5" style={{ borderTop: "1px solid #E3E7ED" }}>
                    {cat.factors?.length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-widest font-mono mt-4 mb-2" style={{ color: "#64708A" }}>Scoring Factors</div>
                        <div className="space-y-2">
                          {cat.factors.map((f, i) => (
                            <div key={i} className="flex items-start gap-3">
                              <div className="w-10 shrink-0 text-right text-[11px] font-mono pt-0.5" style={{ color: "#8992A3" }}>{f.weight}%</div>
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
                              <CheckCircle2 size={15} className="shrink-0 mt-0.5" color="#2E9E62" />{a}
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
function UploadHub({ onAnalysisData, hasData, onDocsUpdated }) {
  const [files, setFiles] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...dropped.filter(f => !existing.has(f.name))];
    });
  }, []);

  const onFileSelect = (e) => {
    const selected = Array.from(e.target.files).filter(f => f.type === "application/pdf");
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...selected.filter(f => !existing.has(f.name))];
    });
    e.target.value = "";
  };

  const removeFile = (name) => setFiles(prev => prev.filter(f => f.name !== name));

  const analyze = async () => {
    if (files.length === 0) return;
    setAnalyzing(true); setError(null);
    
    try {
      // Step 1: Extract text from all files
      const reportSummaries = {};
      const extractedTexts = {};
      
      for (const file of files) {
        setProgress(`Reading ${file.name}…`);
        const text = await extractPDFText(file);
        const type = detectReportType(file.name, text);
        extractedTexts[file.name] = { type, text };
        reportSummaries[type] = (reportSummaries[type] || "") + `\n\n=== ${file.name} ===\n${text.substring(0, 2500)}`;
      }

      // Step 2: Save all files to document library
      setProgress("Saving to document library…");
      for (const file of files) {
        const { type, text } = extractedTexts[file.name];
        await saveDocumentToLibrary(DEMO_ORG_ID, {
          id: `doc_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
          filename: file.name,
          reportType: type,
          reportTypeLabel: getReportTypeLabel(type),
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
          textPreview: text.substring(0, 500),
          orgId: DEMO_ORG_ID,
        });
      }
      if (onDocsUpdated) onDocsUpdated();

      // Step 3: Build combined text for analysis
      const combinedText = Object.entries(reportSummaries)
        .map(([type, text]) => `\n\n====== ${type.toUpperCase()} REPORT ======\n${text}`)
        .join("\n")
        .substring(0, 5000);

      const reportsFound = Object.keys(reportSummaries);

      // Step 4: Call 1 — core metrics, SSVI, CAP, first categories
      setProgress(`Analyzing metrics & SSVI (1/2)… ${files.length} report${files.length > 1 ? "s" : ""} processing`);
      let part1 = null;
      let attempt = 0;
      while (!part1 && attempt < 3) {
        try {
          attempt++;
          const raw1 = await callClaude(SYSTEM_PROMPT_1, `REPORTS ANALYZED: ${reportsFound.join(", ")}\n\n${combinedText}`, 2000);
          part1 = parseJSON(raw1);
        } catch (e) {
          if (attempt === 3) throw e;
          setProgress(`Retrying analysis (attempt ${attempt + 1}/3)…`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      // Step 5: Call 2 — additional categories and critical findings
      setProgress("Generating findings & recommendations (2/2)…");
      let part2 = null;
      attempt = 0;
      while (!part2 && attempt < 3) {
        try {
          attempt++;
          const raw2 = await callClaude(SYSTEM_PROMPT_2, `REPORTS ANALYZED: ${reportsFound.join(", ")}\n\nAGENCY: ${part1.agencyName || "Unknown"}\nOVERALL SCORE: ${part1.overallComplianceScore || 0}\n\n${combinedText}`, 1500);
          part2 = parseJSON(raw2);
        } catch (e) {
          if (attempt === 3) {
            part2 = { complianceCategories: [], criticalFindings: [] };
          } else {
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }

      // Step 6: Merge and deliver
      const merged = {
        ...part1,
        reportsAnalyzed: reportsFound.map(getReportTypeLabel),
        complianceCategories: [
          ...(part1.complianceCategories || []),
          ...(part2.complianceCategories || []),
        ],
        criticalFindings: part2.criticalFindings || [],
      };

      onAnalysisData(merged);
      setFiles([]);

    } catch (e) {
      setError("Analysis failed: " + e.message + ". Please try again — your files were still saved to the Document Library.");
    } finally {
      setAnalyzing(false); setProgress("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl">Report Upload Center</div>
        <p className="text-sm mt-1" style={{ color: "#64708A" }}>
          Upload any combination of CMS reports. All uploads are automatically saved to your Document Library. The more reports you provide, the more accurate your SSVI score.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !analyzing && fileRef.current?.click()}
        className="rounded-2xl p-10 flex flex-col items-center justify-center gap-4 text-center cursor-pointer transition-all"
        style={{
          background: dragOver ? "#F7F0E1" : "#FFFFFF",
          border: `2px dashed ${dragOver ? "#B8863F" : "#C7CDD8"}`,
          boxShadow: "0 1px 3px rgba(16,24,40,0.04)",
        }}>
        <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" onChange={onFileSelect} />
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "#F7F0E1" }}>
          <Files size={28} color="#B8863F" />
        </div>
        <div>
          <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-xl">Drop all your reports here</div>
          <div className="text-sm mt-1" style={{ color: "#64708A" }}>
            PS&R · Beneficiary Count · PEPPER · CAHPS · QAPI · Survey Results · Policy Manuals · CMS Public Data
          </div>
          <div className="text-xs mt-2 font-mono" style={{ color: "#8992A3" }}>
            PDF only · Multiple files at once · AI auto-detects report type · All saved to Document Library
          </div>
        </div>
      </div>

      {/* Accepted types reference */}
      <div className="rounded-xl p-4" style={{ background: "#F5F6F8", border: "1px solid #E3E7ED" }}>
        <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#64708A" }}>Accepted Report Types</div>
        <div className="grid md:grid-cols-2 gap-1.5">
          {REPORT_TYPES.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.color }} />
              <span className="text-xs font-mono font-medium" style={{ color: "#16202E" }}>{r.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected files */}
      {files.length > 0 && (
        <div className="rounded-2xl p-5"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center justify-between mb-3">
            <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">
              {files.length} file{files.length > 1 ? "s" : ""} ready
            </div>
            <button onClick={() => setFiles([])} className="text-xs font-mono underline" style={{ color: "#64708A" }}>Clear all</button>
          </div>
          <div className="space-y-2 mb-4">
            {files.map((f) => {
              const typeId = detectReportType(f.name, "");
              const type = REPORT_TYPES.find(r => r.id === typeId);
              return (
                <div key={f.name} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#F5F6F8" }}>
                  <FileText size={15} color="#B8863F" className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: "#16202E" }}>{f.name}</div>
                    <div className="text-[11px] font-mono mt-0.5" style={{ color: "#64708A" }}>
                      {type?.label || "Auto-detecting"} · {(f.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <button onClick={() => removeFile(f.name)}><X size={14} color="#8992A3" /></button>
                </div>
              );
            })}
          </div>

          {analyzing ? (
            <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "#FBF3E4", border: "1px solid #EAD3A3" }}>
              <Loader2 size={18} color="#B8863F" className="animate-spin shrink-0" />
              <div>
                <div className="text-sm font-medium" style={{ color: "#B8863F" }}>{progress}</div>
                <div className="text-xs font-mono mt-0.5" style={{ color: "#8992A3" }}>
                  AI is reading all reports — up to 90 seconds for large batches. Do not close this tab.
                </div>
              </div>
            </div>
          ) : (
            <button onClick={analyze}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium"
              style={{ background: "#14213D", color: "#F3F5F8" }}>
              <Sparkles size={16} />
              Analyze {files.length} Report{files.length > 1 ? "s" : ""} — Generate Compliance Dashboard
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
          <AlertCircle size={16} color="#D14343" className="shrink-0 mt-0.5" />
          <span className="text-sm flex-1" style={{ color: "#B23A2E" }}>{error}</span>
          <button onClick={() => setError(null)}><X size={14} color="#B23A2E" /></button>
        </div>
      )}

      {hasData && !analyzing && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
          <CheckCircle2 size={18} color="#2E9E62" className="shrink-0" />
          <div className="text-sm flex-1" style={{ color: "#1A6E41" }}>
            <strong>Analysis complete.</strong> Your reports are saved to Document Library. View results on the Dashboard.
          </div>
          <button onClick={() => onAnalysisData(null)}
            className="text-xs font-mono px-3 py-1.5 rounded-lg"
            style={{ background: "#FDECEA", color: "#D14343", border: "1px solid #F3B8AC" }}>
            Clear
          </button>
        </div>
      )}

      {/* EIDM/CASPER hint */}
      <div className="rounded-xl p-4" style={{ background: "#F5F6F8", border: "1px solid #E3E7ED" }}>
        <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#64708A" }}>
          💡 Where to pull these reports
        </div>
        <div className="text-xs font-mono space-y-1" style={{ color: "#64708A" }}>
          <div>Log into <strong style={{ color: "#16202E" }}>EIDM</strong> at eidm.cms.gov → navigate to <strong style={{ color: "#16202E" }}>CASPER</strong> → Hospice Reports</div>
          <div>PS&R Summary = <strong style={{ color: "#B8863F" }}>Report Type 810</strong> · Beneficiary Count = <strong style={{ color: "#B8863F" }}>Report B51562</strong> · PEPPER = available in CASPER Reporting</div>
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
          All uploaded reports are stored here per clinic. The Copilot reads these documents to answer your compliance questions.
          {!SUPABASE_READY && (
            <span className="ml-1 font-mono" style={{ color: "#C98A1F" }}>
              (Session storage active — connect Supabase for permanent cross-session storage)
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 p-8 justify-center">
          <Loader2 size={20} className="animate-spin" color="#B8863F" />
          <span className="text-sm font-mono" style={{ color: "#64708A" }}>Loading documents…</span>
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center"
          style={{ background: "#FFFFFF", border: "2px dashed #C7CDD8" }}>
          <Library size={32} color="#C7CDD8" />
          <div style={{ fontFamily: "Fraunces, serif", color: "#8992A3" }} className="text-xl">No documents yet</div>
          <p className="text-sm" style={{ color: "#8992A3" }}>
            Upload reports in the Report Upload tab — they'll appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-mono" style={{ color: "#64708A" }}>
              {docs.length} document{docs.length > 1 ? "s" : ""} · Org: {DEMO_ORG_ID}
            </div>
          </div>
          {docs.map((doc) => (
            <div key={doc.id} className="rounded-2xl p-4 flex items-start gap-4"
              style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: typeColor(doc.reportType) + "15" }}>
                <FileText size={18} style={{ color: typeColor(doc.reportType) }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "#16202E" }}>{doc.filename}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded"
                    style={{ background: typeColor(doc.reportType) + "15", color: typeColor(doc.reportType) }}>
                    {doc.reportTypeLabel}
                  </span>
                  <span className="text-[11px] font-mono" style={{ color: "#8992A3" }}>
                    {(doc.fileSize / 1024).toFixed(0)} KB
                  </span>
                  <span className="text-[11px] font-mono" style={{ color: "#8992A3" }}>
                    {new Date(doc.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                {doc.textPreview && viewDoc === doc.id && (
                  <div className="mt-3 p-3 rounded-xl text-xs font-mono"
                    style={{ background: "#F5F6F8", color: "#64708A", whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
                    {doc.textPreview}…
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setViewDoc(viewDoc === doc.id ? null : doc.id)}
                  className="p-2 rounded-lg transition-colors"
                  style={{ background: "#F5F6F8" }}
                  title="Preview">
                  <Eye size={14} color="#64708A" />
                </button>
                <button onClick={() => handleDelete(doc.id)}
                  className="p-2 rounded-lg transition-colors"
                  style={{ background: "#F5F6F8" }}
                  title="Delete">
                  <Trash2 size={14} color="#D14343" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!SUPABASE_READY && docs.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: "#FEF3E2", border: "1px solid #F0C87A" }}>
          <div className="text-xs font-mono" style={{ color: "#7A5700" }}>
            <strong>⚠ Supabase not connected:</strong> Documents are stored in browser session storage and will be lost on page refresh. Connect Supabase to enable permanent per-clinic storage with full multi-tenant isolation. Each clinic will only see their own documents.
          </div>
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
    let attempt = 0;
    while (attempt < 3) {
      try {
        attempt++;
        const system = `You are a hospice compliance auditor. Audit this chart against Medicare Hospice CoP. Start response with { end with }. No other text. Format: {"overallAssessment":"2 sentence summary","issues":[{"severity":"high","category":"string","finding":"string","recommendation":"string"}],"strengths":["string"]} Max 3 issues, 2 strengths.`;
        const raw = await callClaude(system, text, 2000);
        setResult(parseJSON(raw));
        break;
      } catch (e) {
        if (attempt === 3) setError("Analysis error after 3 attempts: " + e.message);
        else await new Promise(r => setTimeout(r, 1500));
      }
    }
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <div className="flex items-center gap-2 mb-1">
          <FileText size={16} color="#B8863F" />
          <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Chart Auditor</span>
        </div>
        <p className="text-sm mb-3" style={{ color: "#64708A" }}>
          Paste chart text, certifications, or IDG notes. Claude flags missing elements and signature gaps against hospice CoP norms.
        </p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9}
          className="w-full rounded-lg p-3 text-sm font-mono focus:outline-none"
          style={{ background: "#F5F6F8", border: "1px solid #E3E7ED", color: "#16202E" }} />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={analyze} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: "#B8863F", color: "#1B2740" }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? "Analyzing…" : "Analyze chart"}
          </button>
          <button onClick={() => { setText(SAMPLE_CHART); setResult(null); setError(null); }}
            className="text-xs underline" style={{ color: "#64708A" }}>Reset to sample</button>
        </div>
      </div>
      {error && <div className="rounded-lg p-3 text-sm font-mono" style={{ background: "#FDECEA", color: "#B23A2E" }}>{error}</div>}
      {result && (
        <div className="rounded-2xl p-5 space-y-5" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED" }}>
          <div>
            <div className="text-xs uppercase tracking-widest font-mono mb-1" style={{ color: "#64708A" }}>Assessment</div>
            <p className="text-sm" style={{ color: "#16202E" }}>{result.overallAssessment}</p>
          </div>
          {result.issues?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#64708A" }}>Findings</div>
              <div className="space-y-2">
                {result.issues.map((iss, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg" style={{ background: "#F5F6F8" }}>
                    <span className="text-[10px] uppercase font-mono px-2 py-1 rounded shrink-0 h-fit"
                      style={{ background: severityColor(iss.severity) + "1A", color: severityColor(iss.severity) }}>
                      {iss.severity}
                    </span>
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
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5" color="#2E9E62" />{s}
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
    checklist:["Update the intake SOP so the addendum request trigger fires at election.","Retrain admissions staff on the 3-day window.","Audit the last 30 days of elections for addendum timing gaps."] },
  { id:"r2", date:"2026-06-10", source:"CMS", tag:"Payment / Billing", severity:"high",
    title:"FY2027 Hospice Proposed Rule — SSVI introduced as public scoring tool",
    summary:"CMS introduced the SSVI (0-16 scale) built from claims data. Utilization Score (0-8) covers RN visit intensity, LOS, live discharge rates, GIP ratio, weekend visits. Non-Hospice Spending Score (0-8) covers Part A/B spending for enrolled beneficiaries. Scores posted publicly on CMS Hospice Center webpage.",
    impact:"Scores ≥10 signal meaningful deviation and may trigger additional program integrity review. Upload your PS&R and CMS Public Data to AIHospiceOS to estimate your score now.",
    checklist:["Pull your SSVI score from CMS Hospice Center webpage.","Upload PS&R 810 + Beneficiary Count B51562 to AIHospiceOS for CAP and SSVI analysis.","Upload PEPPER report for outlier pattern review.","Review RN visit intensity — Rev 0551 units ÷ Medicare days. Under 1.0 is an SSVI risk flag.","Download CMS public SSVI data file and upload to get your actual published score."] },
  { id:"r3", date:"2026-05-14", source:"OIG", tag:"Program Integrity", severity:"medium",
    title:"OIG work plan adds hospice GIP level-of-care review",
    summary:"OIG focused on GIP level-of-care determinations — whether documentation supports acuity required for GIP billing.",
    impact:"GIP documentation is a near-term audit target. Pre-emptive auditing strongly advised.",
    checklist:["Audit all open and recent GIP stays for acuity documentation.","Share OIG focus area with DON and billing team as standing agenda item."] },
  { id:"r4", date:"2026-04-30", source:"CMS", tag:"Survey / Oversight", severity:"medium",
    title:"CMS posts provider-level SSVI scores publicly on Hospice Center webpage",
    summary:"FY2024 and FY2025 SSVI scores are now publicly posted. FY2025 national avg: 6.42, median: 7. 833 hospices (12.5%) scored ≥10.",
    impact:"Referral sources, families, and payers can see your SSVI score. High scores are visible to anyone researching your agency.",
    checklist:["Look up your SSVI score on CMS Hospice Center webpage.","If score ≥8, develop a remediation plan before next reporting cycle.","Document SSVI outlier response in your QAPI program.","Download CMS SSVI public data file and upload to AIHospiceOS."] },
];

function RegulatoryWatch() {
  const [checked, setChecked] = useState({});
  const toggle = (id, i) => setChecked((c) => ({ ...c, [`${id}-${i}`]: !c[`${id}-${i}`] }));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen size={16} color="#B8863F" />
        <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Regulatory Watch</span>
      </div>
      <p className="text-sm -mt-2" style={{ color: "#64708A" }}>New and changed hospice requirements, translated into what your agency needs to do.</p>
      {REG_UPDATES.map((r) => {
        const total = r.checklist.length;
        const done = r.checklist.filter((_, i) => checked[`${r.id}-${i}`]).length;
        return (
          <div key={r.id} className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-mono px-2 py-1 rounded"
                  style={{ background: severityColor(r.severity) + "1A", color: severityColor(r.severity) }}>
                  {r.severity} impact
                </span>
                <span className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{r.source} · {r.tag}</span>
              </div>
              <span className="text-[11px] font-mono flex items-center gap-1 shrink-0" style={{ color: "#8992A3" }}>
                <Clock size={12} />{r.date}
              </span>
            </div>
            <h3 className="mt-2 text-base" style={{ fontFamily: "Fraunces, serif", color: "#16202E" }}>{r.title}</h3>
            <p className="text-sm mt-2" style={{ color: "#64708A" }}>{r.summary}</p>
            <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: "#F5F6F8", color: "#16202E" }}>
              <span className="font-mono text-xs" style={{ color: "#B8863F" }}>What it means for you: </span>{r.impact}
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
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
                      {isChecked && <CheckCircle2 size={11} color="#FFFFFF" />}
                    </div>
                    <span className="text-sm" style={{ color: isChecked ? "#64708A" : "#16202E", textDecoration: isChecked ? "line-through" : "none" }}>
                      {item}
                    </span>
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

// ─── COPILOT ──────────────────────────────────────────────────────────────────
function Copilot({ analysisData, orgId }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "I'm your compliance copilot. I have access to your uploaded documents and can answer questions about your PS&R metrics, SSVI score, CAP exposure, PEPPER findings, CAHPS scores, survey deficiencies, or any hospice regulatory question. What would you like to know?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [libraryDocs, setLibraryDocs] = useState([]);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    getDocumentLibrary(orgId || DEMO_ORG_ID).then(docs => setLibraryDocs(docs || []));
  }, [orgId]);

  const buildContext = () => {
    let ctx = "";
    if (analysisData) {
      ctx += `CURRENT ANALYSIS DATA:\nAgency: ${analysisData.agencyName}\nSSVI Score: ${analysisData.ssviScore}/16 (${analysisData.ssviIsEstimated ? "estimated" : "actual"})\nCompliance Score: ${analysisData.overallComplianceScore}/100\nRisk Level: ${analysisData.overallRiskLevel}\nCAP Exposure: $${analysisData.capData?.capExposure || 0}\nReports analyzed: ${analysisData.reportsAnalyzed?.join(", ")}\n`;
      if (analysisData.criticalFindings?.length > 0) {
        ctx += `Critical Findings: ${analysisData.criticalFindings.map(f => `${f.severity}: ${f.finding}`).join("; ")}\n`;
      }
    }
    if (libraryDocs.length > 0) {
      ctx += `\nDOCUMENT LIBRARY (${libraryDocs.length} documents stored for this clinic):\n`;
      libraryDocs.slice(0, 10).forEach(doc => {
        ctx += `- ${doc.reportTypeLabel}: ${doc.filename} (uploaded ${new Date(doc.uploadedAt).toLocaleDateString()})\n`;
        if (doc.textPreview) ctx += `  Preview: ${doc.textPreview.substring(0, 200)}\n`;
      });
    }
    return ctx || "No reports uploaded yet.";
  };

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    let attempt = 0;
    while (attempt < 3) {
      try {
        attempt++;
        const context = buildContext();
        const system = `You are the AI Compliance Copilot inside AIHospiceOS for hospice CEOs, owners, and Directors of Clinical Services. You have access to the following data for this specific clinic only:

${context}

Answer questions about PS&R Report 810, Beneficiary Count B51562, PEPPER, CAHPS, QAPI, survey deficiencies, SSVI scoring, MAC/RAC audits, CAP exposure, and Medicare Hospice CoP clearly for an executive audience. Reference specific revenue codes (0551=SN visits, 0651=RHC days, 0571=aide visits), report types, and dollar amounts from the uploaded documents where relevant. Keep answers under 200 words, conversational but precise. Always answer based on this clinic's specific data when available.`;
        const reply = await callClaude(system, q, 600);
        setMessages((m) => [...m, { role: "assistant", text: reply.trim() }]);
        break;
      } catch (e) {
        if (attempt === 3) {
          setMessages((m) => [...m, { role: "assistant", text: "Something went wrong after 3 attempts — please try again." }]);
        } else {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="rounded-2xl flex flex-col h-[65vh] md:h-[calc(100vh-7rem)] md:max-h-[52rem]"
      style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
      <div className="p-4 flex items-center gap-2" style={{ borderBottom: "1px solid #E3E7ED" }}>
        <MessageSquare size={16} color="#B8863F" />
        <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Compliance Copilot</span>
        <div className="ml-auto flex items-center gap-2">
          {analysisData && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "#EAF6EF", color: "#2E9E62" }}>
              ✓ Report data loaded
            </span>
          )}
          {libraryDocs.length > 0 && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "#F7F0E1", color: "#B8863F" }}>
              📚 {libraryDocs.length} docs in library
            </span>
          )}
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
              <Loader2 size={13} className="animate-spin" /> thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-3 flex gap-2" style={{ borderTop: "1px solid #E3E7ED" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about SSVI, CAP exposure, survey findings, document history…"
          className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
          style={{ background: "#F5F6F8", border: "1px solid #E3E7ED", color: "#16202E" }} />
        <button onClick={send} disabled={loading}
          className="rounded-lg px-3 flex items-center justify-center"
          style={{ background: "#B8863F", color: "#1B2740" }}>
          <Send size={15} />
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
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 text-left">
        <div className="flex items-center gap-2">
          <Calendar size={16} color="#B8863F" />
          <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">
            Recertification Windows &amp; FTF Tracking
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "#FDECEA", color: "#D14343" }}>2 Missing FTF</span>
        </div>
        {open ? <ChevronDown size={18} color="#64708A" /> : <ChevronRight size={18} color="#64708A" />}
      </button>
      {open && (
        <div className="px-5 pb-6 pt-1 space-y-4" style={{ borderTop: "1px solid #E3E7ED" }}>
          <p className="text-sm" style={{ color: "#64708A" }}>
            Medicare requires a Face-to-Face encounter prior to the 180-day recertification. Missing by one day causes 100% claim suspension.
          </p>
          {MOCK_PATIENTS.map((p, i) => {
            const pct = (p.day / p.totalDays) * 100;
            const isRed = p.day >= 170 && !p.ftfComplete;
            const isWarn = p.day >= 160 && !p.ftfComplete;
            const barColor = isRed ? "#D14343" : isWarn ? "#C98A1F" : "#2E9E62";
            return (
              <div key={i} className="rounded-xl p-4"
                style={{ background: isRed ? "#FDECEA" : isWarn ? "#FEF3E2" : "#F5F6F8", border: `1px solid ${barColor}20` }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-medium text-sm" style={{ color: "#16202E" }}>{p.name}</div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: "#64708A" }}>{p.diagnosis}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-semibold" style={{ color: barColor }}>Day {p.day} of {p.totalDays}</div>
                    {!p.ftfComplete && p.day >= 170 && (
                      <div className="text-[11px] font-mono mt-0.5 px-2 py-0.5 rounded" style={{ background: "#FDECEA", color: "#D14343" }}>⚠ Missing FTF</div>
                    )}
                    {p.ftfComplete && (
                      <div className="text-[11px] font-mono mt-0.5 px-2 py-0.5 rounded" style={{ background: "#EAF6EF", color: "#2E9E62" }}>✓ FTF Complete</div>
                    )}
                  </div>
                </div>
                <div className="w-full rounded-full h-2" style={{ background: "#E3E7ED" }}>
                  <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] font-mono" style={{ color: "#8992A3" }}>Day 0</span>
                  <span className="text-[10px] font-mono" style={{ color: "#8992A3" }}>Day 180</span>
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
  { id: "copilot", label: "Copilot", icon: MessageSquare },
];

const CONTENT_MAX_W = {
  dashboard: "max-w-5xl", upload: "max-w-4xl", library: "max-w-4xl",
  chart: "max-w-4xl", reg: "max-w-4xl", copilot: "max-w-2xl",
};

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#B8863F" }}>
        <ShieldCheck size={19} color="#1B2740" />
      </div>
      <div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#F3F5F8" }} className="text-xl leading-none">AIHospiceOS</div>
        <div className="text-[11px] font-mono mt-0.5" style={{ color: "#93A0B8" }}>PS&amp;R · CAP · SSVI · PEPPER · CAHPS</div>
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
      <ShieldCheck size={16} color="#B8863F" className="shrink-0" />
      <span className="text-sm flex-1" style={{ color: "#16202E" }}>Install AIHospiceOS for quick, full-screen access.</span>
      <button onClick={async () => { prompt.prompt(); await prompt.userChoice; setPrompt(null); }}
        className="text-xs font-medium rounded-lg px-3 py-1.5 shrink-0"
        style={{ background: "#B8863F", color: "#1B2740" }}>Install</button>
      <button onClick={() => setDismissed(true)} className="text-xs shrink-0" style={{ color: "#64708A" }}>Not now</button>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function AIHospiceOS() {
  const [tab, setTab] = useState("dashboard");
  const [analysisData, setAnalysisData] = useState(null);
  const [libRefresh, setLibRefresh] = useState(0);

  const handleAnalysisData = (data) => {
    setAnalysisData(data);
    if (data) setTab("dashboard");
  };

  const handleDocsUpdated = () => {
    setLibRefresh(n => n + 1);
  };

  return (
    <div style={{ background: "#F5F6F8", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}
      className="flex flex-col md:flex-row">
      <style>{FONT_IMPORT}</style>
      <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:h-screen md:sticky md:top-0 px-5 py-6"
        style={{ background: "#14213D", borderRight: "1px solid #1E2C4E" }}>
        <Logo />
        <nav className="mt-8 flex flex-col gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-left transition-colors"
                style={{ background: active ? "#1E2C4E" : "transparent", color: active ? "#F3F5F8" : "#93A0B8" }}>
                <Icon size={16} />{t.label}
              </button>
            );
          })}
        </nav>
        {analysisData && (
          <div className="mt-4 rounded-lg px-3 py-2" style={{ background: "#1E2C4E" }}>
            <div className="text-[11px] font-mono" style={{ color: "#93A0B8" }}>Loaded agency</div>
            <div className="text-xs font-medium mt-0.5 truncate" style={{ color: "#F3F5F8" }}>
              {analysisData.agencyName || "Unknown"}
            </div>
            {analysisData.ssviScore != null && (
              <div className="text-[11px] font-mono mt-1" style={{ color: ssviColor(analysisData.ssviScore) }}>
                SSVI: {analysisData.ssviScore}/16 · {ssviLabel(analysisData.ssviScore)}
              </div>
            )}
            {analysisData.reportsAnalyzed?.length > 0 && (
              <div className="text-[10px] font-mono mt-1" style={{ color: "#6B7A99" }}>
                {analysisData.reportsAnalyzed.length} report{analysisData.reportsAnalyzed.length > 1 ? "s" : ""} loaded
              </div>
            )}
          </div>
        )}
        <div className="mt-auto text-[11px] font-mono leading-relaxed" style={{ color: "#6B7A99" }}>
          Executive compliance platform for hospice CEOs &amp; Directors.
          {!SUPABASE_READY && <div className="mt-1" style={{ color: "#C98A1F" }}>⚠ Supabase: not connected</div>}
        </div>
      </aside>

      <div className="md:hidden px-4 pt-6 pb-4" style={{ background: "#14213D" }}>
        <Logo />
      </div>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <InstallBanner />
        <div className={`${CONTENT_MAX_W[tab] || "max-w-5xl"} mx-auto px-4 md:px-8 py-4 md:py-8 pb-28 md:pb-10`}>
          {tab === "dashboard" && <Dashboard analysisData={analysisData} />}
          {tab === "upload" && (
            <UploadHub
              onAnalysisData={handleAnalysisData}
              hasData={!!analysisData}
              onDocsUpdated={handleDocsUpdated}
            />
          )}
          {tab === "library" && <DocumentLibrary refreshTrigger={libRefresh} />}
          {tab === "chart" && <ChartReview />}
          {tab === "reg" && <RegulatoryWatch />}
          {tab === "copilot" && <Copilot analysisData={analysisData} orgId={DEMO_ORG_ID} />}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 flex items-stretch z-10"
        style={{ background: "#14213D", borderTop: "1px solid #1E2C4E", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium"
              style={{ color: active ? "#B8863F" : "#93A0B8" }}>
              <Icon size={18} />{t.label.split(" ")[0]}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
