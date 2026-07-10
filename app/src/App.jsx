import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Activity, FileText, ShieldCheck, MessageSquare, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronRight, Send, Sparkles,
  TrendingUp, TrendingDown, Clock, BookOpen, Loader2,
  Minus, Upload, DollarSign, AlertCircle, X,
  BarChart3, Calendar, Lock, ArrowRight,
  Home, PieChart,
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
  // Strategy 1: direct parse
  try { parsed = JSON.parse(raw.trim()); } catch {}
  // Strategy 2: strip markdown fences
  if (!parsed) {
    try { parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim()); } catch {}
  }
  // Strategy 3: extract first complete JSON object
  if (!parsed) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  // Strategy 4: find last valid JSON by trying progressively shorter matches
  if (!parsed) {
    const matches = [...raw.matchAll(/\{[\s\S]*?\}/g)];
    for (const match of matches.reverse()) {
      try { parsed = JSON.parse(match[0]); break; } catch {}
    }
  }
  if (!parsed) throw new Error("Could not parse JSON from response");
  return parsed;
}

const statusColor = (s) => s === "good" ? "#2E9E62" : s === "warn" ? "#C98A1F" : "#D14343";
const severityColor = (s) => s === "high" ? "#D14343" : s === "medium" ? "#C98A1F" : "#2E9E62";
const scoreColor = (s) => s >= 85 ? "#2E9E62" : s >= 70 ? "#C98A1F" : "#D14343";
const ssviColor = (s) => s <= 4 ? "#2E9E62" : s <= 7 ? "#C98A1F" : "#D14343";
const ssviLabel = (s) => s <= 4 ? "Low Risk" : s <= 7 ? "Moderate Risk" : "High Risk";

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

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ psrData, capData }) {
  const [openId, setOpenId] = useState(null);
  const hasAnyData = psrData || capData;

  if (!hasAnyData) {
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
          <p className="text-sm max-w-md" style={{ color: "#64708A" }}>
            Upload your PS&R and/or CAP reports in the Report Upload tab to populate your compliance dashboard with real agency data scored against SSVI benchmarks.
          </p>
          <div className="flex gap-3 mt-2 flex-wrap justify-center">
            {["PS&R Report", "CAP Report", "SSVI Scoring"].map((item) => (
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

  const agencyName = psrData?.agencyName || capData?.agencyName || "Unknown Agency";
  const reportPeriod = psrData?.reportPeriod || capData?.capYear || "";
  const categories = psrData?.categories || [];
  const metrics = psrData?.psrMetrics || {};
  const criticalFindings = psrData?.criticalFindings || [];
  const ssvi = psrData?.ssviScore ?? null;

  return (
    <div className="space-y-6">
      {/* Header scorecard */}
      <div className="rounded-2xl p-6"
        style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
        <div className="flex items-start gap-5 flex-wrap">
          {psrData?.overallScore > 0 && <ScoreRing score={psrData.overallScore} size={104} stroke={9} />}
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "#64708A" }}>
              Composite Compliance Index
            </div>
            <div className="text-2xl mt-1" style={{ fontFamily: "Fraunces, serif", color: "#16202E" }}>
              {agencyName}
            </div>
            {reportPeriod && (
              <div className="text-sm mt-1 font-mono" style={{ color: "#64708A" }}>
                Report Period: {reportPeriod}
              </div>
            )}
            {psrData?.overallRiskLevel && (
              <div className="mt-2">
                <RiskBadge level={psrData.overallRiskLevel} clawback={psrData.estimatedClawbackRisk} />
              </div>
            )}
          </div>
        </div>

        {/* Loaded reports badges */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {psrData && (
            <span className="text-xs font-mono px-2 py-1 rounded"
              style={{ background: "#EAF6EF", color: "#2E9E62", border: "1px solid #A8DFC0" }}>
              ✓ PS&R Loaded
            </span>
          )}
          {capData && (
            <span className="text-xs font-mono px-2 py-1 rounded"
              style={{ background: "#EAF6EF", color: "#2E9E62", border: "1px solid #A8DFC0" }}>
              ✓ CAP Loaded
            </span>
          )}
        </div>

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
                <div className="text-[11px] font-mono" style={{ color: "#64708A" }}>{c.label}</div>
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
      {ssvi != null && (
        <div className="rounded-2xl p-6"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-start gap-5 flex-wrap">
            <SSVIRing score={ssvi} size={96} stroke={9} />
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "#64708A" }}>
                SSVI — Service &amp; Spending Variation Index
              </div>
              <div className="text-xl mt-1" style={{ fontFamily: "Fraunces, serif", color: "#16202E" }}>
                {ssviLabel(ssvi)} · Score {ssvi}/16
              </div>
              <div className="text-sm mt-1" style={{ color: "#64708A" }}>
                FY2025 national average: 6.42 · Median: 7 · Scores ≥10 signal meaningful deviation (12.5% of all hospices)
              </div>
              <div className="mt-2 flex gap-3 flex-wrap">
                {psrData?.ssviUtilizationScore != null && (
                  <div className="rounded-lg px-3 py-1.5 text-sm font-mono" style={{ background: "#F5F6F8", color: "#16202E" }}>
                    Utilization: <strong>{psrData.ssviUtilizationScore}/8</strong>
                  </div>
                )}
                {psrData?.ssviSpendingScore != null && (
                  <div className="rounded-lg px-3 py-1.5 text-sm font-mono" style={{ background: "#F5F6F8", color: "#16202E" }}>
                    Non-Hospice Spending: <strong>{psrData.ssviSpendingScore}/8</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
          {ssvi >= 10 && (
            <div className="mt-4 p-3 rounded-xl flex items-start gap-3"
              style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
              <AlertTriangle size={16} color="#D14343" className="shrink-0 mt-0.5" />
              <div className="text-sm" style={{ color: "#B23A2E" }}>
                <strong>High SSVI Score Warning:</strong> Scores ≥10 signal meaningful deviation from CMS peer norms. CMS posts provider-level SSVI scores publicly. Facilities with high scores may be subject to additional program integrity review.
              </div>
            </div>
          )}
          {psrData?.ssviFindings?.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs uppercase tracking-widest font-mono mb-1" style={{ color: "#64708A" }}>SSVI Risk Factors</div>
              {psrData.ssviFindings.map((f, i) => (
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
      {capData && (
        <div className="rounded-2xl p-5"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2 mb-3">
            <PieChart size={16} color="#B8863F" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Medicare Aggregate CAP</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-sm font-mono" style={{ color: "#16202E" }}>Cap Utilization</span>
            <span className="text-sm font-mono font-bold"
              style={{ color: capData.capUtilizationPct >= 100 ? "#D14343" : capData.capUtilizationPct >= 85 ? "#C98A1F" : "#2E9E62" }}>
              {capData.capUtilizationPct}%
            </span>
          </div>
          <div className="w-full rounded-full h-3" style={{ background: "#E3E7ED" }}>
            <div className="h-3 rounded-full transition-all"
              style={{
                width: `${Math.min(capData.capUtilizationPct, 100)}%`,
                background: capData.capUtilizationPct >= 100 ? "#D14343" : capData.capUtilizationPct >= 85 ? "#C98A1F" : "#2E9E62"
              }} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Total Reimbursement", value: `$${Number(capData.totalMedicareReimbursement || 0).toLocaleString()}`, warn: false },
              { label: "Cap Limit", value: `$${Number(capData.capAmount || 0).toLocaleString()}`, warn: false },
              { label: "Over-Cap Exposure", value: capData.overCapAmount > 0 ? `$${Number(capData.overCapAmount).toLocaleString()}` : "$0", warn: capData.overCapAmount > 0 },
              { label: "Beneficiaries", value: Number(capData.totalBeneficiaries || 0).toLocaleString(), warn: false },
            ].map((m, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: m.warn ? "#FDECEA" : "#F5F6F8" }}>
                <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
                <div className="text-base font-mono mt-1" style={{ color: m.warn ? "#D14343" : "#16202E" }}>{m.value}</div>
              </div>
            ))}
          </div>
          {capData.overCapAmount > 0 && (
            <div className="mt-3 p-3 rounded-xl flex items-start gap-3"
              style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
              <AlertTriangle size={16} color="#D14343" className="shrink-0 mt-0.5" />
              <div className="text-sm" style={{ color: "#B23A2E" }}>
                <strong>Cap Exceeded — ${Number(capData.overCapAmount).toLocaleString()} owed to CMS.</strong> Remittance required within 60 days of cap year close.
              </div>
            </div>
          )}
          {capData.findings?.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#64708A" }}>CAP Findings</div>
              {capData.findings.map((f, i) => (
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
                        <DollarSign size={11} />${Number(f.dollarImpact).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PS&R Metrics */}
      {psrData?.psrMetrics && Object.values(psrData.psrMetrics).some(v => v != null) && (
        <div className="rounded-2xl p-5"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} color="#B8863F" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">PS&amp;R Key Metrics</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Cap Utilization", value: metrics.capUtilizationPct != null ? `${metrics.capUtilizationPct}%` : "—", warn: metrics.capUtilizationPct > 80 },
              { label: "GIP Ratio", value: metrics.gipRatioPct != null ? `${metrics.gipRatioPct}%` : "—", warn: metrics.gipRatioPct > 10 },
              { label: "Live Discharge Rate", value: metrics.liveDischargePct != null ? `${metrics.liveDischargePct}%` : "—", warn: metrics.liveDischargePct > 20 },
              { label: "Avg Length of Stay", value: metrics.avgLengthOfStay != null ? `${metrics.avgLengthOfStay} days` : "—", warn: metrics.avgLengthOfStay > 180 },
              { label: "RN Visit Avg", value: metrics.avgRnVisitMinutes != null ? `${metrics.avgRnVisitMinutes} min` : "—", warn: metrics.avgRnVisitMinutes < 35 },
              { label: "Routine Home Care", value: metrics.routineHomeCareRatioPct != null ? `${metrics.routineHomeCareRatioPct}%` : "—", warn: false },
              { label: "Total Patient Days", value: metrics.totalPatientDays != null ? Number(metrics.totalPatientDays).toLocaleString() : "—", warn: false },
              { label: "Est. Clawback", value: psrData.estimatedClawbackRisk ? `$${Number(psrData.estimatedClawbackRisk).toLocaleString()}` : "$0", warn: psrData.estimatedClawbackRisk > 0 },
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
      {criticalFindings.length > 0 && (
        <div className="rounded-2xl p-5 space-y-3"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} color="#D14343" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">Critical Findings</span>
          </div>
          {criticalFindings.map((f, i) => (
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

      {/* Category drill-down */}
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
                    {cat.factors?.length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-widest font-mono mt-4 mb-2" style={{ color: "#64708A" }}>
                          SSVI Scoring Factors
                        </div>
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
                        <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#B8863F" }}>
                          Recommended Actions
                        </div>
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

// ─── PROMPTS ──────────────────────────────────────────────────────────────────
const PSR_PROMPT_1 = `You are a Medicare hospice compliance analyst. Analyze this PS&R report text and return a JSON object. Start your response with { and end with }. No explanation, no markdown.

Return exactly this structure:
{"agencyName":"string","reportPeriod":"string","totalReimbursement":0,"estimatedClawbackRisk":0,"overallScore":75,"overallRiskLevel":"medium","ssviScore":6,"ssviUtilizationScore":3,"ssviSpendingScore":3,"ssviRiskLevel":"medium","ssviFindings":[{"measure":"string","detail":"string","status":"warn"}],"psrMetrics":{"capUtilizationPct":80,"gipRatioPct":8,"liveDischargePct":18,"avgLengthOfStay":120,"totalPatientDays":10000,"routineHomeCareRatioPct":88,"avgRnVisitMinutes":40,"continuousCareRatioPct":2},"categories":[{"id":"cap_utilization","label":"Cap Utilization","score":75,"clawbackAmount":0,"auditReason":"","summary":"Brief summary","factors":[{"weight":60,"label":"Factor name","status":"warn","detail":"Brief detail"},{"weight":40,"label":"Factor name","status":"good","detail":"Brief detail"}],"actions":["Action item"]},{"id":"level_of_care_mix","label":"Level of Care Mix","score":80,"clawbackAmount":0,"auditReason":"","summary":"Brief summary","factors":[{"weight":60,"label":"GIP ratio","status":"good","detail":"Brief detail"},{"weight":40,"label":"CC hours","status":"good","detail":"Brief detail"}],"actions":["Action item"]},{"id":"live_discharge","label":"Live Discharge Rate","score":70,"clawbackAmount":0,"auditReason":"","summary":"Brief summary","factors":[{"weight":70,"label":"Live discharge rate","status":"warn","detail":"Brief detail"},{"weight":30,"label":"Return to same hospice","status":"good","detail":"Brief detail"}],"actions":["Action item"]},{"id":"rn_visit_length","label":"RN Visit Intensity","score":85,"clawbackAmount":0,"auditReason":"","summary":"Brief summary","factors":[{"weight":70,"label":"Avg RN visit duration","status":"good","detail":"Brief detail"},{"weight":30,"label":"Weekend visit rate","status":"good","detail":"Brief detail"}],"actions":["Action item"]}]}

Fill in real values from the report. Keep all strings under 20 words. SSVI is 0-16, higher is worse, national average 6.42. Flag GIP over 10% as risk status. Flag live discharge over 20% as risk. Flag RN visits under 35 min as risk. Flag cap over 80% as warn.`;

const PSR_PROMPT_2 = `You are a Medicare hospice compliance analyst. Analyze this PS&R report and return a JSON object. Start with { end with }. No explanation, no markdown.

Return exactly this structure:
{"categories":[{"id":"billing_accuracy","label":"Billing Accuracy","score":75,"clawbackAmount":0,"auditReason":"","summary":"Brief summary","factors":[{"weight":50,"label":"HIS claims alignment","status":"good","detail":"Brief detail"},{"weight":50,"label":"Physician cert timing","status":"warn","detail":"Brief detail"}],"actions":["Action item"]},{"id":"survey_readiness","label":"Survey Readiness","score":85,"clawbackAmount":0,"auditReason":"","summary":"Brief summary","factors":[{"weight":60,"label":"CoP tag closure","status":"good","detail":"Brief detail"},{"weight":40,"label":"QAPI program","status":"good","detail":"Brief detail"}],"actions":["Action item"]},{"id":"length_of_stay","label":"Length of Stay","score":70,"clawbackAmount":0,"auditReason":"","summary":"Brief summary","factors":[{"weight":60,"label":"Avg LOS vs benchmark","status":"warn","detail":"Brief detail"},{"weight":40,"label":"Patients over 180 days","status":"warn","detail":"Brief detail"}],"actions":["Action item"]}],"criticalFindings":[{"severity":"high","category":"Category name","finding":"Finding under 20 words","recommendation":"Recommendation under 15 words","clawbackRisk":0},{"severity":"medium","category":"Category name","finding":"Finding under 20 words","recommendation":"Recommendation under 15 words","clawbackRisk":0}]}

Fill in real values from the report. Keep all strings under 20 words. Use hospice jargon: MAC/RAC, LCD guidelines, FAST scale, face-to-face encounter, GIP, cap aggregate, CoP, HIS measures. Max 3 criticalFindings.`;

const CAP_PROMPT = `You are a Medicare hospice CAP specialist. Analyze this CAP report and return a JSON object. Start with { end with }. No explanation, no markdown.

Return exactly this structure:
{"agencyName":"string","capYear":"string","totalMedicareReimbursement":0,"capAmount":0,"capUtilizationPct":0,"overCapAmount":0,"projectedYearEndUtilization":0,"riskLevel":"medium","totalBeneficiaries":0,"findings":[{"severity":"high","finding":"Finding under 20 words","recommendation":"Recommendation under 15 words","dollarImpact":0}]}

Fill in real values from the report. Cap over 100% means overCapAmount must be positive. riskLevel: over 100% = high, 85-100% = medium, under 85% = low. Max 3 findings.`;

// ─── UPLOAD ZONE ──────────────────────────────────────────────────────────────
function UploadZone({ label, description, icon: Icon, onFile, loading, hasResult, comingSoon }) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    if (!comingSoon && !loading) onFile(e.dataTransfer.files[0]);
  }, [comingSoon, loading, onFile]);

  if (comingSoon) {
    return (
      <div className="rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center"
        style={{ background: "#F5F6F8", border: "2px dashed #C7CDD8" }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#E3E7ED" }}>
          <Lock size={22} color="#8992A3" />
        </div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#8992A3" }} className="text-lg">{label}</div>
        <div className="text-sm" style={{ color: "#8992A3" }}>{description}</div>
        <span className="text-xs font-mono px-3 py-1 rounded-full" style={{ background: "#E3E7ED", color: "#64708A" }}>Coming Soon</span>
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
        background: hasResult ? "#EAF6EF" : dragOver ? "#F7F0E1" : "#FFFFFF",
        border: `2px dashed ${hasResult ? "#2E9E62" : dragOver ? "#B8863F" : "#C7CDD8"}`,
        boxShadow: "0 1px 3px rgba(16,24,40,0.04)",
        opacity: loading ? 0.8 : 1,
      }}>
      <input ref={fileRef} type="file" accept=".pdf" className="hidden"
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
      <div className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: hasResult ? "#C5EDDA" : "#F7F0E1" }}>
        {loading ? <Loader2 size={22} color="#B8863F" className="animate-spin" /> :
          hasResult ? <CheckCircle2 size={22} color="#2E9E62" /> :
          <Icon size={22} color="#B8863F" />}
      </div>
      <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">{label}</div>
      <div className="text-sm" style={{ color: "#64708A" }}>{description}</div>
      {loading && (
        <div className="text-xs font-mono text-center" style={{ color: "#B8863F" }}>
          Analyzing with AI — this may take 30-60 seconds…
        </div>
      )}
      {hasResult && !loading && (
        <div className="text-xs font-mono" style={{ color: "#2E9E62" }}>✓ Loaded — click to re-upload</div>
      )}
      {!loading && !hasResult && (
        <div className="text-xs font-mono px-3 py-1 rounded-full" style={{ background: "#F7F0E1", color: "#B8863F" }}>
          Drop PDF here or click to browse
        </div>
      )}
    </div>
  );
}

// ─── UPLOAD HUB ───────────────────────────────────────────────────────────────
function UploadHub({ onPsrData, onCapData, hasPsr, hasCap }) {
  const [psrLoading, setPsrLoading] = useState(false);
  const [psrError, setPsrError] = useState(null);
  const [capLoading, setCapLoading] = useState(false);
  const [capError, setCapError] = useState(null);

  const handlePSR = async (f) => {
    if (!f || f.type !== "application/pdf") { setPsrError("Please upload a PDF file."); return; }
    setPsrError(null); setPsrLoading(true);
    try {
      const text = await extractPDFText(f);
      const truncated = text.substring(0, 4000);
      // Call 1 — metrics, SSVI, first 4 categories
      const raw1 = await callClaude(PSR_PROMPT_1, `Analyze this PS&R report and fill in real values:\n\n${truncated}`, 1500);
      const part1 = parseJSON(raw1);
      // Call 2 — remaining 3 categories + critical findings
      const raw2 = await callClaude(PSR_PROMPT_2, `Analyze this PS&R report and fill in real values:\n\n${truncated}`, 1200);
      const part2 = parseJSON(raw2);
      // Merge
      const merged = {
        ...part1,
        categories: [...(part1.categories || []), ...(part2.categories || [])],
        criticalFindings: part2.criticalFindings || [],
      };
      onPsrData(merged);
    } catch (e) {
      setPsrError("PS&R analysis error: " + e.message);
    } finally {
      setPsrLoading(false);
    }
  };

  const handleCAP = async (f) => {
    if (!f || f.type !== "application/pdf") { setCapError("Please upload a PDF file."); return; }
    setCapError(null); setCapLoading(true);
    try {
      const text = await extractPDFText(f);
      const raw = await callClaude(CAP_PROMPT, `Analyze this CAP report and fill in real values:\n\n${text.substring(0, 3000)}`, 1000);
      const result = parseJSON(raw);
      onCapData(result);
    } catch (e) {
      setCapError("CAP analysis error: " + e.message);
    } finally {
      setCapLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl">Report Upload Center</div>
        <p className="text-sm mt-1" style={{ color: "#64708A" }}>
          Upload your CMS reports for instant AI compliance scoring. Each report populates the Dashboard independently — upload one or both.
        </p>
      </div>

      {(hasPsr || hasCap) && (
        <div className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
          <CheckCircle2 size={18} color="#2E9E62" className="shrink-0" />
          <div className="text-sm flex-1" style={{ color: "#1A6E41" }}>
            <strong>{[hasPsr && "PS&R", hasCap && "CAP"].filter(Boolean).join(" + ")} loaded.</strong> Switch to the Dashboard tab to view your compliance scorecard.
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-widest font-mono mb-3" style={{ color: "#B8863F" }}>
          Active — AI Analysis Available
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <UploadZone label="PS&R Report"
              description="Provider Statistical & Reimbursement — pull from CMS CASPER portal"
              icon={BarChart3} onFile={handlePSR} loading={psrLoading} hasResult={hasPsr} />
            {psrError && (
              <div className="mt-2 rounded-xl p-3 flex items-start gap-2" style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
                <AlertCircle size={15} color="#D14343" className="shrink-0 mt-0.5" />
                <span className="text-sm flex-1" style={{ color: "#B23A2E" }}>{psrError}</span>
                <button onClick={() => setPsrError(null)}><X size={14} color="#B23A2E" /></button>
              </div>
            )}
          </div>
          <div>
            <UploadZone label="CAP Report"
              description="Medicare Aggregate Cap — annual hospice reimbursement cap analysis"
              icon={PieChart} onFile={handleCAP} loading={capLoading} hasResult={hasCap} />
            {capError && (
              <div className="mt-2 rounded-xl p-3 flex items-start gap-2" style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
                <AlertCircle size={15} color="#D14343" className="shrink-0 mt-0.5" />
                <span className="text-sm flex-1" style={{ color: "#B23A2E" }}>{capError}</span>
                <button onClick={() => setCapError(null)}><X size={14} color="#B23A2E" /></button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-widest font-mono mb-3" style={{ color: "#64708A" }}>Coming Soon</div>
        <div className="grid md:grid-cols-3 gap-4">
          <UploadZone label="Cost Reports" description="Annual CMS cost report — visit costs and overhead benchmarking" icon={FileText} comingSoon onFile={() => {}} />
          <UploadZone label="Billing Reports" description="Claims data — denial tracking and remittance analysis" icon={DollarSign} comingSoon onFile={() => {}} />
          <UploadZone label="EIDM / CASPER" description="Direct portal integration — auto-pull reports without downloading" icon={ArrowRight} comingSoon onFile={() => {}} />
        </div>
      </div>

      {(hasPsr || hasCap) && (
        <div className="rounded-2xl p-4" style={{ background: "#F5F6F8", border: "1px solid #E3E7ED" }}>
          <div className="text-xs font-mono mb-2" style={{ color: "#64708A" }}>Clear uploaded data</div>
          <div className="flex gap-3">
            {hasPsr && (
              <button onClick={() => onPsrData(null)}
                className="text-xs font-mono px-3 py-1.5 rounded-lg"
                style={{ background: "#FDECEA", color: "#D14343", border: "1px solid #F3B8AC" }}>
                Clear PS&R
              </button>
            )}
            {hasCap && (
              <button onClick={() => onCapData(null)}
                className="text-xs font-mono px-3 py-1.5 rounded-lg"
                style={{ background: "#FDECEA", color: "#D14343", border: "1px solid #F3B8AC" }}>
                Clear CAP
              </button>
            )}
          </div>
        </div>
      )}
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
                  <span className="text-[10px] font-mono" style={{ color: "#8992A3" }}>Day 180 — Recert</span>
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
      const system = `You are a hospice compliance auditor. Audit this chart against Medicare Hospice CoP. Start your response with { and end with }. No other text. Use this exact format: {"overallAssessment":"2 sentence summary","issues":[{"severity":"high","category":"string","finding":"string","recommendation":"string"}],"strengths":["string"]} Maximum 3 issues and 2 strengths.`;
      const raw = await callClaude(system, text, 2000);
      setResult(parseJSON(raw));
    } catch (e) {
      setError("Analysis error: " + e.message);
    } finally {
      setLoading(false);
    }
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
    summary:"CMS introduced the Service & Spending Variation Index (SSVI), a 0-16 composite score built from claims data flagging agencies whose care patterns diverge from peer norms. Scores are posted publicly on the CMS Hospice Center webpage.",
    impact:"A score of 10 or above signals meaningful deviation and may trigger additional program integrity review.",
    checklist:["Pull your agency SSVI score from the CMS Hospice Center webpage.","Review your live discharge rate, LOS over 180 days, RN visit minutes, and non-hospice spending.","Upload your PS&R to AIHospiceOS to estimate your SSVI exposure.","Brief your compliance team on the 9 SSVI measures before the final rule."] },
  { id:"r3", date:"2026-05-14", source:"OIG", tag:"Program Integrity", severity:"medium",
    title:"OIG work plan adds hospice GIP level-of-care review",
    summary:"The OIG added a work plan item focused on GIP level-of-care determinations — reviewing whether documentation supports the acuity required for GIP billing.",
    impact:"GIP documentation is a near-term audit target industry-wide. Pre-emptive auditing is strongly advised.",
    checklist:["Pre-emptively audit open and recent GIP stays for acuity documentation.","Share OIG focus area with the DON and billing team."] },
  { id:"r4", date:"2026-04-30", source:"CMS", tag:"Survey / Oversight", severity:"medium",
    title:"CMS posts provider-level SSVI scores publicly on Hospice Center webpage",
    summary:"Provider-level SSVI data for FY2024 and FY2025 is now publicly available. The FY2025 average was 6.42 with a median of 7. 833 hospices (12.5%) scored 10 or above.",
    impact:"Referral sources, families, and payers can now see your agency SSVI score publicly.",
    checklist:["Look up your agency SSVI score on the CMS Hospice Center webpage.","If your score is 8 or above, develop a remediation plan before the next reporting cycle.","Document your response to any SSVI outlier measures in your QAPI program."] },
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

// ─── COPILOT (hidden from nav) ────────────────────────────────────────────────
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
      const system = `You are the AI Compliance Copilot inside AIHospiceOS for hospice CEOs, owners, and Directors of Clinical Services. Answer hospice regulatory, PS&R, CAP, SSVI scoring, MAC/RAC audit, and clinical documentation questions clearly for an executive audience. Keep answers under 150 words, conversational but precise.`;
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
          placeholder="Ask about PS&R, SSVI, CAP exposure, audit risk…"
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

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function AIHospiceOS() {
  const [tab, setTab] = useState("dashboard");
  const [psrData, setPsrData] = useState(null);
  const [capData, setCapData] = useState(null);

  const handlePsrData = (data) => {
    setPsrData(data);
    if (data) setTab("dashboard");
  };

  const handleCapData = (data) => {
    setCapData(data);
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
        {(psrData || capData) && (
          <div className="mt-4 rounded-lg px-3 py-2" style={{ background: "#1E2C4E" }}>
            <div className="text-[11px] font-mono" style={{ color: "#93A0B8" }}>Loaded agency</div>
            <div className="text-xs font-medium mt-0.5 truncate" style={{ color: "#F3F5F8" }}>
              {psrData?.agencyName || capData?.agencyName || "Unknown"}
            </div>
            {psrData?.ssviScore != null && (
              <div className="text-[11px] font-mono mt-1" style={{ color: ssviColor(psrData.ssviScore) }}>
                SSVI: {psrData.ssviScore}/16 · {ssviLabel(psrData.ssviScore)}
              </div>
            )}
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {psrData && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#2E9E6230", color: "#2E9E62" }}>PS&R ✓</span>}
              {capData && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#2E9E6230", color: "#2E9E62" }}>CAP ✓</span>}
            </div>
          </div>
        )}
        <div className="mt-auto text-[11px] font-mono leading-relaxed" style={{ color: "#6B7A99" }}>
          Executive compliance platform for hospice CEOs &amp; Directors. Scored against SSVI benchmarks.
        </div>
      </aside>

      <div className="md:hidden px-4 pt-6 pb-4" style={{ background: "#14213D" }}>
        <Logo />
      </div>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <InstallBanner />
        <div className={`${CONTENT_MAX_W[tab] || "max-w-5xl"} mx-auto px-4 md:px-8 py-4 md:py-8 pb-28 md:pb-10`}>
          {tab === "dashboard" && <Dashboard psrData={psrData} capData={capData} />}
          {tab === "upload" && (
            <UploadHub
              onPsrData={handlePsrData}
              onCapData={handleCapData}
              hasPsr={!!psrData}
              hasCap={!!capData}
            />
          )}
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
