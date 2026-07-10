import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Activity, FileText, ShieldCheck, MessageSquare, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronRight, Send, Sparkles,
  TrendingUp, TrendingDown, Clock, BookOpen, Loader2, Stethoscope,
  ClipboardList, Minus, Upload, DollarSign, AlertCircle, X,
  BarChart3, FileSearch, Calendar, Users, Lock, ArrowRight,
  Home, PieChart,
} from "lucide-react";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

const MODEL = "claude-sonnet-4-6";

async function callClaude(system, userText, maxTokens = 2000) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function stripJsonFence(text) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

const statusColor = (s) => s === "good" ? "#2E9E62" : s === "warn" ? "#C98A1F" : "#D14343";
const severityColor = (s) => s === "high" ? "#D14343" : s === "medium" ? "#C98A1F" : "#2E9E62";
const scoreColor = (s) => s >= 85 ? "#2E9E62" : s >= 70 ? "#C98A1F" : "#D14343";

function ScoreRing({ score, size = 84, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
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

function TrendBadge({ trend }) {
  const Icon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const color = trend > 0 ? "#2E9E62" : trend < 0 ? "#D14343" : "#64708A";
  return (
    <span style={{ color }} className="inline-flex items-center gap-1 text-xs font-mono">
      <Icon size={13} />{trend === 0 ? "flat" : `${trend > 0 ? "+" : ""}${trend} pts`}
    </span>
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
          · Clawback Risk: <strong>${Number(clawback).toLocaleString()}</strong>
        </span>
      )}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const DASHBOARD_CATEGORIES = [
  {
    id: "clinical", label: "Clinical Documentation", score: 87, trend: 3,
    summary: "Charting is strong overall. A handful of recert narratives are running thin on decline-specific detail.",
    factors: [
      { weight: 40, label: "Physician narrative specificity", status: "good", detail: "38 of 41 recertifications include disease-specific decline indicators tied to the terminal diagnosis." },
      { weight: 25, label: "IDG note timeliness", status: "good", detail: "All interdisciplinary group notes filed within 24 hours of the meeting." },
      { weight: 20, label: "Plan of care alignment", status: "warn", detail: "6 charts show a POC goal that isn't revisited in the following IDG note." },
      { weight: 15, label: "Visit frequency vs. POC", status: "warn", detail: "3 patients had a scheduled SN visit skipped without a documented reason." },
    ],
    actions: ["Add a decline-indicator prompt to the recert narrative template.", "Require IDG notes to reference the specific POC goal number.", "Route missed-visit charts to the DON queue for same-week documentation."],
  },
  {
    id: "billing", label: "Billing Accuracy", score: 74, trend: -5,
    summary: "Trending down. GIP days are outpacing supporting documentation.",
    factors: [
      { weight: 35, label: "Level-of-care support", status: "risk", detail: "4 GIP stays exceed 5 days without a re-assessment note justifying continued GIP." },
      { weight: 30, label: "HIS/claims alignment", status: "good", detail: "Admission and discharge HIS records match claims data for 96% of episodes." },
      { weight: 20, label: "NOE/NOTR timeliness", status: "good", detail: "Notices of election filed within the 5-day window for all October admissions." },
      { weight: 15, label: "Physician certification timing", status: "warn", detail: "2 certifications signed after the required window." },
    ],
    actions: ["Pull the 4 GIP charts over 5 days and get a same-day re-assessment note.", "Add a late-certification justification field that blocks claim submission."],
  },
  {
    id: "survey", label: "Survey Readiness", score: 91, trend: 1,
    summary: "Strong position. Emergency preparedness drill documentation is the only open item.",
    factors: [
      { weight: 30, label: "CoP tag closure rate", status: "good", detail: "All tags from the last state survey closed within their POC timelines." },
      { weight: 25, label: "QAPI program activity", status: "good", detail: "QAPI committee met on schedule with documented PIPs for 3 focus areas." },
      { weight: 25, label: "Emergency preparedness", status: "warn", detail: "Annual full-scale drill documentation is 40 days overdue." },
      { weight: 20, label: "Personnel file completeness", status: "good", detail: "Competency and background-check files complete for 100% of active staff." },
    ],
    actions: ["Schedule and document the overdue full-scale emergency preparedness drill this month."],
  },
  {
    id: "quality", label: "Quality Measures", score: 82, trend: 2,
    summary: "HIS composite measures are on target; pain assessment timeliness needs a push.",
    factors: [
      { weight: 40, label: "HIS composite measures", status: "good", detail: "7 of 7 HIS process measures at or above the national benchmark." },
      { weight: 30, label: "Pain assessment timeliness", status: "warn", detail: "Comprehensive pain assessment completed within 5 days for 88% of admissions (target 95%)." },
      { weight: 30, label: "CAHPS Hospice Survey signal", status: "good", detail: "Family communication ratings trending above regional average." },
    ],
    actions: ["Add a pain-assessment due-date alert at day 3 post-admission for intake nurses."],
  },
  {
    id: "cap", label: "CAP Utilization", score: 71, trend: -8,
    summary: "Cap utilization trending toward risk threshold. Current trajectory puts agency at 89% by year end.",
    factors: [
      { weight: 50, label: "Aggregate cap exposure", status: "warn", detail: "Current utilization at 79% with 3 months remaining in the cap year." },
      { weight: 30, label: "Long-stay patient ratio", status: "warn", detail: "14% of census has exceeded 180 days — above the 10% benchmark." },
      { weight: 20, label: "Live discharge rate", status: "good", detail: "Live discharge rate at 17% — within acceptable MAC threshold." },
    ],
    actions: ["Run a cap projection for remaining months.", "Review long-stay patients for continued eligibility documentation.", "Brief CFO on projected cap exposure before year end."],
  },
  {
    id: "denial", label: "Denial Risk", score: 68, trend: -8,
    summary: "Highest-risk category. Face-to-face documentation gaps are the leading denial driver.",
    factors: [
      { weight: 45, label: "Face-to-face encounter documentation", status: "risk", detail: "5 recert F2F notes lack an explicit clinical-eligibility statement tied to the encounter." },
      { weight: 30, label: "Terminal prognosis support", status: "warn", detail: "Supporting documentation for 6-month prognosis is generic in 4 charts." },
      { weight: 25, label: "Related vs. unrelated diagnosis coding", status: "good", detail: "Coding review shows correct related/unrelated classification in 97% of claims." },
    ],
    actions: ["Have the F2F-performing clinician add a direct eligibility statement to the 5 flagged notes.", "Strengthen prognosis narratives with disease-specific clinical indicators."],
  },
];

function Dashboard() {
  const [openId, setOpenId] = useState("denial");
  const overall = Math.round(DASHBOARD_CATEGORIES.reduce((s, c) => s + c.score, 0) / DASHBOARD_CATEGORIES.length);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 flex flex-col gap-6"
        style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <div className="flex items-center gap-5">
          <ScoreRing score={overall} size={104} stroke={9} />
          <div>
            <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "#64708A" }}>
              Composite Compliance Index
            </div>
            <div className="text-2xl mt-1" style={{ fontFamily: "Fraunces, serif", color: "#16202E" }}>
              Meridian Hospice &amp; Palliative Care
            </div>
            <div className="text-sm mt-1" style={{ color: "#64708A" }}>
              8 charts flagged · 2 categories trending down · next mock survey in 41 days
            </div>
          </div>
        </div>
        <div className="w-full flex flex-wrap gap-3 pt-5 border-t" style={{ borderColor: "#E3E7ED" }}>
          {DASHBOARD_CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setOpenId(c.id)}
              className="text-left rounded-lg px-3 py-2 transition-colors"
              style={{
                background: openId === c.id ? "#F7F0E1" : "transparent",
                border: "1px solid " + (openId === c.id ? "#E8CFA0" : "transparent"),
                flex: "1 1 160px", minWidth: 0,
              }}>
              <div className="text-[11px] font-mono leading-snug" style={{ color: "#64708A" }}>{c.label}</div>
              <div className="flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-lg font-mono" style={{ color: scoreColor(c.score) }}>{c.score}</span>
                <TrendBadge trend={c.trend} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {DASHBOARD_CATEGORIES.map((cat) => {
          const open = openId === cat.id;
          return (
            <div key={cat.id} className="rounded-2xl overflow-hidden"
              style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
              <button onClick={() => setOpenId(open ? null : cat.id)}
                className="w-full flex items-center gap-4 p-4 text-left">
                <ScoreRing score={cat.score} size={54} stroke={6} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-base">{cat.label}</span>
                    <TrendBadge trend={cat.trend} />
                  </div>
                  <p className="text-sm mt-1 truncate" style={{ color: "#64708A" }}>{cat.summary}</p>
                </div>
                {open ? <ChevronDown size={18} color="#64708A" /> : <ChevronRight size={18} color="#64708A" />}
              </button>
              {open && (
                <div className="px-4 pb-5 pt-1 space-y-5" style={{ borderTop: "1px solid #E3E7ED" }}>
                  <div>
                    <div className="text-xs uppercase tracking-widest font-mono mt-4 mb-2" style={{ color: "#64708A" }}>Why this score</div>
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
                  <div>
                    <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#B8863F" }}>To raise this score</div>
                    <ul className="space-y-1.5">
                      {cat.actions.map((a, i) => (
                        <li key={i} className="text-sm flex gap-2" style={{ color: "#16202E" }}>
                          <CheckCircle2 size={15} className="shrink-0 mt-0.5" color="#2E9E62" />{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── UPLOAD HUB ──────────────────────────────────────────────────────────────
const PSR_SYSTEM_PROMPT = `You are an expert Medicare hospice compliance analyst inside AIHospiceOS for hospice CEOs and Directors. You have been given raw text from a CMS PS&R (Provider Statistical & Reimbursement) report. Extract all key data fields and score the agency against SSVI benchmarks and MAC/RAC audit thresholds. Calculate clawback risk in dollars.

Respond with ONLY valid JSON, no markdown fences:
{
  "agencyName": "string or Unknown Agency",
  "reportPeriod": "string or Unknown Period",
  "overallScore": number 0-100,
  "overallRiskLevel": "high|medium|low",
  "totalReimbursement": number or 0,
  "estimatedClawbackRisk": number or 0,
  "categories": [
    { "id": "string", "label": "string", "score": number, "trend": number, "riskLevel": "high|medium|low", "clawbackAmount": number, "auditReason": "string", "summary": "string",
      "factors": [{ "weight": number, "label": "string", "status": "good|warn|risk", "detail": "string" }],
      "actions": ["string"] }
  ],
  "criticalFindings": [{ "severity": "high|medium|low", "category": "string", "finding": "string", "recommendation": "string", "clawbackRisk": number }],
  "psrMetrics": {
    "capUtilizationPct": number or null, "gipRatioPct": number or null,
    "continuousCareRatioPct": number or null, "liveDischargePct": number or null,
    "avgLengthOfStay": number or null, "totalPatientDays": number or null,
    "routineHomeCareRatioPct": number or null, "avgRnVisitMinutes": number or null
  }
}
Score categories must include: cap_utilization, level_of_care_mix, live_discharge, length_of_stay, billing_accuracy, survey_readiness, rn_visit_length.
Use authentic jargon: MAC/RAC audits, LCD guidelines, FAST scale, functional decline, face-to-face encounter, GIP, cap aggregate, Conditions of Participation, HIS measures, QAPI.
Flag RN visit averages under 35 minutes as audit risk. Flag GIP ratios over 10% as high risk. Flag live discharge over 20% as eligibility risk. Cap overage clawback = overage × $200/day.`;

const CAP_SYSTEM_PROMPT = `You are a Medicare hospice CAP (aggregate cap) specialist inside AIHospiceOS. You have been given raw text from a hospice CAP report. Extract the cap data and calculate financial exposure.

Respond with ONLY valid JSON, no markdown fences:
{
  "agencyName": "string or Unknown Agency",
  "capYear": "string",
  "totalMedicareReimbursement": number or 0,
  "capAmount": number or 0,
  "capUtilizationPct": number or 0,
  "overCapAmount": number or 0,
  "projectedYearEndUtilization": number or 0,
  "riskLevel": "high|medium|low",
  "totalBeneficiaries": number or 0,
  "perBeneficiaryCap": number or 0,
  "findings": [{ "severity": "high|medium|low", "finding": "string", "recommendation": "string", "dollarImpact": number }],
  "monthlyTrend": [{ "month": "string", "utilization": number }]
}
If cap utilization exceeds 100%, riskLevel must be high and overCapAmount must reflect dollars owed back to CMS.
If between 85-100%, riskLevel is medium. Under 85% is low.
Per-beneficiary cap for current year is approximately $34,465. Use this if not found in the report.`;

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

function UploadZone({ label, description, icon: Icon, onFile, loading, result, comingSoon }) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    if (!comingSoon) onFile(e.dataTransfer.files[0]);
  }, [comingSoon, onFile]);

  if (comingSoon) {
    return (
      <div className="rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center"
        style={{ background: "#F5F6F8", border: "2px dashed #C7CDD8" }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#E3E7ED" }}>
          <Lock size={22} color="#8992A3" />
        </div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#8992A3" }} className="text-lg">{label}</div>
        <div className="text-sm" style={{ color: "#8992A3" }}>{description}</div>
        <span className="text-xs font-mono px-3 py-1 rounded-full"
          style={{ background: "#E3E7ED", color: "#64708A" }}>Coming Soon</span>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => !loading && fileRef.current?.click()}
      className="rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all"
      style={{
        background: result ? "#EAF6EF" : dragOver ? "#F7F0E1" : "#FFFFFF",
        border: `2px dashed ${result ? "#2E9E62" : dragOver ? "#B8863F" : "#C7CDD8"}`,
        boxShadow: "0 1px 3px rgba(16,24,40,0.04)",
      }}>
      <input ref={fileRef} type="file" accept=".pdf" className="hidden"
        onChange={(e) => onFile(e.target.files[0])} />
      <div className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: result ? "#C5EDDA" : "#F7F0E1" }}>
        {loading ? <Loader2 size={22} color="#B8863F" className="animate-spin" /> :
          result ? <CheckCircle2 size={22} color="#2E9E62" /> :
          <Icon size={22} color="#B8863F" />}
      </div>
      <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">{label}</div>
      <div className="text-sm" style={{ color: "#64708A" }}>{description}</div>
      {loading && <div className="text-xs font-mono" style={{ color: "#B8863F" }}>Analyzing with AI…</div>}
      {result && <div className="text-xs font-mono" style={{ color: "#2E9E62" }}>✓ Analysis complete — scroll down to view</div>}
      {!loading && !result && (
        <div className="text-xs font-mono px-3 py-1 rounded-full"
          style={{ background: "#F7F0E1", color: "#B8863F" }}>
          Drop PDF here or click to browse
        </div>
      )}
    </div>
  );
}

// ─── CAP REPORT RESULTS ───────────────────────────────────────────────────────
function CapResults({ result, onClear }) {
  if (!result) return null;
  const over = result.overCapAmount > 0;
  const pct = result.capUtilizationPct || 0;
  const barColor = pct >= 100 ? "#D14343" : pct >= 85 ? "#C98A1F" : "#2E9E62";

  return (
    <div className="space-y-4 mt-4">
      <div className="rounded-2xl p-6"
        style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "#64708A" }}>CAP Analysis</div>
            <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl mt-1">{result.agencyName}</div>
            <div className="text-sm font-mono mt-1" style={{ color: "#64708A" }}>Cap Year: {result.capYear}</div>
          </div>
          <button onClick={onClear} className="text-xs font-mono underline" style={{ color: "#64708A" }}>Clear</button>
        </div>

        <div className="mt-5">
          <div className="flex justify-between mb-1">
            <span className="text-sm font-mono" style={{ color: "#16202E" }}>Cap Utilization</span>
            <span className="text-sm font-mono font-bold" style={{ color: barColor }}>{pct}%</span>
          </div>
          <div className="w-full rounded-full h-3" style={{ background: "#E3E7ED" }}>
            <div className="h-3 rounded-full transition-all"
              style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[11px] font-mono" style={{ color: "#8992A3" }}>$0</span>
            <span className="text-[11px] font-mono" style={{ color: "#8992A3" }}>
              Cap Limit: ${Number(result.capAmount).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Reimbursement", value: `$${Number(result.totalMedicareReimbursement).toLocaleString()}`, warn: false },
            { label: "Cap Amount", value: `$${Number(result.capAmount).toLocaleString()}`, warn: false },
            { label: "Over-Cap Exposure", value: over ? `$${Number(result.overCapAmount).toLocaleString()}` : "$0", warn: over },
            { label: "Total Beneficiaries", value: Number(result.totalBeneficiaries).toLocaleString(), warn: false },
          ].map((m, i) => (
            <div key={i} className="rounded-xl p-3" style={{ background: m.warn ? "#FDECEA" : "#F5F6F8" }}>
              <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
              <div className="text-lg font-mono mt-1" style={{ color: m.warn ? "#D14343" : "#16202E" }}>{m.value}</div>
            </div>
          ))}
        </div>

        {over && (
          <div className="mt-4 p-4 rounded-xl flex items-start gap-3"
            style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
            <AlertTriangle size={18} color="#D14343" className="shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold" style={{ color: "#D14343" }}>
                🔴 Cap Exceeded — ${Number(result.overCapAmount).toLocaleString()} Owed to CMS
              </div>
              <div className="text-sm mt-1" style={{ color: "#B23A2E" }}>
                This agency has exceeded its Medicare aggregate cap. CMS will initiate a clawback of overpaid amounts. Immediate action required.
              </div>
            </div>
          </div>
        )}
      </div>

      {result.findings?.length > 0 && (
        <div className="rounded-2xl p-5 space-y-3"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} color="#D14343" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">CAP Findings</span>
          </div>
          {result.findings.map((f, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-xl" style={{ background: "#F5F6F8" }}>
              <span className="text-[10px] uppercase font-mono px-2 py-1 rounded shrink-0 h-fit"
                style={{ background: severityColor(f.severity) + "1A", color: severityColor(f.severity) }}>
                {f.severity}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm" style={{ color: "#16202E" }}>{f.finding}</div>
                <div className="text-sm mt-1" style={{ color: "#64708A" }}>→ {f.recommendation}</div>
                {f.dollarImpact > 0 && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded"
                    style={{ background: "#FDECEA", color: "#D14343" }}>
                    <DollarSign size={11} />Dollar Impact: ${Number(f.dollarImpact).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PS&R RESULTS ────────────────────────────────────────────────────────────
function PSRResults({ result, onClear }) {
  const [activeCategory, setActiveCategory] = useState(null);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    if (result?.categories?.[0]) setActiveCategory(result.categories[0].id);
  }, [result]);

  if (!result) return null;
  const metrics = result.psrMetrics || {};
  const categories = result.categories || [];
  const findings = result.criticalFindings || [];

  return (
    <div className="space-y-4 mt-4">
      <div className="rounded-2xl p-6"
        style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-5">
            <ScoreRing score={result.overallScore} size={96} stroke={9} />
            <div>
              <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "#64708A" }}>SSVI Compliance Score</div>
              <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl mt-1">{result.agencyName}</div>
              <div className="text-sm mt-1 font-mono" style={{ color: "#64708A" }}>Period: {result.reportPeriod}</div>
              <div className="mt-2"><RiskBadge level={result.overallRiskLevel} clawback={result.estimatedClawbackRisk} /></div>
            </div>
          </div>
          <button onClick={onClear} className="text-xs font-mono underline" style={{ color: "#64708A" }}>Clear</button>
        </div>

        <div className="mt-6 pt-5 border-t grid grid-cols-2 md:grid-cols-4 gap-3" style={{ borderColor: "#E3E7ED" }}>
          {[
            { label: "Cap Utilization", value: metrics.capUtilizationPct != null ? `${metrics.capUtilizationPct}%` : "—", warn: metrics.capUtilizationPct > 80 },
            { label: "GIP Ratio", value: metrics.gipRatioPct != null ? `${metrics.gipRatioPct}%` : "—", warn: metrics.gipRatioPct > 10 },
            { label: "Live Discharge Rate", value: metrics.liveDischargePct != null ? `${metrics.liveDischargePct}%` : "—", warn: metrics.liveDischargePct > 20 },
            { label: "Avg Length of Stay", value: metrics.avgLengthOfStay != null ? `${metrics.avgLengthOfStay} days` : "—", warn: metrics.avgLengthOfStay > 180 },
            { label: "RN Visit Avg", value: metrics.avgRnVisitMinutes != null ? `${metrics.avgRnVisitMinutes} min` : "—", warn: metrics.avgRnVisitMinutes < 35 },
            { label: "Routine Home Care", value: metrics.routineHomeCareRatioPct != null ? `${metrics.routineHomeCareRatioPct}%` : "—", warn: false },
            { label: "Total Reimbursement", value: result.totalReimbursement ? `$${Number(result.totalReimbursement).toLocaleString()}` : "—", warn: false },
            { label: "Est. Clawback Exposure", value: result.estimatedClawbackRisk ? `$${Number(result.estimatedClawbackRisk).toLocaleString()}` : "$0", warn: result.estimatedClawbackRisk > 0 },
          ].map((m, i) => (
            <div key={i} className="rounded-xl p-3" style={{ background: m.warn ? "#FEF3E2" : "#F5F6F8" }}>
              <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
              <div className="text-lg font-mono mt-1" style={{ color: m.warn ? "#C98A1F" : "#16202E" }}>{m.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2 pt-4 border-t" style={{ borderColor: "#E3E7ED" }}>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setActiveCategory(activeCategory === c.id ? null : c.id)}
              className="rounded-lg px-3 py-2 text-left transition-colors"
              style={{
                background: activeCategory === c.id ? "#F7F0E1" : "transparent",
                border: `1px solid ${activeCategory === c.id ? "#E8CFA0" : "#E3E7ED"}`,
                flex: "1 1 140px", minWidth: 0,
              }}>
              <div className="text-[11px] font-mono" style={{ color: "#64708A" }}>{c.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-mono" style={{ color: scoreColor(c.score) }}>{c.score}</span>
              </div>
              {c.clawbackAmount > 0 && (
                <div className="text-[11px] font-mono mt-0.5" style={{ color: "#D14343" }}>
                  ⚠ ${Number(c.clawbackAmount).toLocaleString()} risk
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

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
                <div className="text-xs font-mono mb-0.5" style={{ color: "#B8863F" }}>{f.category}</div>
                <div className="text-sm" style={{ color: "#16202E" }}>{f.finding}</div>
                <div className="text-sm mt-1" style={{ color: "#64708A" }}>→ {f.recommendation}</div>
                {f.clawbackRisk > 0 && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded"
                    style={{ background: "#FDECEA", color: "#D14343" }}>
                    <DollarSign size={11} />Clawback: ${Number(f.clawbackRisk).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl overflow-hidden"
        style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <button onClick={() => setShowComparison(!showComparison)}
          className="w-full flex items-center justify-between p-5 text-left">
          <div className="flex items-center gap-2">
            <FileSearch size={16} color="#B8863F" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">
              Documentation Compliance Review
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: "#FDECEA", color: "#D14343" }}>High Denial Risk</span>
          </div>
          {showComparison ? <ChevronDown size={18} color="#64708A" /> : <ChevronRight size={18} color="#64708A" />}
        </button>
        {showComparison && (
          <div className="px-5 pb-6 pt-1 space-y-4" style={{ borderTop: "1px solid #E3E7ED" }}>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
                <div className="text-xs uppercase font-mono mb-2" style={{ color: "#D14343" }}>❌ Non-Compliant Pattern</div>
                <p className="text-sm" style={{ color: "#16202E", lineHeight: 1.7 }}>
                  "Patient visited today. They appear{" "}
                  <span style={{ background: "#F3B8AC", textDecoration: "line-through", borderRadius: 3, padding: "0 2px" }}>stable</span>
                  , resting comfortably in bed, and ate a full lunch."
                </p>
                <div className="mt-2 text-xs font-mono p-2 rounded" style={{ background: "#FAD4CF", color: "#B23A2E" }}>
                  ⚠ "Stable" is a Medicare technical denial trigger — contradicts 6-month terminal prognosis under LCD guidelines
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
                <div className="text-xs uppercase font-mono mb-2" style={{ color: "#2E9E62" }}>✅ AI-Suggested Rephrase</div>
                <p className="text-sm font-medium" style={{ color: "#2E9E62", lineHeight: 1.7 }}>
                  "Symptoms are currently managed under the active care plan; objective baseline terminal decline remains evident via documented progressive weight loss and structural functional decline consistent with FAST scale staging."
                </p>
                <div className="mt-2 text-xs font-mono p-2 rounded" style={{ background: "#C5EDDA", color: "#1A6E41" }}>
                  ✓ Supports 6-month terminal prognosis per LCD requirements
                </div>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <button className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                style={{ background: "#14213D", color: "#F3F5F8" }}>
                <CheckCircle2 size={14} /> Accept &amp; Sync Back to EHR
              </button>
              <button className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                style={{ background: "#F5F6F8", color: "#16202E", border: "1px solid #E3E7ED" }}>
                <Users size={14} /> Delegate to Clinical Supervisor
              </button>
            </div>
          </div>
        )}
      </div>

      <RecertificationTracker />

      <div className="space-y-3">
        {categories.map((cat) => {
          const open = activeCategory === cat.id;
          return (
            <div key={cat.id} className="rounded-2xl overflow-hidden"
              style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
              <button onClick={() => setActiveCategory(open ? null : cat.id)}
                className="w-full flex items-center gap-4 p-4 text-left">
                <ScoreRing score={cat.score} size={54} stroke={6} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-base">{cat.label}</span>
                    {cat.clawbackAmount > 0 && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded"
                        style={{ background: "#FDECEA", color: "#D14343" }}>
                        🔴 ${Number(cat.clawbackAmount).toLocaleString()} · {cat.auditReason}
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1 truncate" style={{ color: "#64708A" }}>{cat.summary}</p>
                </div>
                {open ? <ChevronDown size={18} color="#64708A" /> : <ChevronRight size={18} color="#64708A" />}
              </button>
              {open && (
                <div className="px-4 pb-5 pt-1 space-y-5" style={{ borderTop: "1px solid #E3E7ED" }}>
                  <div>
                    <div className="text-xs uppercase tracking-widest font-mono mt-4 mb-2" style={{ color: "#64708A" }}>SSVI Scoring Factors</div>
                    <div className="space-y-2">
                      {(cat.factors || []).map((f, i) => (
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
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 text-left">
        <div className="flex items-center gap-2">
          <Calendar size={16} color="#B8863F" />
          <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">
            Recertification Windows &amp; FTF Tracking
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded"
            style={{ background: "#FDECEA", color: "#D14343" }}>2 Missing FTF</span>
        </div>
        {open ? <ChevronDown size={18} color="#64708A" /> : <ChevronRight size={18} color="#64708A" />}
      </button>
      {open && (
        <div className="px-5 pb-6 pt-1 space-y-4" style={{ borderTop: "1px solid #E3E7ED" }}>
          <p className="text-sm" style={{ color: "#64708A" }}>
            Medicare requires a Face-to-Face (FTF) encounter prior to the 180-day recertification. Missing by one day causes 100% claim suspension.
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
                      <div className="text-[11px] font-mono mt-0.5 px-2 py-0.5 rounded"
                        style={{ background: "#FDECEA", color: "#D14343" }}>⚠ Missing FTF Encounter Log</div>
                    )}
                    {p.ftfComplete && (
                      <div className="text-[11px] font-mono mt-0.5 px-2 py-0.5 rounded"
                        style={{ background: "#EAF6EF", color: "#2E9E62" }}>✓ FTF Complete</div>
                    )}
                  </div>
                </div>
                <div className="w-full rounded-full h-2" style={{ background: "#E3E7ED" }}>
                  <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] font-mono" style={{ color: "#8992A3" }}>Day 0</span>
                  <span className="text-[10px] font-mono" style={{ color: "#8992A3" }}>Day 180 — Recert Required</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── UPLOAD HUB PAGE ─────────────────────────────────────────────────────────
function UploadHub() {
  const [psrFile, setPsrFile] = useState(null);
  const [psrLoading, setPsrLoading] = useState(false);
  const [psrResult, setPsrResult] = useState(null);
  const [psrError, setPsrError] = useState(null);

  const [capFile, setCapFile] = useState(null);
  const [capLoading, setCapLoading] = useState(false);
  const [capResult, setCapResult] = useState(null);
  const [capError, setCapError] = useState(null);

  const handlePSR = async (f) => {
    if (!f || f.type !== "application/pdf") { setPsrError("Please upload a PDF."); return; }
    setPsrFile(f); setPsrResult(null); setPsrError(null); setPsrLoading(true);
    try {
      const text = await extractPDFText(f);
      const raw = await callClaude(system, text, 1000);
// More robust JSON extraction
const jsonMatch = raw.match(/\{[\s\S]*\}/);
if (!jsonMatch) throw new Error("No JSON found");
setResult(JSON.parse(jsonMatch[0]));
   } catch (e) {
  setError("Analysis error: " + e.message);
}
  };

  const handleCAP = async (f) => {
    if (!f || f.type !== "application/pdf") { setCapError("Please upload a PDF."); return; }
    setCapFile(f); setCapResult(null); setCapError(null); setCapLoading(true);
    try {
      const text = await extractPDFText(f);
      const raw = await callClaude(CAP_SYSTEM_PROMPT, `CAP REPORT TEXT:\n\n${text}`, 2000);
      setCapResult(JSON.parse(stripJsonFence(raw)));
    } catch (e) { setCapError("Could not analyze PDF: " + e.message); }
    finally { setCapLoading(false); }
  };

  return (
    <div className="space-y-8">
      <div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl">Report Upload Center</div>
        <p className="text-sm mt-1" style={{ color: "#64708A" }}>
          Upload your CMS reports and get instant AI-powered compliance scoring against SSVI benchmarks and MAC/RAC audit thresholds.
        </p>
      </div>

      {/* Active upload tiles */}
      <div>
        <div className="text-xs uppercase tracking-widest font-mono mb-3" style={{ color: "#B8863F" }}>
          Active — AI Analysis Available
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <UploadZone
              label="PS&R Report"
              description="Provider Statistical & Reimbursement — pull from CMS CASPER portal"
              icon={BarChart3}
              onFile={handlePSR}
              loading={psrLoading}
              result={psrResult}
            />
            {psrError && (
              <div className="mt-2 rounded-xl p-3 flex items-start gap-2"
                style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
                <AlertCircle size={15} color="#D14343" className="shrink-0 mt-0.5" />
                <span className="text-sm flex-1" style={{ color: "#B23A2E" }}>{psrError}</span>
                <button onClick={() => setPsrError(null)}><X size={14} color="#B23A2E" /></button>
              </div>
            )}
          </div>
          <div>
            <UploadZone
              label="CAP Report"
              description="Medicare Aggregate Cap — annual hospice reimbursement cap analysis"
              icon={PieChart}
              onFile={handleCAP}
              loading={capLoading}
              result={capResult}
            />
            {capError && (
              <div className="mt-2 rounded-xl p-3 flex items-start gap-2"
                style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
                <AlertCircle size={15} color="#D14343" className="shrink-0 mt-0.5" />
                <span className="text-sm flex-1" style={{ color: "#B23A2E" }}>{capError}</span>
                <button onClick={() => setCapError(null)}><X size={14} color="#B23A2E" /></button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Coming soon tiles */}
      <div>
        <div className="text-xs uppercase tracking-widest font-mono mb-3" style={{ color: "#64708A" }}>
          Coming Soon
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <UploadZone label="Cost Reports" description="Annual CMS cost report — wage data, visit costs, overhead benchmarking" icon={FileText} comingSoon onFile={() => {}} />
          <UploadZone label="Billing Reports" description="Claims data integration — denial tracking, remittance analysis" icon={DollarSign} comingSoon onFile={() => {}} />
          <UploadZone label="EIDM / CASPER" description="Direct CASPER portal integration — auto-pull reports without downloading" icon={ArrowRight} comingSoon onFile={() => {}} />
        </div>
      </div>

      {/* Results */}
      {psrResult && <PSRResults result={psrResult} onClear={() => { setPsrResult(null); setPsrFile(null); }} />}
      {capResult && <CapResults result={capResult} onClear={() => { setCapResult(null); setCapFile(null); }} />}
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
  const [rawDebug, setRawDebug] = useState(null);

  const analyze = async () => {
    if (!text.trim()) return;
    setLoading(true); setError(null); setResult(null); setRawDebug(null);
    try {
      const system = `You are the AI Clinical Chart Auditor inside AIHospiceOS. Audit the given chart text against Medicare Hospice Conditions of Participation: eligibility support, documentation consistency, signature/date completeness, and billing risk. You MUST respond with ONLY a valid JSON object. No explanation, no markdown, no backticks, no text before or after. Start your response with { and end with }. Use exactly this shape: {"overallAssessment":"string","issues":[{"severity":"high","category":"string","finding":"string","recommendation":"string"}],"strengths":["string"]}`;
      const raw = await callClaude(system, text, 1000);
      setRawDebug(raw);
      // Try multiple parse strategies
      let parsed = null;
      // Strategy 1: direct parse
      try { parsed = JSON.parse(raw.trim()); } catch {}
      // Strategy 2: strip fences
      if (!parsed) {
        try { parsed = JSON.parse(raw.replace(/```json/gi,"").replace(/```/g,"").trim()); } catch {}
      }
      // Strategy 3: extract first JSON object
      if (!parsed) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) { try { parsed = JSON.parse(match[0]); } catch {} }
      }
      if (!parsed) throw new Error("Could not parse JSON from: " + raw.substring(0, 200));
      setResult(parsed);
    } catch (e) {
      setError("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-5"
        style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
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
          <button onClick={() => { setText(SAMPLE_CHART); setResult(null); setError(null); setRawDebug(null); }}
            className="text-xs underline" style={{ color: "#64708A" }}>Reset to sample</button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg p-3 text-sm font-mono" style={{ background: "#FDECEA", color: "#B23A2E" }}>
          {error}
        </div>
      )}

      {rawDebug && !result && (
        <div className="rounded-lg p-3 text-xs font-mono" style={{ background: "#F5F6F8", color: "#64708A" }}>
          Raw response: {rawDebug.substring(0, 300)}
        </div>
      )}

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
  { id:"r2", date:"2026-06-10", source:"CMS", tag:"Payment / Billing", severity:"medium",
    title:"FY2027 hospice payment rate update proposed rule released",
    summary:"The proposed rule includes the annual payment update, aggregate cap recalculation methodology, and proposed HQRP measure set revisions.",
    impact:"No immediate documentation change required, but HQRP measure set changes will affect your QAPI program in FY2027.",
    checklist:["Review the proposed HQRP measure set against your current QAPI focus areas.","Flag new measures for data-collection readiness before the final rule."] },
  { id:"r3", date:"2026-05-14", source:"OIG", tag:"Program Integrity", severity:"low",
    title:"OIG work plan adds hospice GIP level-of-care review",
    summary:"The OIG added a work plan item focused on GIP level-of-care determinations — reviewing whether documentation supports the acuity required for GIP billing.",
    impact:"GIP documentation is a near-term audit target industry-wide. Pre-emptive auditing is strongly advised.",
    checklist:["Pre-emptively audit open and recent GIP stays for acuity documentation.","Share OIG focus area with the DON and billing team."] },
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
      <p className="text-sm -mt-2" style={{ color: "#64708A" }}>New and changed hospice requirements, translated into what your agency actually needs to do.</p>
      {REG_UPDATES.map((r) => {
        const total = r.checklist.length;
        const done = r.checklist.filter((_, i) => checked[`${r.id}-${i}`]).length;
        return (
          <div key={r.id} className="rounded-2xl p-5"
            style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
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
function Copilot() {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "I'm your compliance copilot. Ask me about PS&R scores, SSVI thresholds, CAP exposure, MAC/RAC audit risk, or what any survey tag means." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const system = `You are the AI Compliance Copilot inside AIHospiceOS for hospice CEOs, owners, and Directors of Clinical Services. Answer hospice regulatory, PS&R, CAP, SSVI scoring, MAC/RAC audit, RN visit length, and clinical documentation questions clearly for an executive audience. Reference Medicare Hospice Conditions of Participation, LCD guidelines, FAST scale, cap aggregate, and EIDM/CASPER concepts where relevant. Keep answers under 150 words, conversational but precise.`;
      const reply = await callClaude(system, q, 500);
      setMessages((m) => [...m, { role: "assistant", text: reply.trim() }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong — try again in a moment." }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="rounded-2xl flex flex-col h-[65vh] md:h-[calc(100vh-7rem)] md:max-h-[46rem]"
      style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
      <div className="p-4 flex items-center gap-2" style={{ borderBottom: "1px solid #E3E7ED" }}>
        <MessageSquare size={16} color="#B8863F" />
        <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Compliance Copilot</span>
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
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about PS&R, CAP exposure, SSVI thresholds…"
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

// ─── NAV & SHELL ──────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "upload", label: "Report Upload", icon: Upload },
  { id: "chart", label: "Chart Review", icon: FileText },
  { id: "reg", label: "Regulatory Watch", icon: BookOpen },
  { id: "copilot", label: "Copilot", icon: MessageSquare },
];

const CONTENT_MAX_W = {
  dashboard: "max-w-5xl", upload: "max-w-5xl",
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
        <div className="text-[11px] font-mono mt-0.5" style={{ color: "#93A0B8" }}>PS&amp;R · CAP · SSVI · Audit Readiness</div>
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

export default function AIHospiceOS() {
  const [tab, setTab] = useState("dashboard");
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
        <div className="mt-auto text-[11px] font-mono leading-relaxed" style={{ color: "#6B7A99" }}>
          Executive compliance platform for hospice CEOs &amp; Directors. Scored against live SSVI benchmarks.
        </div>
      </aside>

      <div className="md:hidden px-4 pt-6 pb-4" style={{ background: "#14213D" }}>
        <Logo />
      </div>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <InstallBanner />
        <div className={`${CONTENT_MAX_W[tab]} mx-auto px-4 md:px-8 py-4 md:py-8 pb-28 md:pb-10`}>
          {tab === "dashboard" && <Dashboard />}
          {tab === "upload" && <UploadHub />}
          {tab === "chart" && <ChartReview />}
          {tab === "reg" && <RegulatoryWatch />}
          {tab === "copilot" && <Copilot />}
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
