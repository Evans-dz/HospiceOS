/**
 * AIHospiceOS — Apps Script backend
 * -----------------------------------------------------------------
 * Bind this script to a Google Sheet (Extensions > Apps Script from
 * inside the Sheet). Run setupSheet() once from the editor to create
 * and seed the tabs. Then Deploy > New deployment > Web app.
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Copy the /exec URL into the frontend's src/config.js.
 *
 * Store your Anthropic key at Project Settings > Script Properties
 * as ANTHROPIC_API_KEY — never put it directly in this file.
 * -----------------------------------------------------------------
 */

const SHEETS = {
  SCORES: "Scores",
  FACTORS: "Factors",
  ACTIONS: "Actions",
  REGS: "RegUpdates",
  CHECKLIST: "RegChecklist",
};

/* ------------------------------------------------------------------ */
/*  One-time setup — creates tabs and seeds them with starter content  */
/* ------------------------------------------------------------------ */

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const scores = ensureSheet_(ss, SHEETS.SCORES, [
    "id", "label", "icon", "score", "trend", "summary",
  ]);
  writeRowsIfEmpty_(scores, [
    ["clinical", "Clinical Documentation", "Stethoscope", 87, 3, "Charting is strong overall. A handful of recert narratives are running thin on decline-specific detail."],
    ["billing", "Billing Accuracy", "ClipboardList", 74, -5, "Trending down. Level-of-care transitions are the main driver — GIP days are outpacing supporting documentation."],
    ["survey", "Survey Readiness", "ShieldCheck", 91, 1, "Strong position. Emergency preparedness drill documentation is the only open item from the last mock survey."],
    ["quality", "Quality Measures", "Activity", 82, 2, "HIS composite measures are on target; pain assessment timeliness needs a small push."],
    ["safety", "Safety & Risk", "AlertTriangle", 95, 0, "No open safety findings. Controlled substance disposal logs are the one area to keep watching."],
    ["denial", "Denial Risk", "TrendingDown", 68, -8, "Highest-risk category this cycle. Face-to-face documentation gaps are the leading denial driver."],
  ]);

  const factors = ensureSheet_(ss, SHEETS.FACTORS, [
    "category_id", "weight", "label", "status", "detail",
  ]);
  writeRowsIfEmpty_(factors, [
    ["clinical", 40, "Physician narrative specificity", "good", "38 of 41 recertifications include disease-specific decline indicators tied to the terminal diagnosis."],
    ["clinical", 25, "IDG note timeliness", "good", "All interdisciplinary group notes filed within 24 hours of the meeting."],
    ["clinical", 20, "Plan of care alignment", "warn", "6 charts show a POC goal that isn't revisited in the following IDG note."],
    ["clinical", 15, "Visit frequency vs. POC", "warn", "3 patients had a scheduled SN visit skipped without a documented reason."],
    ["billing", 35, "Level-of-care support", "risk", "4 GIP stays exceed 5 days without a re-assessment note justifying continued GIP."],
    ["billing", 30, "HIS/claims alignment", "good", "Admission and discharge HIS records match claims data for 96% of episodes."],
    ["billing", 20, "NOE/NOTR timeliness", "good", "Notices of election filed within the 5-day window for all October admissions."],
    ["billing", 15, "Physician certification timing", "warn", "2 certifications signed after the required window, with late-cert justification missing."],
    ["survey", 30, "CoP tag closure rate", "good", "All tags from the last state survey closed within their POC timelines."],
    ["survey", 25, "QAPI program activity", "good", "QAPI committee met on schedule with documented PIPs for 3 focus areas."],
    ["survey", 25, "Emergency preparedness", "warn", "Annual full-scale drill documentation is 40 days overdue."],
    ["survey", 20, "Personnel file completeness", "good", "Competency and background-check files complete for 100% of active staff."],
    ["quality", 40, "HIS composite measures", "good", "7 of 7 HIS process measures at or above the national benchmark."],
    ["quality", 30, "Pain assessment timeliness", "warn", "Comprehensive pain assessment completed within 5 days for 88% of admissions (target 95%)."],
    ["quality", 30, "CAHPS Hospice Survey signal", "good", "Family communication ratings trending above regional average."],
    ["safety", 50, "Adverse event reporting", "good", "All reportable events logged and reviewed within required timeframes."],
    ["safety", 30, "Controlled substance disposal", "good", "Disposal logs complete and co-signed for 39 of 40 reviewed episodes."],
    ["safety", 20, "Infection control audits", "good", "Monthly bag technique audits passing at 100%."],
    ["denial", 45, "Face-to-face encounter documentation", "risk", "5 recert F2F notes lack an explicit clinical-eligibility statement tied to the encounter."],
    ["denial", 30, "Terminal prognosis support", "warn", "Supporting documentation for 6-month prognosis is present but generic in 4 charts."],
    ["denial", 25, "Related vs. unrelated diagnosis coding", "good", "Coding review shows correct related/unrelated classification in 97% of claims."],
  ]);

  const actions = ensureSheet_(ss, SHEETS.ACTIONS, ["category_id", "action_text"]);
  writeRowsIfEmpty_(actions, [
    ["clinical", "Add a decline-indicator prompt to the recert narrative template for the 3 flagged charts."],
    ["clinical", "Require IDG notes to reference the specific POC goal number they address."],
    ["clinical", "Route missed-visit charts to the DON queue for same-week reason documentation."],
    ["billing", "Pull the 4 GIP charts over 5 days and get a same-day re-assessment note or step down the level of care."],
    ["billing", "Add a late-certification justification field that blocks claim submission until completed."],
    ["survey", "Schedule and document the overdue full-scale emergency preparedness drill this month."],
    ["quality", "Add a pain-assessment due-date alert at day 3 post-admission for intake nurses."],
    ["safety", "Track down the co-signature for the 1 outstanding disposal log."],
    ["denial", "Have the F2F-performing clinician add a direct eligibility statement to the 5 flagged notes before claim submission."],
    ["denial", "Strengthen prognosis narratives with disease-specific clinical indicators rather than general decline language."],
  ]);

  const regs = ensureSheet_(ss, SHEETS.REGS, [
    "id", "date", "source", "tag", "severity", "title", "summary", "impact",
  ]);
  writeRowsIfEmpty_(regs, [
    ["r1", "2026-06-24", "CMS", "Conditions of Participation", "high", "Hospice election statement addendum — clarified timing requirement", "CMS clarified that the election statement addendum must be provided within the same 3-day window as the election statement itself when a patient or representative requests it, closing an ambiguity agencies had been interpreting differently.", "If your intake workflow currently allows the addendum to be sent after the election statement, that gap is now a compliance finding, not just a best-practice miss."],
    ["r2", "2026-06-10", "CMS", "Payment / Billing", "medium", "FY2027 hospice payment rate update proposed rule released", "The proposed rule includes the annual payment update, aggregate cap recalculation methodology, and a proposed revision to the hospice quality reporting measure set.", "No immediate documentation change required, but the proposed HQRP measure set changes will affect what your QAPI program needs to be tracking starting in FY2027."],
    ["r3", "2026-05-29", "State Survey Agency", "Survey / State", "medium", "State agency updates infection control surveyor worksheet", "The state survey agency revised its infection control worksheet to add explicit questions about home-visit bag technique and PPE supply chain contingency planning.", "Your infection control policy should explicitly address PPE supply contingency planning, which most agencies haven't historically documented as a standalone item."],
    ["r4", "2026-05-14", "OIG", "Program Integrity", "low", "OIG work plan adds hospice GIP level-of-care review", "The OIG added a new work plan item focused on general inpatient level-of-care determinations, specifically reviewing whether documentation supports the acuity required for GIP billing.", "This is a signal, not a rule change — but it means GIP documentation is a near-term audit target industry-wide, which aligns with this agency's current Billing Accuracy score driver."],
  ]);

  const checklist = ensureSheet_(ss, SHEETS.CHECKLIST, ["reg_id", "item_text"]);
  writeRowsIfEmpty_(checklist, [
    ["r1", "Update the intake SOP so the addendum request trigger fires at election, not after."],
    ["r1", "Retrain admissions staff on the 3-day window for addendum delivery."],
    ["r1", "Audit the last 30 days of elections for addendum timing gaps."],
    ["r2", "Review the proposed HQRP measure set against your current QAPI focus areas."],
    ["r2", "Flag any new measures for data-collection readiness before the final rule."],
    ["r3", "Add a PPE supply contingency section to the infection control policy."],
    ["r3", "Brief field staff on the updated bag-technique expectations before the next survey window."],
    ["r4", "Pre-emptively audit open and recent GIP stays for acuity documentation."],
    ["r4", "Share OIG focus area with the DON and billing team as a standing agenda item."],
  ]);

  SpreadsheetApp.getUi().alert("AIHospiceOS sheet is set up. You can now edit rows freely — the app reads live.");
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function writeRowsIfEmpty_(sheet, rows) {
  if (sheet.getLastRow() > 1) return; // already has data — don't overwrite edits
  rows.forEach((r) => sheet.appendRow(r));
}

