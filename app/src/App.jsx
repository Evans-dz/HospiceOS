import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  FileText, ShieldCheck, MessageSquare, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronRight, Send, Sparkles,
  TrendingUp, TrendingDown, Clock, BookOpen, Loader2,
  Minus, Upload, DollarSign, AlertCircle, X,
  BarChart3, Calendar, ArrowRight,
  Home, PieChart, ExternalLink, Files,
} from "lucide-react";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

const MODEL = "claude-sonnet-4-6";

async function callClaude(system, userText, maxTokens = 1500) {
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

function parseJSON(raw) {
  if (!raw) throw new Error("Empty response");
  let parsed = null;
  try { parsed = JSON.parse(raw.trim()); } catch {}
  if (!parsed) {
    try { parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim()); } catch {}
  }
  if (!parsed) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  if (!parsed) throw new Error("Could not parse JSON");
  return parsed;
}

const severityColor = (s) => s === "high" ? "#D14343" : s === "medium" ? "#C98A1F" : "#2E9E62";
const scoreColor = (s) => s >= 85 ? "#2E9E62" : s >= 70 ? "#C98A1F" : "#D14343";
const ssviColor = (s) => s <= 4 ? "#2E9E62" : s <= 7 ? "#C98A1F" : "#D14343";
const ssviLabel = (s) => s <= 4 ? "Low Risk" : s <= 7 ? "Moderate Risk" : "High Risk";
const statusColor = (s) => s === "good" ? "#2E9E62" : s === "warn" ? "#C98A1F" : "#D14343";

const CAP_AMOUNTS = {
  2023: 32486.92, 2024: 33494.01, 2025: 34159.74, 2026: 34738.63, 2027: 35000.00
};

const REPORT_TYPES = [
  { id: "psr", label: "PS&R Summary", desc: "Report Type 810 — Provider Summary Report", color: "#B8863F" },
  { id: "beneficiary", label: "Beneficiary Count", desc: "Report B51562 — Required for CAP calculation", color: "#B8863F" },
  { id: "pepper", label: "PEPPER Report", desc: "Program for Evaluating Payment Patterns Electronic Report", color: "#6B7FD4" },
  { id: "cahps", label: "CAHPS Survey", desc: "Consumer Assessment of Healthcare Providers and Systems", color: "#6B7FD4" },
  { id: "qapi", label: "QAPI Documents", desc: "Quality Assurance & Performance Improvement program docs", color: "#2E9E62" },
  { id: "policy", label: "Policy Manuals", desc: "Agency policy and procedure manuals", color: "#2E9E62" },
  { id: "survey", label: "Survey Results", desc: "State survey findings, deficiency citations, POC documents", color: "#D14343" },
  { id: "cms_public", label: "CMS Public Data", desc: "Hospice Compare data, SSVI public scores, quality measures", color: "#64708A" },
];

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

function SSVIRing({ score, size = 84, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(16, score));
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
          · Clawback: <strong>${Number(clawback).toLocaleString()}</strong>
        </span>
      )}
    </div>
  );
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

function detectReportType(filename, text) {
  const fn = filename.toLowerCase();
  const tx = text.toLowerCase().substring(0, 1000);
  if (fn.includes("pepper") || tx.includes("pepper") || tx.includes("program for evaluating payment")) return "pepper";
  if (fn.includes("cahps") || tx.includes("cahps") || tx.includes("consumer assessment")) return "cahps";
  if (fn.includes("qapi") || tx.includes("quality assurance and performance") || tx.includes("qapi")) return "qapi";
  if (fn.includes("survey") || tx.includes("statement of deficiencies") || tx.includes("cms-2567") || tx.includes("plan of correction")) return "survey";
  if (fn.includes("policy") || fn.includes("manual") || fn.includes("procedure")) return "policy";
  if (fn.includes("beneficiar") || fn.includes("b51562") || tx.includes("beneficiary count summary") || tx.includes("streamlined hospice beneficiary")) return "beneficiary";
  if (fn.includes("compare") || tx.includes("hospice compare") || tx.includes("cms public")) return "cms_public";
  if (tx.includes("provider statistical and reimbursement") || tx.includes("provider summary report") || fn.includes("summary") || fn.includes("810")) return "psr";
  return "psr"; // default
}

