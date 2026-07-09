import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Activity, FileText, ShieldCheck, MessageSquare, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronRight, Send, Sparkles,
  TrendingUp, TrendingDown, Clock, BookOpen, Loader2, Stethoscope,
  ClipboardList, Minus, Upload, DollarSign, AlertCircle, X,
  BarChart3, FileSearch, Calendar, Users,
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
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return text;
}

function stripJsonFence(text) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

const statusColor = (status) =>
  status === "good" ? "#2E9E62" : status === "warn" ? "#C98A1F" : "#D14343";

const severityColor = (sev) =>
  sev === "high" ? "#D14343" : sev === "medium" ? "#C98A1F" : "#2E9E62";

function statusColorForScore(score) {
  return score >= 85 ? "#2E9E62" : score >= 70 ? "#C98A1F" : "#D14343";
}

function ScoreRing({ score, size = 84, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 85 ? "#2E9E62" : pct >= 70 ? "#C98A1F" : "#D14343";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E3E7ED" strokeWidth={stroke} />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeDasharray={c}
        strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fontFamily="IBM Plex Mono, monospace" fontSize={size * 0.26}
        fontWeight="600" fill="#16202E">{pct}</text>
    </svg>
  );
}

function TrendBadge({ trend }) {
  const Icon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const color = trend > 0 ? "#2E9E62" : trend < 0 ? "#D14343" : "#64708A";
  return (
    <span style={{ color }} className="inline-flex items-center gap-1 text-xs font-mono">
      <Icon size={13} />
      {trend === 0 ? "flat" : `${trend > 0 ? "+" : ""}${trend} pts`}
    </span>
  );
}

function RiskBadge({ level, clawback }) {
  if (!level) return null;
  const isHigh = level === "high";
  const isMed = level === "medium";
  const bg = isHigh ? "#FDECEA" : isMed ? "#FEF3E2" : "#EAF6EF";
  const color = isHigh ? "#D14343" : isMed ? "#C98A1F" : "#2E9E62";
  const icon = isHigh ? "🔴" : isMed ? "🟡" : "🟢";
  return (
    <div className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5"
      style={{ background: bg, border: `1px solid ${color}30` }}>
      <span className="text-sm">{icon}</span>
      <span className="text-sm font-mono font-semibold" style={{ color }}>
        {isHigh ? "High" : isMed ? "Medium" : "Low"} Audit Risk
      </span>
      {clawback > 0 && (
        <span className="text-sm font-mono" style={{ color }}>
          · Potential Clawback: <strong>${Number(clawback).toLocaleString()}</strong>
        </span>
      )}
    </div>
  );
}

const PSR_SYSTEM_PROMPT = `You are an expert Medicare hospice compliance analyst inside AIHospiceOS, a platform for hospice CEOs, owners, and Directors of Clinical Services.

You have been given raw text extracted from a CMS PS&R (Provider Statistical & Reimbursement) report. Your job is to:
1. Extract all key data fields from the PS&R text
2. Score the agency against SSVI (Survey & Certification Virtual Inspector) benchmarks and known MAC/RAC audit trigger thresholds
3. Calculate clawback risk in dollar amounts
4. Provide specific, actionable findings using authentic hospice compliance and billing jargon

Respond with ONLY valid JSON, no markdown fences, no preamble, matching EXACTLY this shape:
{
  "agencyName": "string or Unknown Agency",
  "reportPeriod": "string or Unknown Period",
  "overallScore": number 0-100,
  "overallRiskLevel": "high|medium|low",
  "totalReimbursement": number or 0,
  "estimatedClawbackRisk": number or 0,
  "categories": [
    {
      "id": "string",
      "label": "string",
      "score": number 0-100,
      "trend": number,
      "riskLevel": "high|medium|low",
      "clawbackAmount": number or 0,
      "auditReason": "string",
      "summary": "string",
      "factors": [
        { "weight": number, "label": "string", "status": "good|warn|risk", "detail": "string" }
      ],
      "actions": ["string"]
    }
  ],
  "criticalFindings": [
    { "severity": "high|medium|low", "category": "string", "finding": "string", "recommendation": "string", "clawbackRisk": number or 0 }
  ],
  "psrMetrics": {
    "capUtilizationPct": number or null,
    "gipRatioPct": number or null,
    "continuousCareRatioPct": number or null,
    "liveDischargePct": number or null,
    "avgLengthOfStay": number or null,
    "totalPatientDays": number or null,
    "routineHomeCareRatioPct": number or null
  }
}

Score categories must include: cap_utilization, level_of_care_mix, live_discharge, length_of_stay, billing_accuracy, survey_readiness.

Use authentic clinical and billing jargon: MAC/RAC audits, LCD guidelines, FAST scale, functional decline, terminal prognosis, face-to-face encounter, GIP level of care, continuous care, routine home care, cap aggregate, hospice election, Conditions of Participation, HIS measures, QAPI.

For clawback calculations: if cap utilization exceeds 100%, calculate overage times average per diem rate (~$200). Flag GIP ratios over 10% as high audit risk. Live discharge rates over 20% trigger eligibility scrutiny worth 15% of total reimbursement.`;