/* ------------------------------------------------------------------ */
/*  Read helpers                                                       */
/* ------------------------------------------------------------------ */

function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });
}

function getScores_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scores = sheetToObjects_(ss.getSheetByName(SHEETS.SCORES));
  const factors = sheetToObjects_(ss.getSheetByName(SHEETS.FACTORS));
  const actions = sheetToObjects_(ss.getSheetByName(SHEETS.ACTIONS));

  return scores.map((s) => ({
    ...s,
    score: Number(s.score),
    trend: Number(s.trend),
    factors: factors
      .filter((f) => f.category_id === s.id)
      .map((f) => ({ weight: Number(f.weight), label: f.label, status: f.status, detail: f.detail })),
    actions: actions.filter((a) => a.category_id === s.id).map((a) => a.action_text),
  }));
}

function getRegUpdates_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const regs = sheetToObjects_(ss.getSheetByName(SHEETS.REGS));
  const checklist = sheetToObjects_(ss.getSheetByName(SHEETS.CHECKLIST));

  return regs
    .map((r) => ({
      ...r,
      date: formatDate_(r.date),
      checklist: checklist.filter((c) => c.reg_id === r.id).map((c) => c.item_text),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function formatDate_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(val);
}

/* ------------------------------------------------------------------ */
/*  Web app entry points                                               */
/* ------------------------------------------------------------------ */

function doGet(e) {
  const action = (e.parameter.action || "").toLowerCase();
  try {
    if (action === "scores") return json_({ scores: getScores_() });
    if (action === "regs") return json_({ regs: getRegUpdates_() });
    return json_({ error: "Unknown action. Use ?action=scores or ?action=regs" });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: "Invalid JSON body" });
  }

  if (payload.action === "claude") {
    return json_(callAnthropic_(payload));
  }

  return json_({ error: "Unknown action" });
}

function callAnthropic_(payload) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return { error: "ANTHROPIC_API_KEY is not set. Project Settings > Script Properties > add ANTHROPIC_API_KEY." };
  }

  const response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    payload: JSON.stringify({
      model: payload.model || "claude-sonnet-4-6",
      max_tokens: payload.max_tokens || 1000,
      system: payload.system,
      messages: payload.messages,
    }),
    muteHttpExceptions: true,
  });

  return JSON.parse(response.getContentText());
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
