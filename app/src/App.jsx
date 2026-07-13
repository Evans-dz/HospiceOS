import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Activity, FileText, ShieldCheck, MessageSquare, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronRight, Send, Sparkles,
  TrendingUp, TrendingDown, Clock, BookOpen, Loader2,
  Minus, Upload, DollarSign, AlertCircle, X,
  BarChart3, Calendar, Lock, ArrowRight,
  Home, PieChart, Info,
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
  if (!parsed) throw new Error("Could not parse JSON from response");
  return parsed;
}

const statusColor = (s) => s === "good" ? "#2E9E62" : s === "warn" ? "#C98A1F" : "#D14343";
const severityColor = (s) => s === "high" ? "#D14343" : s === "medium" ? "#C98A1F" : "#2E9E62";
const scoreColor = (s) => s >= 85 ? "#2E9E62" : s >= 70 ? "#C98A1F" : "#D14343";
const ssviColor = (s) => s <= 4 ? "#2E9E62" : s <= 7 ? "#C98A1F" : "#D14343";
const ssviLabel = (s) => s <= 4 ? "Low Risk" : s <= 7 ? "Moderate Risk" : "High Risk";

// Per-beneficiary cap amounts by fiscal year
const CAP_AMOUNTS = {
  2023: 32486.92, 2024: 33494.01, 2025: 34159.74, 2026: 34738.63, 2027: 35000.00
};

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
            Upload your PS&R Summary Report (Report Type 810) and/or Beneficiary Count Summary from your CMS CASPER portal to populate your compliance dashboard.
          </p>
          <div className="flex gap-3 mt-2 flex-wrap justify-center">
            {["PS&R Report Type 810", "Beneficiary Count Summary", "SSVI Scoring"].map((item) => (
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
  const categories = psrData?.categories || [];
  const criticalFindings = psrData?.criticalFindings || [];
  const metrics = psrData?.psrMetrics || {};
  const ssvi = psrData?.ssviScore ?? null;

  // Calculate CAP exposure using real beneficiary counts if available
  const capYear = capData?.capYear || psrData?.mostRecentYear || "2026";
  const capPerBeneficiary = CAP_AMOUNTS[parseInt(capYear)] || 34738.63;
  const totalBeneficiaries = capData?.totalBeneficiaryCount || psrData?.totalBeneficiaryCount || null;
  const netReimbursement = psrData?.netReimbursement || capData?.totalMedicareReimbursement || 0;
  const capLimit = totalBeneficiaries ? totalBeneficiaries * capPerBeneficiary : null;
  const capExposure = capLimit ? Math.max(0, netReimbursement - capLimit) : null;
  const capUtilizationPct = capLimit ? ((netReimbursement / capLimit) * 100).toFixed(1) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
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
            {psrData?.reportPeriod && (
              <div className="text-sm mt-1 font-mono" style={{ color: "#64708A" }}>
                Paid Period: {psrData.reportPeriod}
              </div>
            )}
            {psrData?.overallRiskLevel && (
              <div className="mt-2">
                <RiskBadge level={psrData.overallRiskLevel} clawback={capExposure || psrData.estimatedClawbackRisk} />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          {psrData && (
            <span className="text-xs font-mono px-2 py-1 rounded"
              style={{ background: "#EAF6EF", color: "#2E9E62", border: "1px solid #A8DFC0" }}>
              ✓ PS&R Report 810 Loaded
            </span>
          )}
          {capData && (
            <span className="text-xs font-mono px-2 py-1 rounded"
              style={{ background: "#EAF6EF", color: "#2E9E62", border: "1px solid #A8DFC0" }}>
              ✓ Beneficiary Count Loaded
            </span>
          )}
        </div>

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

      {/* SSVI Score */}
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
                FY2025 national average: 6.42 · Median: 7 · Scores ≥10 trigger additional CMS oversight
              </div>
              <div className="mt-2 flex gap-3 flex-wrap">
                {psrData?.ssviUtilizationScore != null && (
                  <div className="rounded-lg px-3 py-1.5 text-sm font-mono" style={{ background: "#F5F6F8", color: "#16202E" }}>
                    Utilization Score: <strong style={{ color: ssviColor(psrData.ssviUtilizationScore) }}>{psrData.ssviUtilizationScore}/8</strong>
                  </div>
                )}
                {psrData?.ssviSpendingScore != null && (
                  <div className="rounded-lg px-3 py-1.5 text-sm font-mono" style={{ background: "#F5F6F8", color: "#16202E" }}>
                    Spending Score (est.): <strong>{psrData.ssviSpendingScore}/8</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SSVI disclaimer */}
          <div className="mt-4 p-3 rounded-xl flex items-start gap-3"
            style={{ background: "#F5F6F8", border: "1px solid #E3E7ED" }}>
            <Info size={15} color="#64708A" className="shrink-0 mt-0.5" />
            <div className="text-xs font-mono" style={{ color: "#64708A" }}>
              <strong>How this SSVI estimate is calculated:</strong> The Utilization Score is calculated directly from your PS&R data using RN visit intensity (Rev Code 0551), length of stay, and level-of-care mix. The Non-Hospice Spending Score requires CMS Part A/B claims data not available in your PS&R — we use the FY2025 national average of 3.21 as an estimate. Your actual CMS-published SSVI may differ. Pull Report Type 832 and 833 from CASPER for discharge and readmission data to improve accuracy.
            </div>
          </div>

          {ssvi >= 10 && (
            <div className="mt-3 p-3 rounded-xl flex items-start gap-3"
              style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
              <AlertTriangle size={16} color="#D14343" className="shrink-0 mt-0.5" />
              <div className="text-sm" style={{ color: "#B23A2E" }}>
                <strong>High SSVI Warning:</strong> Scores ≥10 signal meaningful deviation from CMS peer norms. CMS posts provider-level SSVI scores publicly on the Hospice Center webpage. Facilities with high scores may be subject to additional program integrity review.
              </div>
            </div>
          )}

          {psrData?.ssviFindings?.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs uppercase tracking-widest font-mono mb-1" style={{ color: "#64708A" }}>
                SSVI Risk Factors from Your PS&R Data
              </div>
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

      {/* CAP Exposure — calculated from real beneficiary counts */}
      {(capLimit != null || capData) && (
        <div className="rounded-2xl p-5"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2 mb-4">
            <PieChart size={16} color="#B8863F" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">
              Medicare Aggregate CAP Analysis
            </span>
            {capExposure > 0 && (
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: "#FDECEA", color: "#D14343" }}>🔴 CAP EXCEEDED</span>
            )}
          </div>

          {capUtilizationPct && (
            <>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-mono" style={{ color: "#16202E" }}>Cap Utilization — Cap Year {capYear}</span>
                <span className="text-sm font-mono font-bold"
                  style={{ color: parseFloat(capUtilizationPct) >= 100 ? "#D14343" : parseFloat(capUtilizationPct) >= 85 ? "#C98A1F" : "#2E9E62" }}>
                  {capUtilizationPct}%
                </span>
              </div>
              <div className="w-full rounded-full h-3" style={{ background: "#E3E7ED" }}>
                <div className="h-3 rounded-full transition-all"
                  style={{
                    width: `${Math.min(parseFloat(capUtilizationPct), 100)}%`,
                    background: parseFloat(capUtilizationPct) >= 100 ? "#D14343" : parseFloat(capUtilizationPct) >= 85 ? "#C98A1F" : "#2E9E62"
                  }} />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Total Beneficiaries", value: totalBeneficiaries ? Number(totalBeneficiaries).toFixed(4) : "—", warn: false },
              { label: `Per-Beneficiary Cap (FY${capYear})`, value: `$${Number(capPerBeneficiary).toLocaleString()}`, warn: false },
              { label: "Aggregate Cap Limit", value: capLimit ? `$${Number(capLimit).toLocaleString(undefined, {maximumFractionDigits: 0})}` : "—", warn: false },
              { label: "Net Reimbursement", value: netReimbursement ? `$${Number(netReimbursement).toLocaleString(undefined, {maximumFractionDigits: 0})}` : "—", warn: capExposure > 0 },
            ].map((m, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: m.warn ? "#FEF3E2" : "#F5F6F8" }}>
                <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
                <div className="text-base font-mono mt-1" style={{ color: m.warn ? "#C98A1F" : "#16202E" }}>{m.value}</div>
              </div>
            ))}
          </div>

          {capExposure > 0 && (
            <div className="mt-3 p-4 rounded-xl flex items-start gap-3"
              style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
              <AlertTriangle size={18} color="#D14343" className="shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold" style={{ color: "#D14343" }}>
                  🔴 CAP EXCEEDED — ${Number(capExposure).toLocaleString(undefined, {maximumFractionDigits: 0})} owed to CMS
                </div>
                <div className="text-sm mt-1" style={{ color: "#B23A2E" }}>
                  Your net reimbursement of ${Number(netReimbursement).toLocaleString(undefined, {maximumFractionDigits: 0})} exceeds your aggregate cap limit of ${Number(capLimit).toLocaleString(undefined, {maximumFractionDigits: 0})} ({totalBeneficiaries?.toFixed(4)} beneficiaries × ${Number(capPerBeneficiary).toLocaleString()} per-beneficiary cap). CMS will initiate a clawback. Remittance required within 60 days of cap year close.
                </div>
              </div>
            </div>
          )}

          {capExposure === 0 && capLimit && (
            <div className="mt-3 p-3 rounded-xl flex items-start gap-3"
              style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
              <CheckCircle2 size={16} color="#2E9E62" className="shrink-0 mt-0.5" />
              <div className="text-sm" style={{ color: "#1A6E41" }}>
                <strong>Under Cap.</strong> Remaining cap headroom: ${Number(capLimit - netReimbursement).toLocaleString(undefined, {maximumFractionDigits: 0})}. Monitor closely as the cap year progresses.
              </div>
            </div>
          )}

          <div className="mt-3 p-3 rounded-xl" style={{ background: "#F5F6F8" }}>
            <div className="text-xs font-mono" style={{ color: "#64708A" }}>
              <strong>How this is calculated:</strong> Beneficiary counts from your Beneficiary Count Summary (Report B51562) × FY{capYear} per-beneficiary cap amount of ${Number(capPerBeneficiary).toLocaleString()} = your aggregate cap limit. Net reimbursement from your PS&R Provider Summary Report (Report 810). This matches the CMS methodology exactly.
            </div>
          </div>
        </div>
      )}

      {/* PS&R Metrics from actual revenue codes */}
      {metrics && Object.values(metrics).some(v => v != null) && (
        <div className="rounded-2xl p-5"
          style={{ background: "#FFFFFF", border: "1px solid #E3E7ED", boxShadow: "0 1px 3px rgba(16,24,40,0.04)" }}>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} color="#B8863F" />
            <span style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-lg">PS&amp;R Utilization Metrics</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Medicare Days (Most Recent)", value: metrics.totalMedicareDays != null ? Number(metrics.totalMedicareDays).toLocaleString() : "—", warn: false },
              { label: "Total Claims", value: metrics.totalClaims != null ? Number(metrics.totalClaims).toLocaleString() : "—", warn: false },
              { label: "Unduplicated Census", value: metrics.totalUnduplicatedCensus != null ? Number(metrics.totalUnduplicatedCensus).toLocaleString() : "—", warn: false },
              { label: "Avg Length of Stay", value: metrics.avgLengthOfStay != null ? `${metrics.avgLengthOfStay} days` : "—", warn: metrics.avgLengthOfStay > 180 },
              { label: "SN Visit Units (15-min)", value: metrics.snVisitUnits != null ? Number(metrics.snVisitUnits).toLocaleString() : "—", warn: false },
              { label: "RN Intensity (units/day)", value: metrics.rnUnitsPerDay != null ? metrics.rnUnitsPerDay : "—", warn: metrics.rnUnitsPerDay < 1.0 },
              { label: "Aide Visit Units", value: metrics.aideVisitUnits != null ? Number(metrics.aideVisitUnits).toLocaleString() : "—", warn: false },
              { label: "Net Reimbursement", value: metrics.netReimbursement != null ? `$${Number(metrics.netReimbursement).toLocaleString(undefined, {maximumFractionDigits: 0})}` : "—", warn: false },
            ].map((m, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: m.warn ? "#FEF3E2" : "#F5F6F8" }}>
                <div className="text-[11px] font-mono" style={{ color: "#8992A3" }}>{m.label}</div>
                <div className="text-base font-mono mt-1" style={{ color: m.warn ? "#C98A1F" : "#16202E" }}>{m.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 rounded-xl" style={{ background: "#F5F6F8" }}>
            <div className="text-xs font-mono" style={{ color: "#64708A" }}>
              <strong>Revenue code key:</strong> 0551 = Skilled Nursing/15-min increments · 0561 = Medical Social Services · 0571 = Aide/Home Health · 0651 = Routine Home Care days · 0250 = Pharmacy units
            </div>
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
                          Scoring Factors
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

// ─── PROMPTS — REWRITTEN FOR REAL CMS PS&R REPORT STRUCTURE ──────────────────
const PSR_PROMPT_1 = `You are a Medicare hospice compliance analyst expert in CMS PS&R (Provider Statistical and Reimbursement System) reports.

You are reading a PS&R Provider Summary Report (Report Type 810) for a HOSPICE - NON-HOSPITAL BASED provider. This report has a specific structure with these sections:

STATISTIC SECTION contains:
- MEDICARE DAYS: total routine home care days billed (Revenue Code 0651)
- CLAIMS: number of Medicare claims submitted  
- TOTAL UNDUPLICATED CENSUS COUNT: unique patients served

CHARGE SECTION contains revenue code rows:
- Rev Code 0250 = PHARMACY (units = drug units, not visits)
- Rev Code 0551 = SKILLED NURS/VISIT/15 MIN (units = 15-minute increments of skilled nursing time)
- Rev Code 0561 = MED SOC SERV/VISIT/15 MIN (units = 15-minute increments of social work)
- Rev Code 0571 = AIDE/HOME HLTH/VISIT/15 M (units = 15-minute increments of aide time)
- Rev Code 0651 = HOSPICE/RTN HOME/DAYS (UNDUP DAYS = total routine home care days)

Each column represents a different SERVICE PERIOD (fiscal year). Use the most recent period with data.

REIMBURSEMENT SECTION contains:
- GROSS REIMBURSEMENT: total billed
- SEQUESTRATION: mandatory 2% reduction
- NET REIMBURSEMENT: actual Medicare payment after sequestration

Calculate these SSVI metrics:
- RN intensity = Rev 0551 units ÷ total Medicare days (units per day). National average is ~1.5 units/day. Under 1.0 is a risk flag.
- Average length of stay = total Medicare days ÷ unduplicated census count
- All days being Rev Code 0651 (routine home care only) is GOOD — means no GIP or continuous care concerns

Calculate SSVI Utilization Score (0-8) based on:
- RN intensity below 1.0 units/day = +2 points toward higher score (worse)
- RN intensity 1.0-1.5 = +1 point
- Average LOS over 180 days = +2 points
- Average LOS 120-180 days = +1 point
- Start at 0 and add points. Cap at 8.
- Note: Non-hospice spending score requires CMS data not in PS&R — use national average of 3.21

Respond with ONLY valid JSON starting with { and ending with }. No other text:

{"agencyName":"string","providerNumber":"string","reportPeriod":"string e.g. 08/01/07 THRU 07/07/26","mostRecentYear":"2026","totalReimbursement":number,"netReimbursement":number,"estimatedClawbackRisk":0,"overallScore":number_0_to_100,"overallRiskLevel":"high|medium|low","ssviScore":number_0_to_16,"ssviUtilizationScore":number_0_to_8,"ssviSpendingScore":3.21,"ssviRiskLevel":"high|medium|low","ssviFindings":[{"measure":"string","detail":"string with actual numbers from report","status":"good|warn|risk"}],"psrMetrics":{"totalMedicareDays":number,"totalClaims":number,"totalUnduplicatedCensus":number,"avgLengthOfStay":number,"snVisitUnits":number,"rnUnitsPerDay":number,"aideVisitUnits":number,"socialWorkUnits":number,"pharmacyUnits":number,"netReimbursement":number,"grossReimbursement":number,"sequestration":number},"categories":[{"id":"rn_intensity","label":"RN Visit Intensity","score":number,"clawbackAmount":0,"auditReason":"string","summary":"string with actual metric","factors":[{"weight":60,"label":"SN visit units per Medicare day","status":"good|warn|risk","detail":"X units ÷ Y days = Z units/day vs national avg 1.5"},{"weight":40,"label":"Total skilled nursing hours","status":"good|warn|risk","detail":"X units × 15 min = Y hours total"}],"actions":["string"]},{"id":"length_of_stay","label":"Length of Stay Analysis","score":number,"clawbackAmount":0,"auditReason":"string","summary":"string","factors":[{"weight":70,"label":"Average length of stay","status":"good|warn|risk","detail":"X days ÷ Y patients = Z avg days vs national avg 89"},{"weight":30,"label":"Total patient volume","status":"good|warn|risk","detail":"string"}],"actions":["string"]},{"id":"level_of_care","label":"Level of Care Mix","score":number,"clawbackAmount":0,"auditReason":"string","summary":"string","factors":[{"weight":60,"label":"Routine home care days","status":"good|warn|risk","detail":"string"},{"weight":40,"label":"GIP/Continuous Care presence","status":"good|warn|risk","detail":"string"}],"actions":["string"]},{"id":"reimbursement","label":"Reimbursement Accuracy","score":number,"clawbackAmount":0,"auditReason":"string","summary":"string","factors":[{"weight":60,"label":"Sequestration compliance","status":"good|warn|risk","detail":"string"},{"weight":40,"label":"Gross to net ratio","status":"good|warn|risk","detail":"string"}],"actions":["string"]}]}

Use ACTUAL NUMBERS from the report. Do not use placeholder values.`;

const PSR_PROMPT_2 = `You are a Medicare hospice compliance analyst. Based on the same PS&R Provider Summary Report (Report Type 810) text, generate compliance scoring for 3 additional categories and identify critical findings.

Focus on:
1. Year-over-year trends between service periods (compare columns)
2. RN visit intensity trends (is it increasing or decreasing?)  
3. Census growth vs reimbursement growth alignment
4. Any anomalies in the charge section

Respond with ONLY valid JSON starting with { and ending with }:

{"categories":[{"id":"billing_trend","label":"Billing & Claims Trend","score":number,"clawbackAmount":0,"auditReason":"string","summary":"string with year over year comparison","factors":[{"weight":50,"label":"Claims volume trend","status":"good|warn|risk","detail":"string with actual claim counts"},{"weight":50,"label":"Reimbursement per claim trend","status":"good|warn|risk","detail":"string with actual dollar amounts"}],"actions":["string"]},{"id":"visit_intensity_trend","label":"Visit Intensity Trend","score":number,"clawbackAmount":0,"auditReason":"string","summary":"string","factors":[{"weight":60,"label":"SN visit unit trend year over year","status":"good|warn|risk","detail":"string with actual unit counts by year"},{"weight":40,"label":"Aide visit trend","status":"good|warn|risk","detail":"string"}],"actions":["string"]},{"id":"survey_readiness","label":"Survey Readiness Indicators","score":number,"clawbackAmount":0,"auditReason":"string","summary":"string","factors":[{"weight":50,"label":"Documentation completeness signals","status":"good|warn|risk","detail":"string"},{"weight":50,"label":"Census stability","status":"good|warn|risk","detail":"string"}],"actions":["string"]}],"criticalFindings":[{"severity":"high|medium|low","category":"string","finding":"string with specific numbers from report","recommendation":"string","clawbackRisk":0}]}

Use ACTUAL NUMBERS from the report. Maximum 3 criticalFindings. Reference specific revenue codes, dollar amounts, and year-over-year changes.`;

const BENEFICIARY_PROMPT = `You are a Medicare hospice CAP (Aggregate Cap) specialist reading a CMS PS&R Beneficiary Count Summary Report (Report Type B51562).

This report shows a table with columns: Cap Year | Full Beneficiary Count | Fractional Beneficiary Count | Total Beneficiary Count

The Total Beneficiary Count is used to calculate the Medicare Aggregate Cap:
- Cap Limit = Total Beneficiary Count × Per-Beneficiary Cap Amount for that fiscal year
- FY2023 per-beneficiary cap: $32,486.92
- FY2024 per-beneficiary cap: $33,494.01  
- FY2025 per-beneficiary cap: $34,159.74
- FY2026 per-beneficiary cap: $34,738.63

Extract ALL cap years shown and their beneficiary counts.

Respond with ONLY valid JSON starting with { and ending with }:

{"agencyName":"string","providerNumber":"string","beneficiaryIdentificationPeriod":"string","paidDatesRange":"string","capYearData":[{"capYear":number,"fullBeneficiaryCount":number,"fractionalBeneficiaryCount":number,"totalBeneficiaryCount":number,"perBeneficiaryCap":number,"aggregateCapLimit":number}],"mostRecentCapYear":number,"totalBeneficiaryCount":number,"aggregateCapLimit":number,"perBeneficiaryCap":number}

Use ACTUAL NUMBERS from the report table. Calculate aggregateCapLimit = totalBeneficiaryCount × perBeneficiaryCap for each year.`;

// ─── UPLOAD ZONE ──────────────────────────────────────────────────────────────
function UploadZone({ label, description, badge, icon: Icon, onFile, loading, hasResult, comingSoon }) {
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
      }}>
      <input ref={fileRef} type="file" accept=".pdf" className="hidden"
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
      {badge && (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full"
          style={{ background: "#F7F0E1", color: "#B8863F", border: "1px solid #E8CFA0" }}>
          {badge}
        </span>
      )}
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
      const truncated = text.substring(0, 5000);
      const raw1 = await callClaude(PSR_PROMPT_1, `PS&R PROVIDER SUMMARY REPORT (Report Type 810) TEXT:\n\n${truncated}`, 1500);
      const part1 = parseJSON(raw1);
      const raw2 = await callClaude(PSR_PROMPT_2, `PS&R PROVIDER SUMMARY REPORT (Report Type 810) TEXT:\n\n${truncated}`, 1200);
      const part2 = parseJSON(raw2);
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
      const raw = await callClaude(BENEFICIARY_PROMPT, `BENEFICIARY COUNT SUMMARY REPORT (Report B51562) TEXT:\n\n${text.substring(0, 3000)}`, 1000);
      const result = parseJSON(raw);
      onCapData(result);
    } catch (e) {
      setCapError("Beneficiary report error: " + e.message);
    } finally {
      setCapLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#16202E" }} className="text-2xl">Report Upload Center</div>
        <p className="text-sm mt-1" style={{ color: "#64708A" }}>
          Upload your CMS PS&R reports directly from CASPER. Each report populates the Dashboard independently — upload one or both.
        </p>
      </div>

      {/* How to get these reports */}
      <div className="rounded-xl p-4" style={{ background: "#F5F6F8", border: "1px solid #E3E7ED" }}>
        <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#64708A" }}>
          How to pull these reports from CMS CASPER
        </div>
        <div className="space-y-1.5">
          {[
            "Log into EIDM at https://eidm.cms.gov",
            "Navigate to CASPER → Hospice Reports",
            "For PS&R Summary: Request Report Type 810 (Provider Summary Report)",
            "For Beneficiary Count: Request Report Type B51562 (Beneficiary Count Summary)",
            "Download as PDF and upload here",
          ].map((step, i) => (
            <div key={i} className="flex gap-2 text-xs font-mono" style={{ color: "#64708A" }}>
              <span style={{ color: "#B8863F" }}>{i + 1}.</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>

      {(hasPsr || hasCap) && (
        <div className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: "#EAF6EF", border: "1px solid #A8DFC0" }}>
          <CheckCircle2 size={18} color="#2E9E62" className="shrink-0" />
          <div className="text-sm flex-1" style={{ color: "#1A6E41" }}>
            <strong>{[hasPsr && "PS&R Report 810", hasCap && "Beneficiary Count"].filter(Boolean).join(" + ")} loaded.</strong> Switch to Dashboard to view your compliance scorecard and CAP analysis.
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-widest font-mono mb-3" style={{ color: "#B8863F" }}>
          Active — AI Analysis Available
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <UploadZone
              label="PS&R Summary Report"
              description="Report Type 810 — Provider Summary Report from CASPER"
              badge="Report Type 810"
              icon={BarChart3}
              onFile={handlePSR}
              loading={psrLoading}
              hasResult={hasPsr} />
            {psrError && (
              <div className="mt-2 rounded-xl p-3 flex items-start gap-2" style={{ background: "#FDECEA", border: "1px solid #F3B8AC" }}>
                <AlertCircle size={15} color="#D14343" className="shrink-0 mt-0.5" />
                <span className="text-sm flex-1" style={{ color: "#B23A2E" }}>{psrError}</span>
                <button onClick={() => setPsrError(null)}><X size={14} color="#B23A2E" /></button>
              </div>
            )}
          </div>
          <div>
            <UploadZone
              label="Beneficiary Count Summary"
              description="Report B51562 — Required for accurate CAP calculation"
              badge="Report B51562"
              icon={PieChart}
              onFile={handleCAP}
              loading={capLoading}
              hasResult={hasCap} />
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
          <UploadZone label="Discharge Report" description="Report Type 832 — Live discharge rates and patterns for SSVI" badge="Report Type 832" icon={FileText} comingSoon onFile={() => {}} />
          <UploadZone label="Cost Reports" description="Annual CMS cost report — visit costs and overhead benchmarking" icon={DollarSign} comingSoon onFile={() => {}} />
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
                Clear PS&R Data
              </button>
            )}
            {hasCap && (
              <button onClick={() => onCapData(null)}
                className="text-xs font-mono px-3 py-1.5 rounded-lg"
                style={{ background: "#FDECEA", color: "#D14343", border: "1px solid #F3B8AC" }}>
                Clear Beneficiary Data
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
      const system = `You are a hospice compliance auditor. Audit this chart against Medicare Hospice CoP. Respond with ONLY valid JSON starting with { and ending with }. No other text. Format: {"overallAssessment":"2 sentence summary","issues":[{"severity":"high","category":"string","finding":"string","recommendation":"string"}],"strengths":["string"]} Maximum 3 issues and 2 strengths.`;
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
    summary:"CMS introduced the Service & Spending Variation Index (SSVI), a 0-16 composite score built from claims data. Scores are posted publicly on the CMS Hospice Center webpage. Utilization Score (0-8) is based on RN visit intensity, length of stay patterns, and live discharge rates. Non-Hospice Spending Score (0-8) is based on Part A/B spending for enrolled beneficiaries.",
    impact:"A score of 10 or above signals meaningful deviation and may trigger additional program integrity review. CMS Administrator Dr. Oz framed this as a tool to identify misuse of Medicare dollars.",
    checklist:["Pull your agency SSVI score from the CMS Hospice Center webpage.","Upload your PS&R Report 810 to AIHospiceOS to estimate your SSVI Utilization Score.","Pull Report 832 from CASPER for discharge data to improve SSVI accuracy.","Review your RN visit intensity — under 1.0 units/day is an SSVI risk flag.","Brief your compliance team on the 9 SSVI measures before the final rule."] },
  { id:"r3", date:"2026-05-14", source:"OIG", tag:"Program Integrity", severity:"medium",
    title:"OIG work plan adds hospice GIP level-of-care review",
    summary:"The OIG added a work plan item focused on GIP level-of-care determinations — reviewing whether documentation supports the acuity required for GIP billing.",
    impact:"GIP documentation is a near-term audit target industry-wide.",
    checklist:["Pre-emptively audit open and recent GIP stays for acuity documentation.","Share OIG focus area with the DON and billing team."] },
  { id:"r4", date:"2026-04-30", source:"CMS", tag:"Survey / Oversight", severity:"medium",
    title:"CMS posts provider-level SSVI scores publicly on Hospice Center webpage",
    summary:"Provider-level SSVI data for FY2024 and FY2025 is now publicly available. FY2025 national average was 6.42, median 7. 833 hospices (12.5%) scored 10 or above.",
    impact:"Referral sources, families, and payers can now see your SSVI score publicly.",
    checklist:["Look up your agency SSVI score on the CMS Hospice Center webpage.","If your score is 8 or above, develop a remediation plan.","Document your response to SSVI outlier measures in your QAPI program."] },
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
    { role: "assistant", text: "I'm your compliance copilot. Ask me about your PS&R metrics, SSVI score, CAP exposure, or any hospice regulatory question." },
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
      const system = `You are the AI Compliance Copilot inside AIHospiceOS for hospice CEOs, owners, and Directors of Clinical Services. Answer hospice regulatory, PS&R Report 810, Beneficiary Count Summary B51562, SSVI scoring, MAC/RAC audit, and CAP exposure questions clearly for an executive audience. Keep answers under 150 words, conversational but precise. Reference specific revenue codes (0551 SN visits, 0651 RHC days, 0571 aide visits) and CMS report types when relevant.`;
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
          placeholder="Ask about PS&R metrics, SSVI, CAP exposure…"
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
              {psrData && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#2E9E6230", color: "#2E9E62" }}>PS&R 810 ✓</span>}
              {capData && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#2E9E6230", color: "#2E9E62" }}>B51562 ✓</span>}
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