// ─── MASTER ANALYSIS PROMPT ───────────────────────────────────────────────────
function buildMasterPrompt(reportSummaries) {
  return `You are a Medicare hospice compliance expert analyzing multiple reports for AIHospiceOS. You have been given extracted text from the following report types: ${Object.keys(reportSummaries).join(", ")}.

Analyze ALL available data and produce a comprehensive compliance scorecard. Use actual numbers from the reports wherever possible.

KEY REPORT KNOWLEDGE:
- PS&R Report 810: Contains STATISTIC SECTION (Medicare Days = Rev 0651, Claims, Unduplicated Census) and CHARGE SECTION (Rev 0551 = Skilled Nursing 15-min units, Rev 0561 = Social Work, Rev 0571 = Aide visits, Rev 0651 = RHC days) and REIMBURSEMENT SECTION (Gross, Sequestration, Net Reimbursement)
- Beneficiary Count B51562: Contains cap year table with Full/Fractional/Total Beneficiary Counts. CAP limit = Total Beneficiaries × per-beneficiary cap amount
- PEPPER: Contains outlier statistics comparing agency to national/jurisdiction averages for hospice claims patterns
- CAHPS: Patient/family satisfaction scores across communication, care, information domains  
- QAPI: Quality improvement projects, performance metrics, committee meeting documentation
- Survey Results: CMS-2567 deficiency citations, Conditions of Participation tags, Plan of Correction status
- CMS Public Data: Hospice Compare quality measures, publicly posted SSVI scores

SSVI CALCULATION (0-16 scale, lower is better, national average 6.42):
- Utilization Score (0-8): Based on RN visit intensity (Rev 0551 units ÷ Medicare days, flag if under 1.0), length of stay (flag if avg over 180 days), live discharge patterns, GIP ratio
- Non-Hospice Spending Score (0-8): Requires CMS Part A/B data not in PS&R — use 3.21 national average unless CMS public data is provided
- If actual SSVI score is found in CMS public data, use that instead of estimating

CAP CALCULATION:
- FY2025 per-beneficiary cap: $34,159.74
- FY2026 per-beneficiary cap: $34,738.63
- CAP limit = Total Beneficiary Count × per-beneficiary cap
- Over-cap = Net Reimbursement − CAP limit (if positive, agency owes CMS)

Respond with ONLY valid JSON starting with { and ending with }. No other text:

{
  "agencyName": "string",
  "providerNumber": "string",
  "reportPeriod": "string",
  "reportsAnalyzed": ["list of report types found"],
  "overallComplianceScore": number_0_to_100,
  "overallRiskLevel": "high|medium|low",
  "ssviScore": number_0_to_16,
  "ssviUtilizationScore": number_0_to_8,
  "ssviSpendingScore": number_0_to_8,
  "ssviIsEstimated": true_or_false,
  "ssviFindings": [{"measure": "string", "detail": "string with actual numbers", "status": "good|warn|risk"}],
  "capData": {
    "capYear": "2026",
    "totalBeneficiaryCount": number_or_null,
    "perBeneficiaryCap": number,
    "capLimit": number_or_null,
    "netReimbursement": number_or_null,
    "capExposure": number_or_null,
    "capUtilizationPct": number_or_null
  },
  "psrMetrics": {
    "totalMedicareDays": number_or_null,
    "totalClaims": number_or_null,
    "totalUnduplicatedCensus": number_or_null,
    "avgLengthOfStay": number_or_null,
    "snVisitUnits": number_or_null,
    "rnUnitsPerDay": number_or_null,
    "netReimbursement": number_or_null,
    "grossReimbursement": number_or_null
  },
  "complianceCategories": [
    {
      "id": "string",
      "label": "string",
      "score": number_0_to_100,
      "source": "which report this came from",
      "riskLevel": "high|medium|low",
      "clawbackAmount": number_or_0,
      "summary": "string with specific numbers",
      "factors": [{"weight": number, "label": "string", "status": "good|warn|risk", "detail": "string with actual data"}],
      "actions": ["specific actionable string"]
    }
  ],
  "qualityMetrics": {
    "cahpsOverallScore": number_or_null,
    "cahpsNationalAvg": number_or_null,
    "pepperOutlierFlags": number_or_0,
    "qapiProjectCount": number_or_0,
    "surveyDeficiencyCount": number_or_0,
    "surveyConditionLevel": true_or_false,
    "openDeficiencies": number_or_0
  },
  "criticalFindings": [
    {"severity": "high|medium|low", "category": "string", "source": "report type", "finding": "string with specific data", "recommendation": "string", "clawbackRisk": number_or_0}
  ]
}

Score these compliance categories (include only categories where you have data):
1. RN Visit Intensity & SSVI Utilization (from PS&R Rev 0551)
2. Medicare CAP Exposure (from PS&R + Beneficiary Count)
3. Length of Stay Analysis (from PS&R)
4. Survey Compliance & CoP Status (from Survey Results)
5. Quality Measures & CAHPS (from CAHPS/CMS data)
6. QAPI Program Strength (from QAPI docs)
7. PEPPER Outlier Risk (from PEPPER report)
8. Policy & Documentation (from Policy Manuals)

Only include categories where you have actual data. Use real numbers throughout.`;
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
            Go to Report Upload and submit your CMS reports. Upload any combination of PS&R, Beneficiary Count, PEPPER, CAHPS, QAPI, Survey Results, Policy Manuals, or CMS Public Data. The more reports you upload, the more accurate your SSVI score and compliance dashboard.
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
              <div className="text-sm mt-1 font-mono" style={{ color: "#64708A" }}>
                Period: {d.reportPeriod}
              </div>
            )}
            {d.overallRiskLevel && (
              <div className="mt-2">
                <RiskBadge level={d.overallRiskLevel} clawback={cap.capExposure || 0} />
              </div>
            )}
          </div>
        </div>

        {/* Reports loaded */}
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

        {/* Category pills */}
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
                {d.ssviIsEstimated && (
                  <span className="text-sm font-mono ml-2" style={{ color: "#64708A" }}>(estimated)</span>
                )}
              </div>
              <div className="text-sm mt-1" style={{ color: "#64708A" }}>
                FY2025 national average: 6.42 · Median: 7 · Scores ≥10 trigger CMS program integrity review
              </div>
              <div className="mt-2 flex gap-3 flex-wrap">
                {d.ssviUtilizationScore != null && (
                  <div className="rounded-lg px-3 py-1.5 text-sm font-mono" style={{ background: "#F5F6F8", color: "#16202E" }}>
                    Utilization: <strong style={{ color: ssviColor(d.ssviUtilizationScore) }}>{d.ssviUtilizationScore}/8</strong>
                  </div>
                )}
                {d.ssviSpendingScore != null && (
                  <div className="rounded-lg px-3 py-1.5 text-sm font-mono" style={{ background: "#F5F6F8", color: "#16202E" }}>
                    Non-Hospice Spending: <strong>{d.ssviSpendingScore}/8</strong>
                    {d.ssviIsEstimated && <span style={{ color: "#64708A" }}> (est.)</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {d.ssviIsEstimated && (
            <div className="mt-4 p-3 rounded-xl" style={{ background: "#F5F6F8", border: "1px solid #E3E7ED" }}>
              <div className="text-xs font-mono" style={{ color: "#64708A" }}>
                <strong>SSVI Accuracy Note:</strong> Utilization Score calculated from your PS&R data (RN visit intensity, LOS, level-of-care mix). Non-Hospice Spending Score requires CMS Part A/B claims data — using national average 3.21. Upload CMS Public Data or Hospice Compare export for actual published SSVI score. Pull Report Types 832 and 833 from CASPER for discharge/readmission data to further improve accuracy.
              </div>
            </div>
          )}

          {d.ssviScore >= 10 && (
            <div className="mt-3 p-3 rounded-xl flex items-start gap-3"
              style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
              <AlertTriangle size={16} color="#D14343" className="shrink-0 mt-0.5" />
              <div className="text-sm" style={{ color: "#B23A2E" }}>
                <strong>High SSVI Warning:</strong> Scores ≥10 indicate meaningful deviation from CMS peer norms on both spending and utilization. CMS posts provider-level scores publicly. Facilities above 10 face elevated program integrity scrutiny.
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
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: "#FDECEA", color: "#D14343" }}>🔴 CAP EXCEEDED</span>
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
                  style={{
                    width: `${Math.min(cap.capUtilizationPct, 100)}%`,
                    background: cap.capUtilizationPct >= 100 ? "#D14343" : cap.capUtilizationPct >= 85 ? "#C98A1F" : "#2E9E62"
                  }} />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Total Beneficiaries", value: cap.totalBeneficiaryCount ? Number(cap.totalBeneficiaryCount).toFixed(4) : "—", warn: false },
              { label: `Per-Beneficiary Cap`, value: cap.perBeneficiaryCap ? `$${Number(cap.perBeneficiaryCap).toLocaleString()}` : "—", warn: false },
              { label: "Aggregate Cap Limit", value: cap.capLimit ? `$${Number(cap.capLimit).toLocaleString(undefined, {maximumFractionDigits: 0})}` : "—", warn: false },
              { label: "Net Reimbursement", value: cap.netReimbursement ? `$${Number(cap.netReimbursement).toLocaleString(undefined, {maximumFractionDigits: 0})}` : "—", warn: cap.capExposure > 0 },
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
                🔴 CAP EXCEEDED — ${Number(cap.capExposure).toLocaleString(undefined, {maximumFractionDigits: 0})} owed to CMS
              </div>
              <div className="text-sm mt-1" style={{ color: "#B23A2E" }}>
                Net reimbursement exceeds aggregate cap limit. CMS will initiate a clawback. Remittance required within 60 days of cap year close. Contact your MAC immediately.
              </div>
            </div>
          )}

          {cap.capExposure === 0 && cap.capLimit > 0 && (
            <div className="mt-3 p-3 rounded-xl flex items-start gap-3"
              style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
              <CheckCircle2 size={16} color="#2E9E62" className="shrink-0 mt-0.5" />
              <div className="text-sm" style={{ color: "#1A6E41" }}>
                Under cap. Remaining headroom: ${Number(cap.capLimit - cap.netReimbursement).toLocaleString(undefined, {maximumFractionDigits: 0})}. Monitor closely as cap year progresses.
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
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Quality & Survey Metrics</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "CAHPS Overall Score", value: quality.cahpsOverallScore != null ? `${quality.cahpsOverallScore}%` : "—", warn: quality.cahpsOverallScore < 75, sub: quality.cahpsNationalAvg ? `Nat'l avg: ${quality.cahpsNationalAvg}%` : null },
              { label: "Survey Deficiencies", value: quality.surveyDeficiencyCount != null ? quality.surveyDeficiencyCount : "—", warn: quality.surveyDeficiencyCount > 0, sub: quality.surveyConditionLevel ? "⚠ Condition-level cited" : quality.openDeficiencies > 0 ? `${quality.openDeficiencies} open` : "All closed" },
              { label: "PEPPER Outlier Flags", value: quality.pepperOutlierFlags != null ? quality.pepperOutlierFlags : "—", warn: quality.pepperOutlierFlags > 0, sub: quality.pepperOutlierFlags > 0 ? "Above threshold" : "Within range" },
              { label: "QAPI Active Projects", value: quality.qapiProjectCount != null ? quality.qapiProjectCount : "—", warn: quality.qapiProjectCount === 0, sub: quality.qapiProjectCount > 0 ? "Documented PIPs" : "No PIPs documented" },
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
              { label: "SN Visit Units (0551)", value: metrics.snVisitUnits != null ? Number(metrics.snVisitUnits).toLocaleString() : "—", warn: false },
              { label: "RN Intensity (units/day)", value: metrics.rnUnitsPerDay != null ? metrics.rnUnitsPerDay : "—", warn: metrics.rnUnitsPerDay < 1.0 },
              { label: "Gross Reimbursement", value: metrics.grossReimbursement != null ? `$${Number(metrics.grossReimbursement).toLocaleString(undefined, {maximumFractionDigits: 0})}` : "—", warn: false },
              { label: "Net Reimbursement", value: metrics.netReimbursement != null ? `$${Number(metrics.netReimbursement).toLocaleString(undefined, {maximumFractionDigits: 0})}` : "—", warn: false },
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
                      {cat.source && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: "#E3E7ED", color: "#64708A" }}>{cat.source}</span>
                      )}
                      {cat.clawbackAmount > 0 && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded"
                          style={{ background: "#FDECEA", color: "#D14343" }}>
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
function UploadHub({ onAnalysisData, hasData }) {
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
      const reportSummaries = {};
      for (const file of files) {
        setProgress(`Extracting text from ${file.name}…`);
        const text = await extractPDFText(file);
        const type = detectReportType(file.name, text);
        reportSummaries[type] = (reportSummaries[type] || "") + `\n\n=== ${file.name} ===\n${text.substring(0, 3000)}`;
      }

      const combinedText = Object.entries(reportSummaries)
        .map(([type, text]) => `\n\n====== ${type.toUpperCase()} REPORT ======\n${text}`)
        .join("\n");

      setProgress("Analyzing all reports with AI — this may take 45-60 seconds…");
      const raw = await callClaude(buildMasterPrompt(reportSummaries), combinedText.substring(0, 8000), 2000);
      const result = parseJSON(raw);
      onAnalysisData(result);
    } catch (e) {
      setError("Analysis error: " + e.message);
    } finally {
      setAnalyzing(false); setProgress("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl">Report Upload Center</div>
        <p className="text-sm mt-1" style={{ color: "#64708A" }}>
          Upload any combination of CMS reports. The more reports you provide, the more accurate your SSVI score and compliance dashboard becomes.
        </p>
      </div>

      {/* Multi-file drop zone */}
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
          <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-xl">
            Drop all your reports here
          </div>
          <div className="text-sm mt-1" style={{ color: "#64708A" }}>
            Upload multiple PDFs at once — PS&R, PEPPER, CAHPS, QAPI, Survey Results, Policy Manuals, CMS Public Data
          </div>
          <div className="text-xs mt-2 font-mono" style={{ color: "#8992A3" }}>
            PDF format only · Multiple files supported · AI auto-detects report type
          </div>
        </div>
      </div>

      {/* Accepted report types reference */}
      <div className="rounded-xl p-4" style={{ background: "#F5F6F8", border: "1px solid #E3E7ED" }}>
        <div className="text-xs uppercase tracking-widest font-mono mb-3" style={{ color: "#64708A" }}>
          Accepted Report Types
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          {REPORT_TYPES.map((r) => (
            <div key={r.id} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: r.color }} />
              <div>
                <span className="text-xs font-mono font-medium" style={{ color: "#16202E" }}>{r.label}</span>
                <span className="text-xs font-mono" style={{ color: "#8992A3" }}> — {r.desc}</span>
              </div>
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
              {files.length} file{files.length > 1 ? "s" : ""} ready to analyze
            </div>
            <button onClick={() => setFiles([])} className="text-xs font-mono underline" style={{ color: "#64708A" }}>
              Clear all
            </button>
          </div>
          <div className="space-y-2 mb-4">
            {files.map((f) => {
              const type = REPORT_TYPES.find(r => r.id === detectReportType(f.name, ""));
              return (
                <div key={f.name} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "#F5F6F8" }}>
                  <FileText size={15} color="#B8863F" className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: "#16202E" }}>{f.name}</div>
                    <div className="text-[11px] font-mono mt-0.5" style={{ color: "#64708A" }}>
                      {type?.label || "Auto-detecting"} · {(f.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <button onClick={() => removeFile(f.name)}>
                    <X size={14} color="#8992A3" />
                  </button>
                </div>
              );
            })}
          </div>

          {analyzing ? (
            <div className="rounded-xl p-4 flex items-center gap-3"
              style={{ background: "#FBF3E4", border: "1px solid #EAD3A3" }}>
              <Loader2 size={18} color="#B8863F" className="animate-spin shrink-0" />
              <div>
                <div className="text-sm font-medium" style={{ color: "#B8863F" }}>{progress}</div>
                <div className="text-xs font-mono mt-0.5" style={{ color: "#8992A3" }}>
                  AI is reading all reports simultaneously and generating your compliance scorecard
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

      {hasData && (
        <div className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
          <CheckCircle2 size={18} color="#2E9E62" className="shrink-0" />
          <div className="text-sm flex-1" style={{ color: "#1A6E41" }}>
            <strong>Analysis complete.</strong> View your full compliance scorecard on the Dashboard tab.
          </div>
          <button onClick={() => onAnalysisData(null)}
            className="text-xs font-mono px-3 py-1.5 rounded-lg"
            style={{ background: "#FDECEA", color: "#D14343", border: "1px solid #F3B8AC" }}>
            Clear Data
          </button>
        </div>
      )}

      {/* EIDM/CASPER Widget */}
      <div className="rounded-2xl p-6"
        style={{ background: "#14213D", border: "1px solid #1E2C4E" }}>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "#1E2C4E" }}>
            <ExternalLink size={18} color="#B8863F" />
          </div>
          <div className="flex-1">
            <div style={{ fontFamily: "Fraunces, serif", color: "#F3F5F8" }} className="text-lg">
              EIDM / CASPER Portal
            </div>
            <div className="text-sm mt-1" style={{ color: "#93A0B8" }}>
              Log into CMS EIDM to pull your PS&R reports, PEPPER, survey results, and Hospice Compare data directly from CASPER.
            </div>
            <div className="mt-3 space-y-1.5">
              {[
                { label: "EIDM Login", url: "https://eidm.cms.gov", desc: "Enterprise Identity Management — main CMS login" },
                { label: "CASPER Reports", url: "https://casper.cms.gov", desc: "Pull PS&R 810, Beneficiary Count B51562, PEPPER" },
                { label: "Hospice Compare", url: "https://www.medicare.gov/care-compare", desc: "Your publicly posted SSVI score and quality measures" },
                { label: "SSVI Public Data", url: "https://www.cms.gov/medicare/quality/hospice", desc: "Download the FY2025 SSVI provider-level data file" },
              ].map((link) => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2.5 rounded-lg transition-colors"
                  style={{ background: "#1E2C4E" }}
                  onClick={(e) => e.stopPropagation()}>
                  <ExternalLink size={13} color="#B8863F" className="shrink-0" />
                  <div>
                    <div className="text-xs font-mono font-medium" style={{ color: "#F3F5F8" }}>{link.label}</div>
                    <div className="text-[11px] font-mono" style={{ color: "#6B7A99" }}>{link.desc}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
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
          <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "#FDECEA", color: "#D14343" }}>
            2 Missing FTF
          </span>
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
    try {
      const system = `You are a hospice compliance auditor. Audit this chart against Medicare Hospice CoP. Start with { end with }. No other text. Format: {"overallAssessment":"2 sentence summary","issues":[{"severity":"high","category":"string","finding":"string","recommendation":"string"}],"strengths":["string"]} Max 3 issues, 2 strengths.`;
      const raw = await callClaude(system, text, 2000);
      setResult(parseJSON(raw));
    } catch (e) {
      setError("Analysis error: " + e.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <div className="flex items-center gap-2 mb-1">
          <FileText size={16} color="#B8863F" />
          <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Chart Auditor</span>
        </div>
        <p className="text-sm mb-3" style={{ color: "#64708A" }}>
          Paste chart text, certifications, or IDG notes. Claude flags missing elements and gaps against hospice CoP norms.
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
    checklist:["Pull your SSVI score from CMS Hospice Center webpage.","Upload PS&R 810 + Beneficiary Count to AIHospiceOS for score estimate.","Upload PEPPER report for outlier pattern analysis.","Review RN visit intensity — under 1.0 units/day (Rev 0551 ÷ Medicare days) is an SSVI risk flag.","Pull CMS public SSVI data file and upload to get your actual published score."] },
  { id:"r3", date:"2026-05-14", source:"OIG", tag:"Program Integrity", severity:"medium",
    title:"OIG work plan adds hospice GIP level-of-care review",
    summary:"OIG focused on GIP level-of-care determinations — whether documentation supports acuity required for GIP billing.",
    impact:"GIP documentation is a near-term audit target. Pre-emptive auditing is strongly advised.",
    checklist:["Audit all open and recent GIP stays for acuity documentation.","Share OIG focus area with DON and billing team as standing agenda item."] },
  { id:"r4", date:"2026-04-30", source:"CMS", tag:"Survey / Oversight", severity:"medium",
    title:"CMS posts provider-level SSVI scores publicly on Hospice Center webpage",
    summary:"FY2024 and FY2025 SSVI scores are publicly posted. FY2025 national average: 6.42, median: 7. 833 hospices (12.5%) scored ≥10.",
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
function Copilot({ analysisData }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "I'm your compliance copilot. Ask me about your PS&R metrics, SSVI score, CAP exposure, PEPPER outliers, CAHPS scores, survey deficiencies, or any hospice regulatory question." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const context = analysisData
    ? `Current agency data: ${analysisData.agencyName}, SSVI ${analysisData.ssviScore}/16, overall compliance score ${analysisData.overallComplianceScore}/100, CAP exposure $${analysisData.capData?.capExposure || 0}, reports analyzed: ${analysisData.reportsAnalyzed?.join(", ")}.`
    : "No reports uploaded yet.";

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const system = `You are the AI Compliance Copilot inside AIHospiceOS for hospice CEOs, owners, and Directors of Clinical Services. ${context} Answer questions about PS&R Report 810, Beneficiary Count B51562, PEPPER, CAHPS, QAPI, survey deficiencies, SSVI scoring, MAC/RAC audits, CAP exposure, and Medicare Hospice CoP clearly for an executive audience. Reference specific revenue codes (0551 SN visits, 0651 RHC days), report types, and dollar amounts where relevant. Keep answers under 150 words, conversational but precise.`;
      const reply = await callClaude(system, q, 500);
      setMessages((m) => [...m, { role: "assistant", text: reply.trim() }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong — try again." }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="rounded-2xl flex flex-col h-[65vh] md:h-[calc(100vh-7rem)] md:max-h-[46rem]"
      style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
      <div className="p-4 flex items-center gap-2" style={{ borderBottom: "1px solid #E3E7ED" }}>
        <MessageSquare size={16} color="#B8863F" />
        <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Compliance Copilot</span>
        {analysisData && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded ml-auto"
            style={{ background: "#EAF6EF", color: "#2E9E62" }}>
            Aware of your uploaded reports
          </span>
        )}
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
          placeholder="Ask about SSVI, CAP exposure, survey findings, PEPPER…"
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
  dashboard: "max-w-5xl", upload: "max-w-4xl",
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

  const handleAnalysisData = (data) => {
    setAnalysisData(data);
    if (data) setTab("dashboard");
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
            />
          )}
          {tab === "chart" && <ChartReview />}
          {tab === "reg" && <RegulatoryWatch />}
          {tab === "copilot" && <Copilot analysisData={analysisData} />}
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
