import React, { useState, useRef, useEffect } from "react";
import {
  Activity,
  FileText,
  ShieldCheck,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Upload,
  Send,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Clock,
  BookOpen,
  Loader2,
  Stethoscope,
  ClipboardList,
  Minus,
  RefreshCw,
  CloudOff,
} from "lucide-react";
import { APPS_SCRIPT_URL } from "./config.js";

const ICONS = {
  Activity, FileText, ShieldCheck, Stethoscope, ClipboardList, AlertTriangle, TrendingDown, TrendingUp,
};

const BACKEND_CONFIGURED = APPS_SCRIPT_URL && APPS_SCRIPT_URL.startsWith("https://script.google.com/");

/* ------------------------------------------------------------------ */
/*  AIHospiceOS — Compliance Operating System prototype                */
/*  Design tokens                                                      */
/*  bg-void #0F1B21 · bg-panel #162329 · bg-raised #1C2C33              */
/*  hairline #2B3E45 · ink #ECE6D8 · muted #8FA3AA                      */
/*  gold (regulatory/citation) #C79A4D · good #4B9B72                   */
/*  warn #D6A93F · risk #C1543A                                         */
/*  display: "Fraunces" · body: "Inter" · data/mono: "IBM Plex Mono"    */
/* ------------------------------------------------------------------ */

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

const MODEL = "claude-sonnet-4-6";