function PSRUpload() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [showComparison, setShowComparison] = useState(false);
  const fileRef = useRef();

  const extractTextFromPDF = async (file) => {
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((item) => item.str).join(" ") + "\n";
    }
    return fullText;
  };

  const handleFile = async (f) => {
    if (!f || f.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const text = await extractTextFromPDF(f);
      const raw = await callClaude(PSR_SYSTEM_PROMPT, `PS&R REPORT TEXT:\n\n${text}`, 3000);
      const parsed = JSON.parse(stripJsonFence(raw));
      setResult(parsed);
      setActiveCategory(parsed.categories?.[0]?.id || null);
    } catch (e) {
      setError("Could not analyze this PDF. Make sure it is a CMS PS&R report and try again. Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const metrics = result?.psrMetrics || {};
  const categories = result?.categories || [];
  const findings = result?.criticalFindings || [];

  return (
    <div className="space-y-6">
      {!result && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all"
          style={{
            background: dragOver ? "#F7F0E1" : "#FFFFFF",
            border: `2px dashed ${dragOver ? "#B8863F" : "#C7CDD8"}`,
            boxShadow: "0 1px 3px rgba(16,24,40,0.04)",
          }}
        >
          <input ref={fileRef} type="file" accept=".pdf" className="hidden"
            onChange={(e) => handleFile(e.target.files[0])} />
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: "#F7F0E1" }}>
            <Upload size={28} color="#B8863F" />
          </div>
          <div className="text-center">
            <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-xl">
              Upload PS&amp;R Report
            </div>
            <div className="text-sm mt-1" style={{ color: "#64708A" }}>
              Drag &amp; drop your CMS PS&amp;R PDF here, or click to browse
            </div>
            <div className="text-xs mt-2 font-mono" style={{ color: "#8992A3" }}>
              Pull directly from your CMS CASPER portal · PDF format only
            </div>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm font-mono" style={{ color: "#B8863F" }}>
              <Loader2 size={16} className="animate-spin" />
              Extracting &amp; scoring against SSVI benchmarks…
            </div>
          )}
        </div>
      )}

      {loading && file && (
        <div className="rounded-2xl p-6 flex items-center gap-4"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED" }}>
          <Loader2 size={24} className="animate-spin" color="#B8863F" />
          <div>
            <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }}>Analyzing {file.name}</div>
            <div className="text-sm mt-0.5" style={{ color: "#64708A" }}>
              Scoring against SSVI thresholds · Calculating MAC/RAC audit exposure · Estimating clawback risk…
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
          <AlertCircle size={16} color="#D14343" className="mt-0.5 shrink-0" />
          <div className="text-sm flex-1" style={{ color: "#B23A2E" }}>{error}</div>
          <button onClick={() => { setError(null); setFile(null); setResult(null); }}>
            <X size={16} color="#B23A2E" />
          </button>
        </div>
      )}

      {result && !loading && (
        <>
          <div className="rounded-2xl p-6"
            style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-5">
                <ScoreRing score={result.overallScore} size={96} stroke={9} />
                <div>
                  <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "#64708A" }}>
                    SSVI Compliance Score
                  </div>
                  <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl mt-1">
                    {result.agencyName}
                  </div>
                  <div className="text-sm mt-1 font-mono" style={{ color: "#64708A" }}>
                    Report Period: {result.reportPeriod}
                  </div>
                  <div className="mt-2">
                    <RiskBadge level={result.overallRiskLevel} clawback={result.estimatedClawbackRisk} />
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setResult(null); setFile(null); }}
                className="text-xs font-mono underline" style={{ color: "#64708A" }}>
                Upload new PS&amp;R
              </button>
            </div>

            <div className="mt-6 pt-5 border-t grid grid-cols-2 md:grid-cols-4 gap-4"
              style={{ borderColor: "#E3E7ED" }}>
              {[
                { label: "Cap Utilization", value: metrics.capUtilizationPct != null ? `${metrics.capUtilizationPct}%` : "—", warn: metrics.capUtilizationPct > 80 },
                { label: "GIP Ratio", value: metrics.gipRatioPct != null ? `${metrics.gipRatioPct}%` : "—", warn: metrics.gipRatioPct > 10 },
                { label: "Live Discharge Rate", value: metrics.liveDischargePct != null ? `${metrics.liveDischargePct}%` : "—", warn: metrics.liveDischargePct > 20 },
                { label: "Avg Length of Stay", value: metrics.avgLengthOfStay != null ? `${metrics.avgLengthOfStay} days` : "—", warn: metrics.avgLengthOfStay > 180 },
                { label: "Total Patient Days", value: metrics.totalPatientDays != null ? Number(metrics.totalPatientDays).toLocaleString() : "—", warn: false },
                { label: "Routine Home Care", value: metrics.routineHomeCareRatioPct != null ? `${metrics.routineHomeCareRatioPct}%` : "—", warn: false },
                { label: "Total Reimbursement", value: result.totalReimbursement ? `$${Number(result.totalReimbursement).toLocaleString()}` : "—", warn: false },
                { label: "Est. Clawback Exposure", value: result.estimatedClawbackRisk ? `$${Number(result.estimatedClawbackRisk).toLocaleString()}` : "$0", warn: result.estimatedClawbackRisk > 0 },
              ].map((m, i) => (
                <div key={i} className="rounded-xl p-3"
                  style={{ background: m.warn ? "#FEF3E2" : "#F5F6F8" }}>
                  <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
                  <div className="text-lg font-mono mt-1"
                    style={{ color: m.warn ? "#C98A1F" : "#16202E" }}>{m.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2 pt-4 border-t" style={{ borderColor: "#E3E7ED" }}>
              {categories.map((c) => (
                <button key={c.id}
                  onClick={() => setActiveCategory(activeCategory === c.id ? null : c.id)}
                  className="rounded-lg px-3 py-2 text-left transition-colors"
                  style={{
                    background: activeCategory === c.id ? "#F7F0E1" : "transparent",
                    border: `1px solid ${activeCategory === c.id ? "#E8CFA0" : "#E3E7ED"}`,
                    flex: "1 1 140px", minWidth: 0,
                  }}>
                  <div className="text-[11px] font-mono" style={{ color: "#64708A" }}>{c.label}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-mono"
                      style={{ color: statusColorForScore(c.score) }}>{c.score}</span>
                    <TrendBadge trend={c.trend} />
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
                <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">
                  Critical Findings
                </span>
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
                        <DollarSign size={11} />
                        Potential Clawback: ${Number(f.clawbackRisk).toLocaleString()}
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
                <p className="text-sm" style={{ color: "#64708A" }}>
                  Documentation patterns flagged as Medicare technical denial triggers based on your PS&amp;R data.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-xl p-4" style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
                    <div className="text-xs uppercase font-mono mb-2" style={{ color: "#D14343" }}>
                      ❌ Non-Compliant Pattern Detected
                    </div>
                    <p className="text-sm" style={{ color: "#16202E", lineHeight: 1.7 }}>
                      "Patient visited today. They appear{" "}
                      <span style={{ background: "#F3B8AC", textDecoration: "line-through", borderRadius: 3, padding: "0 2px" }}>
                        stable
                      </span>
                      , resting comfortably in bed, and ate a full lunch."
                    </p>
                    <div className="mt-2 text-xs font-mono p-2 rounded"
                      style={{ background: "#FAD4CF", color: "#B23A2E" }}>
                      ⚠ "Stable" is a Medicare technical denial trigger — implies patient does not meet 6-month terminal prognosis under LCD guidelines
                    </div>
                  </div>
                  <div className="rounded-xl p-4" style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
                    <div className="text-xs uppercase font-mono mb-2" style={{ color: "#2E9E62" }}>
                      ✅ AI-Suggested Compliant Rephrase
                    </div>
                    <p className="text-sm" style={{ color: "#2E9E62", fontWeight: 500, lineHeight: 1.7 }}>
                      "Symptoms are currently managed under the active care plan; objective baseline terminal decline remains evident via documented progressive weight loss and structural functional decline consistent with FAST scale staging."
                    </p>
                    <div className="mt-2 text-xs font-mono p-2 rounded"
                      style={{ background: "#C5EDDA", color: "#1A6E41" }}>
                      ✓ References functional decline indicators — supports 6-month terminal prognosis per LCD requirements
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-2 flex-wrap">
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
                        <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-base">
                          {cat.label}
                        </span>
                        <TrendBadge trend={cat.trend} />
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
                        <div className="text-xs uppercase tracking-widest font-mono mt-4 mb-2"
                          style={{ color: "#64708A" }}>SSVI Scoring Factors</div>
                        <div className="space-y-2">
                          {(cat.factors || []).map((f, i) => (
                            <div key={i} className="flex items-start gap-3">
                              <div className="w-10 shrink-0 text-right text-[11px] font-mono pt-0.5"
                                style={{ color: "#8992A3" }}>{f.weight}%</div>
                              <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                                style={{ background: statusColor(f.status) }} />
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
                          <div className="text-xs uppercase tracking-widest font-mono mb-2"
                            style={{ color: "#B8863F" }}>Recommended Actions</div>
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
        </>
      )}
    </div>
  );
}

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
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left">
        <div className="flex items-center gap-2">
          <Calendar size={16} color="#B8863F" />
          <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">
            Recertification Windows &amp; FTF Tracking
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded"
            style={{ background: "#FDECEA", color: "#D14343" }}>2 Missing FTF Encounters</span>
        </div>
        {open ? <ChevronDown size={18} color="#64708A" /> : <ChevronRight size={18} color="#64708A" />}
      </button>
      {open && (
        <div className="px-5 pb-6 pt-1 space-y-4" style={{ borderTop: "1px solid #E3E7ED" }}>
          <p className="text-sm" style={{ color: "#64708A" }}>
            Medicare requires a Face-to-Face (FTF) encounter prior to the 180-day recertification. Missing this by a single day causes immediate 100% claim suspension.
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
                    <div className="text-sm font-mono font-semibold" style={{ color: barColor }}>
                      Day {p.day} of {p.totalDays}
                    </div>
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
                  <div className="h-2 rounded-full transition-all"
                    style={{ width: `${pct}%`, background: barColor }} />
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
      const system = `You are the AI Clinical Chart Auditor inside AIHospiceOS. Audit the given chart text against Medicare Hospice Conditions of Participation: eligibility support, documentation consistency, signature/date completeness, and billing risk. Respond with ONLY valid JSON, no markdown fences: {"overallAssessment":"string","issues":[{"severity":"high|medium|low","category":"string","finding":"string","recommendation":"string"}],"strengths":["string"]}`;
      const raw = await callClaude(system, text, 1000);
      setResult(JSON.parse(stripJsonFence(raw)));
    } catch (e) {
      setError("Could not parse the analysis. Try again.");
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
          Paste chart text, certifications, or IDG notes. Claude flags missing elements, contradictions, and signature gaps against hospice CoP norms.
        </p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9}
          className="w-full rounded-lg p-3 text-sm font-mono focus:outline-none"
          style={{ background: "#F5F6F8", border: "1px solid #E3E7ED", color: "#16202E" }}
          placeholder="Paste chart text here…" />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={analyze} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: "#B8863F", color: "#1B2740" }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? "Analyzing…" : "Analyze chart"}
          </button>
          <button onClick={() => { setText(SAMPLE_CHART); setResult(null); }}
            className="text-xs underline" style={{ color: "#64708A" }}>Reset to sample</button>
        </div>
      </div>
      {error && (
        <div className="rounded-lg p-3 text-sm" style={{ background: "#FDECEA", color: "#B23A2E" }}>{error}</div>
      )}
      {result && (
        <div className="rounded-2xl p-5 space-y-5"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED" }}>
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

const FALLBACK_REG_UPDATES = [
  { id:"r1", date:"2026-06-24", source:"CMS", tag:"Conditions of Participation", severity:"high",
    title:"Hospice election statement addendum — clarified timing requirement",
    summary:"CMS clarified that the election statement addendum must be provided within the same 3-day window as the election statement itself.",
    impact:"If your intake workflow allows the addendum to be sent after the election statement, that gap is now a compliance finding.",
    checklist:["Update the intake SOP so the addendum request trigger fires at election.","Retrain admissions staff on the 3-day window.","Audit the last 30 days of elections for addendum timing gaps."] },
  { id:"r2", date:"2026-06-10", source:"CMS", tag:"Payment / Billing", severity:"medium",
    title:"FY2027 hospice payment rate update proposed rule released",
    summary:"The proposed rule includes the annual payment update, aggregate cap recalculation methodology, and proposed revisions to the HQRP measure set.",
    impact:"No immediate documentation change required, but HQRP measure set changes will affect your QAPI program in FY2027.",
    checklist:["Review the proposed HQRP measure set against your current QAPI focus areas.","Flag new measures for data-collection readiness before the final rule."] },
  { id:"r3", date:"2026-05-29", source:"State Survey Agency", tag:"Survey / State", severity:"medium",
    title:"State agency updates infection control surveyor worksheet",
    summary:"The revised worksheet adds explicit questions about home-visit bag technique and PPE supply chain contingency planning.",
    impact:"Your infection control policy should explicitly address PPE supply contingency planning.",
    checklist:["Add a PPE supply contingency section to the infection control policy.","Brief field staff on updated bag-technique expectations."] },
  { id:"r4", date:"2026-05-14", source:"OIG", tag:"Program Integrity", severity:"low",
    title:"OIG work plan adds hospice GIP level-of-care review",
    summary:"The OIG added a work plan item focused on GIP level-of-care determinations — reviewing whether documentation supports the acuity required for GIP billing.",
    impact:"GIP documentation is a near-term audit target industry-wide. Pre-emptive auditing is strongly advised.",
    checklist:["Pre-emptively audit open and recent GIP stays for acuity documentation.","Share OIG focus area with the DON and billing team."] },
];

function RegulatoryWatch() {
  const [checked, setChecked] = useState({});
  const toggle = (regId, idx) => {
    const key = `${regId}-${idx}`;
    setChecked((c) => ({ ...c, [key]: !c[key] }));
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen size={16} color="#B8863F" />
        <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Regulatory Watch</span>
      </div>
      <p className="text-sm -mt-2" style={{ color: "#64708A" }}>
        New and changed hospice requirements, translated into what your agency actually needs to do.
      </p>
      {FALLBACK_REG_UPDATES.map((r) => {
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
              <div className="space-y-1.5">
                {r.checklist.map((item, i) => {
                  const key = `${r.id}-${i}`;
                  const isChecked = !!checked[key];
                  return (
                    <button key={i} onClick={() => toggle(r.id, i)}
                      className="w-full flex items-start gap-2 text-left p-2 rounded-lg"
                      style={{ background: isChecked ? "#EAF6EF" : "transparent" }}>
                      <div className="w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center"
                        style={{ border: `1.5px solid ${isChecked ? "#2E9E62" : "#C7CDD8"}`, background: isChecked ? "#2E9E62" : "transparent" }}>
                        {isChecked && <CheckCircle2 size={11} color="#FFFFFF" />}
                      </div>
                      <span className="text-sm"
                        style={{ color: isChecked ? "#64708A" : "#16202E", textDecoration: isChecked ? "line-through" : "none" }}>
                        {item}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Copilot() {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "I'm your compliance copilot. Ask me about your PS&R scores, SSVI thresholds, MAC/RAC audit exposure, or what any survey tag means." },
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
      const system = `You are the AI Compliance Copilot inside AIHospiceOS, a platform for hospice CEOs, owners, and Directors of Clinical Services. Answer hospice regulatory, PS&R data, SSVI scoring, MAC/RAC audit, and clinical documentation questions clearly for an executive audience. Reference Medicare Hospice Conditions of Participation, LCD guidelines, FAST scale, and cap aggregate concepts where relevant. Keep answers under 150 words, conversational but precise.`;
      const reply = await callClaude(system, q, 500);
      setMessages((m) => [...m, { role: "assistant", text: reply.trim() }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong — try again in a moment." }]);
    } finally {
      setLoading(false);
    }
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
            <div className="rounded-xl px-3 py-2 text-sm flex items-center gap-2"
              style={{ background: "#F5F6F8", color: "#64708A" }}>
              <Loader2 size={13} className="animate-spin" /> thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-3 flex gap-2" style={{ borderTop: "1px solid #E3E7ED" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about PS&R scores, SSVI thresholds, cap exposure…"
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

const TABS = [
  { id: "psr", label: "PS&R Audit", icon: BarChart3 },
  { id: "chart", label: "Chart Review", icon: FileText },
  { id: "reg", label: "Regulatory Watch", icon: BookOpen },
  { id: "copilot", label: "Copilot", icon: MessageSquare },
];

const CONTENT_MAX_W = { psr: "max-w-5xl", chart: "max-w-4xl", reg: "max-w-4xl", copilot: "max-w-2xl" };

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "#B8863F" }}>
        <ShieldCheck size={19} color="#1B2740" />
      </div>
      <div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#F3F5F8" }} className="text-xl leading-none">
          AIHospiceOS
        </div>
        <div className="text-[11px] font-mono mt-0.5" style={{ color: "#93A0B8" }}>
          PS&amp;R · SSVI · Audit Readiness
        </div>
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
      <span className="text-sm flex-1" style={{ color: "#16202E" }}>
        Install AIHospiceOS for quick, full-screen access.
      </span>
      <button onClick={async () => { prompt.prompt(); await prompt.userChoice; setPrompt(null); }}
        className="text-xs font-medium rounded-lg px-3 py-1.5 shrink-0"
        style={{ background: "#B8863F", color: "#1B2740" }}>Install</button>
      <button onClick={() => setDismissed(true)} className="text-xs shrink-0"
        style={{ color: "#64708A" }}>Not now</button>
    </div>
  );
}

export default function AIHospiceOS() {
  const [tab, setTab] = useState("psr");
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
          Executive compliance platform for hospice CEOs &amp; Directors. PS&amp;R scored against live SSVI benchmarks.
        </div>
      </aside>

      <div className="md:hidden px-4 pt-6 pb-4" style={{ background: "#14213D" }}>
        <Logo />
      </div>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <InstallBanner />
        <div className={`${CONTENT_MAX_W[tab]} mx-auto px-4 md:px-8 py-4 md:py-8 pb-28 md:pb-10`}>
          {tab === "psr" && <PSRUpload />}
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