async function callClaude(system, userText, maxTokens = 1000) {
  if (!BACKEND_CONFIGURED) {
    throw new Error("Connect your Google Sheet backend first — see src/config.js.");
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    // text/plain avoids a CORS preflight against the Apps Script endpoint;
    // the body is still parsed as JSON on the other end.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "claude",
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

async function fetchSheetData(action) {
  if (!BACKEND_CONFIGURED) return null;
  const res = await fetch(`${APPS_SCRIPT_URL}?action=${action}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function stripJsonFence(text) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

/* ------------------------------------------------------------------ */
/*  Mock domain data — represents what the Regulatory Intelligence     */
/*  Engine / Chart Auditor / Scoring Engine would produce in production*/
/* ------------------------------------------------------------------ */

const FALLBACK_SCORE_CATEGORIES = [
  {
    id: "clinical",
    label: "Clinical Documentation",
    score: 87,
    trend: 3,
    icon: Stethoscope,
    summary:
      "Charting is strong overall. A handful of recert narratives are running thin on decline-specific detail.",
    factors: [
      { weight: 40, label: "Physician narrative specificity", status: "good", detail: "38 of 41 recertifications include disease-specific decline indicators tied to the terminal diagnosis." },
      { weight: 25, label: "IDG note timeliness", status: "good", detail: "All interdisciplinary group notes filed within 24 hours of the meeting." },
      { weight: 20, label: "Plan of care alignment", status: "warn", detail: "6 charts show a POC goal that isn't revisited in the following IDG note." },
      { weight: 15, label: "Visit frequency vs. POC", status: "warn", detail: "3 patients had a scheduled SN visit skipped without a documented reason." },
    ],
    actions: [
      "Add a decline-indicator prompt to the recert narrative template for the 3 flagged charts.",
      "Require IDG notes to reference the specific POC goal number they address.",
      "Route missed-visit charts to the DON queue for same-week reason documentation.",
    ],
  },
  {
    id: "billing",
    label: "Billing Accuracy",
    score: 74,
    trend: -5,
    icon: ClipboardList,
    summary:
      "Trending down. Level-of-care transitions are the main driver — GIP days are outpacing supporting documentation.",
    factors: [
      { weight: 35, label: "Level-of-care support", status: "risk", detail: "4 GIP stays exceed 5 days without a re-assessment note justifying continued GIP." },
      { weight: 30, label: "HIS/claims alignment", status: "good", detail: "Admission and discharge HIS records match claims data for 96% of episodes." },
      { weight: 20, label: "NOE/NOTR timeliness", status: "good", detail: "Notices of election filed within the 5-day window for all October admissions." },
      { weight: 15, label: "Physician certification timing", status: "warn", detail: "2 certifications signed after the required window, with late-cert justification missing." },
    ],
    actions: [
      "Pull the 4 GIP charts over 5 days and get a same-day re-assessment note or step down the level of care.",
      "Add a late-certification justification field that blocks claim submission until completed.",
    ],
  },
  {
    id: "survey",
    label: "Survey Readiness",
    score: 91,
    trend: 1,
    icon: ShieldCheck,
    summary: "Strong position. Emergency preparedness drill documentation is the only open item from the last mock survey.",
    factors: [
      { weight: 30, label: "CoP tag closure rate", status: "good", detail: "All tags from the last state survey closed within their POC timelines." },
      { weight: 25, label: "QAPI program activity", status: "good", detail: "QAPI committee met on schedule with documented PIPs for 3 focus areas." },
      { weight: 25, label: "Emergency preparedness", status: "warn", detail: "Annual full-scale drill documentation is 40 days overdue." },
      { weight: 20, label: "Personnel file completeness", status: "good", detail: "Competency and background-check files complete for 100% of active staff." },
    ],
    actions: ["Schedule and document the overdue full-scale emergency preparedness drill this month."],
  },
  {
    id: "quality",
    label: "Quality Measures",
    score: 82,
    trend: 2,
    icon: Activity,
    summary: "HIS composite measures are on target; pain assessment timeliness needs a small push.",
    factors: [
      { weight: 40, label: "HIS composite measures", status: "good", detail: "7 of 7 HIS process measures at or above the national benchmark." },
      { weight: 30, label: "Pain assessment timeliness", status: "warn", detail: "Comprehensive pain assessment completed within 5 days for 88% of admissions (target 95%)." },
      { weight: 30, label: "CAHPS Hospice Survey signal", status: "good", detail: "Family communication ratings trending above regional average." },
    ],
    actions: ["Add a pain-assessment due-date alert at day 3 post-admission for intake nurses."],
  },
  {
    id: "safety",
    label: "Safety & Risk",
    score: 95,
    trend: 0,
    icon: AlertTriangle,
    summary: "No open safety findings. Controlled substance disposal logs are the one area to keep watching.",
    factors: [
      { weight: 50, label: "Adverse event reporting", status: "good", detail: "All reportable events logged and reviewed within required timeframes." },
      { weight: 30, label: "Controlled substance disposal", status: "good", detail: "Disposal logs complete and co-signed for 39 of 40 reviewed episodes." },
      { weight: 20, label: "Infection control audits", status: "good", detail: "Monthly bag technique audits passing at 100%." },
    ],
    actions: ["Track down the co-signature for the 1 outstanding disposal log."],
  },
  {
    id: "denial",
    label: "Denial Risk",
    score: 68,
    trend: -8,
    icon: TrendingDown,
    summary: "Highest-risk category this cycle. Face-to-face documentation gaps are the leading denial driver.",
    factors: [
      { weight: 45, label: "Face-to-face encounter documentation", status: "risk", detail: "5 recert F2F notes lack an explicit clinical-eligibility statement tied to the encounter." },
      { weight: 30, label: "Terminal prognosis support", status: "warn", detail: "Supporting documentation for 6-month prognosis is present but generic in 4 charts." },
      { weight: 25, label: "Related vs. unrelated diagnosis coding", status: "good", detail: "Coding review shows correct related/unrelated classification in 97% of claims." },
    ],
    actions: [
      "Have the F2F-performing clinician add a direct eligibility statement to the 5 flagged notes before claim submission.",
      "Strengthen prognosis narratives with disease-specific clinical indicators rather than general decline language.",
    ],
  },
];

const FALLBACK_REG_UPDATES = [
  {
    id: "r1",
    date: "2026-06-24",
    source: "CMS",
    tag: "Conditions of Participation",
    severity: "high",
    title: "Hospice election statement addendum — clarified timing requirement",
    summary:
      "CMS clarified that the election statement addendum must be provided within the same 3-day window as the election statement itself when a patient or representative requests it, closing an ambiguity agencies had been interpreting differently.",
    impact:
      "If your intake workflow currently allows the addendum to be sent after the election statement, that gap is now a compliance finding, not just a best-practice miss.",
    checklist: [
      "Update the intake SOP so the addendum request trigger fires at election, not after.",
      "Retrain admissions staff on the 3-day window for addendum delivery.",
      "Audit the last 30 days of elections for addendum timing gaps.",
    ],
  },
  {
    id: "r2",
    date: "2026-06-10",
    source: "CMS",
    tag: "Payment / Billing",
    severity: "medium",
    title: "FY2027 hospice payment rate update proposed rule released",
    summary:
      "The proposed rule includes the annual payment update, aggregate cap recalculation methodology, and a proposed revision to the hospice quality reporting measure set.",
    impact:
      "No immediate documentation change required, but the proposed HQRP measure set changes will affect what your QAPI program needs to be tracking starting in FY2027.",
    checklist: [
      "Review the proposed HQRP measure set against your current QAPI focus areas.",
      "Flag any new measures for data-collection readiness before the final rule.",
    ],
  },
  {
    id: "r3",
    date: "2026-05-29",
    source: "State Survey Agency",
    tag: "Survey / State",
    severity: "medium",
    title: "State agency updates infection control surveyor worksheet",
    summary:
      "The state survey agency revised its infection control worksheet to add explicit questions about home-visit bag technique and PPE supply chain contingency planning.",
    impact:
      "Your infection control policy should explicitly address PPE supply contingency planning, which most agencies haven't historically documented as a standalone item.",
    checklist: [
      "Add a PPE supply contingency section to the infection control policy.",
      "Brief field staff on the updated bag-technique expectations before the next survey window.",
    ],
  },
  {
    id: "r4",
    date: "2026-05-14",
    source: "OIG",
    tag: "Program Integrity",
    severity: "low",
    title: "OIG work plan adds hospice GIP level-of-care review",
    summary:
      "The OIG added a new work plan item focused on general inpatient level-of-care determinations, specifically reviewing whether documentation supports the acuity required for GIP billing.",
    impact:
      "This is a signal, not a rule change — but it means GIP documentation is a near-term audit target industry-wide, which aligns with this agency's current Billing Accuracy score driver.",
    checklist: [
      "Pre-emptively audit open and recent GIP stays for acuity documentation.",
      "Share OIG focus area with the DON and billing team as a standing agenda item.",
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

const statusColor = (status) =>
  status === "good" ? "#4B9B72" : status === "warn" ? "#D6A93F" : "#C1543A";

const severityColor = (sev) =>
  sev === "high" ? "#C1543A" : sev === "medium" ? "#D6A93F" : "#6E8790";

function ScoreRing({ score, size = 84, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 85 ? "#4B9B72" : pct >= 70 ? "#D6A93F" : "#C1543A";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2B3E45" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={c - (pct / 100) * c}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="IBM Plex Mono, monospace"
        fontSize={size * 0.26}
        fontWeight="600"
        fill="#ECE6D8"
      >
        {pct}
      </text>
    </svg>
  );
}

function TrendBadge({ trend }) {
  const Icon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const color = trend > 0 ? "#4B9B72" : trend < 0 ? "#C1543A" : "#8FA3AA";
  return (
    <span
      style={{ color }}
      className="inline-flex items-center gap-1 text-xs font-mono"
    >
      <Icon size={13} />
      {trend === 0 ? "flat" : `${trend > 0 ? "+" : ""}${trend} this cycle`}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Live data hook — reads from the Google Sheet backend when          */
/*  configured, falls back to bundled sample data otherwise so the     */
/*  app is always demoable.                                            */
/* ------------------------------------------------------------------ */

function useSheetData(action, key, fallback) {
  const [state, setState] = useState({ data: fallback, loading: BACKEND_CONFIGURED, error: null, live: false });

  const load = () => {
    if (!BACKEND_CONFIGURED) {
      setState({ data: fallback, loading: false, error: null, live: false });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchSheetData(action)
      .then((res) => {
        const data = res && res[key];
        if (!data || data.length === 0) throw new Error("Sheet returned no rows");
        setState({ data, loading: false, error: null, live: true });
      })
      .catch((err) => {
        setState({ data: fallback, loading: false, error: err.message, live: false });
      });
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, reload: load };
}

function resolveIcon(icon) {
  if (typeof icon !== "string") return icon || Activity;
  return ICONS[icon] || Activity;
}

function DataSourceBadge({ live, loading, error, onReload }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: "#8FA3AA" }}>
        <Loader2 size={11} className="animate-spin" /> loading sheet…
      </span>
    );
  }
  if (live) {
    return (
      <button onClick={onReload} className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: "#4B9B72" }}>
        <RefreshCw size={11} /> live from Google Sheet
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: "#D6A93F" }} title={error || "Not connected"}>
      <CloudOff size={11} /> sample data — {BACKEND_CONFIGURED ? "sheet unreachable" : "connect your sheet in src/config.js"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard tab                                                      */
/* ------------------------------------------------------------------ */

function Dashboard() {
  const [openId, setOpenId] = useState("denial");
  const { data: categories, loading, live, error, reload } = useSheetData("scores", "scores", FALLBACK_SCORE_CATEGORIES);
  const overall = categories.length
    ? Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <DataSourceBadge live={live} loading={loading} error={error} onReload={reload} />
      </div>
      <div
        className="rounded-2xl p-6 flex flex-col sm:flex-row items-center sm:items-stretch gap-6"
        style={{ background: "#1C2C33", border: "1px solid #2B3E45" }}
      >
        <div className="flex items-center gap-5">
          <ScoreRing score={overall} size={104} stroke={9} />
          <div>
            <div className="text-xs uppercase tracking-widest font-mono" style={{ color: "#8FA3AA" }}>
              Composite Compliance Index
            </div>
            <div
              className="text-2xl mt-1"
              style={{ fontFamily: "Fraunces, serif", color: "#ECE6D8" }}
            >
              Meridian Hospice &amp; Palliative Care
            </div>
            <div className="text-sm mt-1" style={{ color: "#8FA3AA" }}>
              8 charts flagged for review · 2 categories trending down · next mock survey window in 41 days
            </div>
          </div>
        </div>
<div className="flex-1 min-w-0 flex flex-wrap gap-3 sm:pl-6 sm:border-l" style={{ borderColor: "#2B3E45" }}>
          {categories.slice(0, 6).map((c) => (
            <button
              key={c.id}
              onClick={() => setOpenId(c.id)}
              className="text-left rounded-lg px-3 py-2 transition-colors"
              style={{
                background: openId === c.id ? "#243740" : "transparent",
                border: "1px solid " + (openId === c.id ? "#3A5560" : "transparent"),
                flex: "1 1 130px",
                minWidth: 0,
              }}
            >
              <div className="text-[11px] font-mono truncate" style={{ color: "#8FA3AA" }}>
                {c.label}
              </div>
              <div className="flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-lg font-mono" style={{ color: statusColorForScore(c.score) }}>
                  {c.score}
                </span>
                <TrendBadge trend={c.trend} />
              </div>
            </button>
          ))}
        </div>

      <div className="space-y-3">
        {categories.map((cat) => {
          const Icon = resolveIcon(cat.icon);
          const open = openId === cat.id;
          return (
            <div
              key={cat.id}
              className="rounded-2xl overflow-hidden"
              style={{ background: "#162329", border: "1px solid #2B3E45" }}
            >
              <button
                onClick={() => setOpenId(open ? null : cat.id)}
                className="w-full flex items-center gap-4 p-4 text-left"
              >
                <ScoreRing score={cat.score} size={54} stroke={6} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon size={15} style={{ color: "#C79A4D" }} />
                    <span style={{ fontFamily: "Fraunces, serif", color: "#ECE6D8" }} className="text-base">
                      {cat.label}
                    </span>
                    <TrendBadge trend={cat.trend} />
                  </div>
                  <p className="text-sm mt-1 truncate" style={{ color: "#8FA3AA" }}>
                    {cat.summary}
                  </p>
                </div>
                {open ? <ChevronDown size={18} color="#8FA3AA" /> : <ChevronRight size={18} color="#8FA3AA" />}
              </button>

              {open && (
                <div className="px-4 pb-5 pt-1 space-y-5" style={{ borderTop: "1px solid #2B3E45" }}>
                  <div>
                    <div className="text-xs uppercase tracking-widest font-mono mt-4 mb-2" style={{ color: "#8FA3AA" }}>
                      Why this score
                    </div>
                    <div className="space-y-2">
                      {cat.factors.map((f, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-10 shrink-0 text-right text-[11px] font-mono pt-0.5" style={{ color: "#6E8790" }}>
                            {f.weight}%
                          </div>
                          <div
                            className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                            style={{ background: statusColor(f.status) }}
                          />
                          <div className="flex-1">
                            <div className="text-sm" style={{ color: "#ECE6D8" }}>
                              {f.label}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: "#8FA3AA" }}>
                              {f.detail}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#C79A4D" }}>
                      To raise this score
                    </div>
                    <ul className="space-y-1.5">
                      {cat.actions.map((a, i) => (
                        <li key={i} className="text-sm flex gap-2" style={{ color: "#ECE6D8" }}>
                          <CheckCircle2 size={15} className="shrink-0 mt-0.5" color="#4B9B72" />
                          {a}
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

function statusColorForScore(score) {
  return score >= 85 ? "#4B9B72" : score >= 70 ? "#D6A93F" : "#C1543A";
}

/* ------------------------------------------------------------------ */
/*  Chart Review tab — real Claude call                                */
/* ------------------------------------------------------------------ */

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
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const system = `You are the AI Clinical Chart Auditor inside a hospice compliance platform. Given raw text from a chart (notes, certifications, IDG entries), audit it against Medicare Hospice Conditions of Participation norms: eligibility support, documentation consistency, signature/date completeness, and billing risk.
Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{"overallAssessment":"1-2 sentence plain-language summary","issues":[{"severity":"high|medium|low","category":"string","finding":"string","recommendation":"string"}],"strengths":["string"]}
Keep it to at most 5 issues and 3 strengths, each field under 30 words.`;
      const raw = await callClaude(system, text, 1000);
      const parsed = JSON.parse(stripJsonFence(raw));
      setResult(parsed);
    } catch (e) {
      setError("Couldn't parse the analysis. Try again — the model occasionally returns malformed JSON.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-5" style={{ background: "#162329", border: "1px solid #2B3E45" }}>
        <div className="flex items-center gap-2 mb-1">
          <FileText size={16} color="#C79A4D" />
          <span style={{ fontFamily: "Fraunces, serif", color: "#ECE6D8" }} className="text-lg">
            Chart Auditor
          </span>
        </div>
        <p className="text-sm mb-3" style={{ color: "#8FA3AA" }}>
          Paste chart text, certifications, or IDG notes below. This calls Claude live to flag missing elements, contradictions, and signature/date gaps against hospice CoP norms.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          className="w-full rounded-lg p-3 text-sm font-mono focus:outline-none"
          style={{
            background: "#0F1B21",
            border: "1px solid #2B3E45",
            color: "#ECE6D8",
          }}
          placeholder="Paste chart text here…"
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={analyze}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity"
            style={{ background: "#C79A4D", color: "#0F1B21" }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? "Analyzing…" : "Analyze chart"}
          </button>
          <button
            onClick={() => {
              setText(SAMPLE_CHART);
              setResult(null);
            }}
            className="text-xs underline"
            style={{ color: "#8FA3AA" }}
          >
            Reset to sample
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg p-3 text-sm" style={{ background: "#2A1B18", color: "#E29B85", border: "1px solid #5A3226" }}>
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-2xl p-5 space-y-5" style={{ background: "#162329", border: "1px solid #2B3E45" }}>
          <div>
            <div className="text-xs uppercase tracking-widest font-mono mb-1" style={{ color: "#8FA3AA" }}>
              Assessment
            </div>
            <p className="text-sm" style={{ color: "#ECE6D8" }}>{result.overallAssessment}</p>
          </div>

          {result.issues && result.issues.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#8FA3AA" }}>
                Findings
              </div>
              <div className="space-y-2">
                {result.issues.map((iss, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg" style={{ background: "#1C2C33" }}>
                    <span
                      className="text-[10px] uppercase font-mono px-2 py-1 rounded shrink-0 h-fit"
                      style={{ background: severityColor(iss.severity) + "22", color: severityColor(iss.severity) }}
                    >
                      {iss.severity}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-mono mb-0.5" style={{ color: "#C79A4D" }}>{iss.category}</div>
                      <div className="text-sm" style={{ color: "#ECE6D8" }}>{iss.finding}</div>
                      <div className="text-sm mt-1" style={{ color: "#8FA3AA" }}>→ {iss.recommendation}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.strengths && result.strengths.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest font-mono mb-2" style={{ color: "#8FA3AA" }}>
                What's solid
              </div>
              <ul className="space-y-1">
                {result.strengths.map((s, i) => (
                  <li key={i} className="text-sm flex gap-2" style={{ color: "#ECE6D8" }}>
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5" color="#4B9B72" />
                    {s}
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

/* ------------------------------------------------------------------ */
/*  Regulatory Watch tab                                               */
/* ------------------------------------------------------------------ */

function RegulatoryWatch() {
  const [checked, setChecked] = useState({});
  const { data: regUpdates, loading, live, error, reload } = useSheetData("regs", "regs", FALLBACK_REG_UPDATES);
  const toggle = (regId, idx) => {
    const key = `${regId}-${idx}`;
    setChecked((c) => ({ ...c, [key]: !c[key] }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen size={16} color="#C79A4D" />
          <span style={{ fontFamily: "Fraunces, serif", color: "#ECE6D8" }} className="text-lg">
            Regulatory Watch
          </span>
        </div>
        <DataSourceBadge live={live} loading={loading} error={error} onReload={reload} />
      </div>
      <p className="text-sm -mt-2" style={{ color: "#8FA3AA" }}>
        New and changed hospice requirements, translated into what your agency actually needs to do.
      </p>

      {regUpdates.map((r) => {
        const total = r.checklist.length;
        const done = r.checklist.filter((_, i) => checked[`${r.id}-${i}`]).length;
        return (
          <div key={r.id} className="rounded-2xl p-5" style={{ background: "#162329", border: "1px solid #2B3E45" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-[10px] uppercase font-mono px-2 py-1 rounded"
                  style={{ background: severityColor(r.severity) + "22", color: severityColor(r.severity) }}
                >
                  {r.severity} impact
                </span>
                <span className="text-[11px] font-mono" style={{ color: "#6E8790" }}>{r.source} · {r.tag}</span>
              </div>
              <span className="text-[11px] font-mono flex items-center gap-1 shrink-0" style={{ color: "#6E8790" }}>
                <Clock size={12} />
                {r.date}
              </span>
            </div>
            <h3 className="mt-2 text-base" style={{ fontFamily: "Fraunces, serif", color: "#ECE6D8" }}>
              {r.title}
            </h3>
            <p className="text-sm mt-2" style={{ color: "#8FA3AA" }}>{r.summary}</p>
            <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: "#1C2C33", color: "#ECE6D8" }}>
              <span className="font-mono text-xs" style={{ color: "#C79A4D" }}>What it means for you: </span>
              {r.impact}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-widest font-mono" style={{ color: "#8FA3AA" }}>
                  Action checklist
                </span>
                <span className="text-xs font-mono" style={{ color: done === total ? "#4B9B72" : "#8FA3AA" }}>
                  {done}/{total} done
                </span>
              </div>
              <div className="space-y-1.5">
                {r.checklist.map((item, i) => {
                  const key = `${r.id}-${i}`;
                  const isChecked = !!checked[key];
                  return (
                    <button
                      key={i}
                      onClick={() => toggle(r.id, i)}
                      className="w-full flex items-start gap-2 text-left p-2 rounded-lg transition-colors"
                      style={{ background: isChecked ? "#1B2E24" : "transparent" }}
                    >
                      <div
                        className="w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center"
                        style={{
                          border: `1.5px solid ${isChecked ? "#4B9B72" : "#3A5560"}`,
                          background: isChecked ? "#4B9B72" : "transparent",
                        }}
                      >
                        {isChecked && <CheckCircle2 size={11} color="#0F1B21" />}
                      </div>
                      <span
                        className="text-sm"
                        style={{
                          color: isChecked ? "#8FA3AA" : "#ECE6D8",
                          textDecoration: isChecked ? "line-through" : "none",
                        }}
                      >
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

/* ------------------------------------------------------------------ */
/*  Copilot tab — real Claude call                                     */
/* ------------------------------------------------------------------ */

function Copilot() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "I'm your compliance copilot. Ask me about a score, a regulation, or what a survey tag means — I'll answer in plain language.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const system = `You are the AI Compliance Copilot inside a hospice compliance platform called AIHospiceOS. Answer hospice regulatory, clinical documentation, and audit-readiness questions clearly and in plain language for a compliance officer, nurse, or executive audience. Reference general Medicare Hospice Conditions of Participation concepts where relevant. Keep answers under 130 words, no markdown headers, conversational but precise.`;
      const reply = await callClaude(system, q, 500);
      setMessages((m) => [...m, { role: "assistant", text: reply.trim() }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong reaching the model — try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-2xl flex flex-col h-[65vh] md:h-[calc(100vh-7rem)] md:max-h-[46rem]"
      style={{ background: "#162329", border: "1px solid #2B3E45" }}
    >
      <div className="p-4 flex items-center gap-2" style={{ borderBottom: "1px solid #2B3E45" }}>
        <MessageSquare size={16} color="#C79A4D" />
        <span style={{ fontFamily: "Fraunces, serif", color: "#ECE6D8" }} className="text-lg">
          Compliance Copilot
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-xl px-3 py-2 text-sm"
              style={{
                background: m.role === "user" ? "#C79A4D" : "#1C2C33",
                color: m.role === "user" ? "#0F1B21" : "#ECE6D8",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl px-3 py-2 text-sm flex items-center gap-2" style={{ background: "#1C2C33", color: "#8FA3AA" }}>
              <Loader2 size={13} className="animate-spin" /> thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-3 flex gap-2" style={{ borderTop: "1px solid #2B3E45" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about a score, a regulation, a tag…"
          className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
          style={{ background: "#0F1B21", border: "1px solid #2B3E45", color: "#ECE6D8" }}
        />
        <button
          onClick={send}
          disabled={loading}
          className="rounded-lg px-3 flex items-center justify-center"
          style={{ background: "#C79A4D", color: "#0F1B21" }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shell                                                               */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "chart", label: "Chart Review", icon: FileText },
  { id: "reg", label: "Regulatory Watch", icon: BookOpen },
  { id: "copilot", label: "Copilot", icon: MessageSquare },
];

// Wider tabs get more breathing room on large screens; the chat stays
// narrow so lines don't stretch across a full desktop monitor.
const CONTENT_MAX_W = {
  dashboard: "max-w-5xl",
  chart: "max-w-4xl",
  reg: "max-w-4xl",
  copilot: "max-w-2xl",
};

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "#C79A4D" }}
      >
        <ShieldCheck size={19} color="#0F1B21" />
      </div>
      <div>
        <div style={{ fontFamily: "Fraunces, serif", color: "#ECE6D8" }} className="text-xl leading-none">
          AIHospiceOS
        </div>
        <div className="text-[11px] font-mono mt-0.5" style={{ color: "#6E8790" }}>
          compliance · quality · audit readiness
        </div>
      </div>
    </div>
  );
}

function InstallBanner() {
  const [prompt, setPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!prompt || dismissed) return null;

  return (
    <div
      className="flex items-center gap-3 mx-4 md:mx-8 mt-4 rounded-xl px-4 py-3"
      style={{ background: "#243740", border: "1px solid #3A5560" }}
    >
      <ShieldCheck size={16} color="#C79A4D" className="shrink-0" />
      <span className="text-sm flex-1" style={{ color: "#ECE6D8" }}>
        Install AIHospiceOS for quick, full-screen access.
      </span>
      <button
        onClick={async () => {
          prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
        className="text-xs font-medium rounded-lg px-3 py-1.5 shrink-0"
        style={{ background: "#C79A4D", color: "#0F1B21" }}
      >
        Install
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-xs shrink-0"
        style={{ color: "#8FA3AA" }}
      >
        Not now
      </button>
    </div>
  );
}

export default function AIHospiceOS() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div
      style={{ background: "#0F1B21", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}
      className="flex flex-col md:flex-row"
    >
      <style>{FONT_IMPORT}</style>

      {/* Desktop sidebar — hidden on phones */}
      <aside
        className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:h-screen md:sticky md:top-0 px-5 py-6"
        style={{ borderRight: "1px solid #2B3E45" }}
      >
        <Logo />
        <nav className="mt-8 flex flex-col gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-left transition-colors"
                style={{
                  background: active ? "#243740" : "transparent",
                  color: active ? "#ECE6D8" : "#8FA3AA",
                }}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto text-[11px] font-mono leading-relaxed" style={{ color: "#4A5F67" }}>
          Prototype — scores &amp; regulatory items are illustrative. Chart Review and Copilot call Claude live.
        </div>
      </aside>

      {/* Mobile top bar — hidden on desktop */}
      <div className="md:hidden px-4 pt-6 pb-2">
        <Logo />
      </div>

      {/* Main scroll area */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <InstallBanner />
        <div className={`${CONTENT_MAX_W[tab]} mx-auto px-4 md:px-8 py-4 md:py-8 pb-28 md:pb-10`}>
          {tab === "dashboard" && <Dashboard />}
          {tab === "chart" && <ChartReview />}
          {tab === "reg" && <RegulatoryWatch />}
          {tab === "copilot" && <Copilot />}

          <div className="md:hidden text-center text-[11px] font-mono mt-8" style={{ color: "#4A5F67" }}>
            Prototype — scores &amp; regulatory items are illustrative. Chart Review and Copilot call Claude live.
          </div>
        </div>
      </main>

      {/* Mobile bottom nav — hidden on desktop */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 flex items-stretch z-10"
        style={{ background: "#162329", borderTop: "1px solid #2B3E45", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium"
              style={{ color: active ? "#C79A4D" : "#8FA3AA" }}
            >
              <Icon size={18} />
              {t.label.split(" ")[0]}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
