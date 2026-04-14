/** @OnlyCurrentDoc */

// ─── Form Configuration ────────────────────────────────────────────────────
// These are the only values you should need to edit when adjusting forms.
// No logic changes required.

var FORM_CONFIG = {
  // Choices for the "Ensemble" question on Pink and Yellow forms.
  ENSEMBLE_CHOICES: ['KSUMB'],

  // Choices for "Reason for late arrival" on the Late Check-In form.
  LATE_REASONS: ['Class', 'Parking / traffic', 'Work', 'Personal emergency', 'Other'],

  // Choices for the "Conflict Days" checkbox question on the Yellow Sheet form.
  CONFLICT_DAYS: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

// Script Property keys — where form IDs are persisted after creation.
var _PROP_PINK = 'PINK_FORM_ID';
var _PROP_LATE = 'LATE_FORM_ID';
var _PROP_YELLOW = 'YELLOW_FORM_ID';

// ─── Public: Build all forms ───────────────────────────────────────────────

/**
 * Creates all three forms from scratch, links each to this spreadsheet, and
 * saves their IDs to Script Properties for future updates.
 *
 * If forms already exist (IDs are stored), asks the user to confirm before
 * trashing them and rebuilding. Historical response rows in the spreadsheet
 * are NOT deleted — only the forms themselves are moved to Drive trash.
 *
 * Run from: Attendance menu → "Build / rebuild forms"
 */
function buildAllForms() {
  var props = PropertiesService.getScriptProperties();
  var existingPink = props.getProperty(_PROP_PINK);
  var existingLate = props.getProperty(_PROP_LATE);
  var existingYellow = props.getProperty(_PROP_YELLOW);

  if (existingPink || existingLate || existingYellow) {
    var ui = SpreadsheetApp.getUi();
    var result = ui.alert(
      'Forms Already Exist',
      'Existing forms will be moved to trash and rebuilt from scratch.\n\n' +
        'Historical response data already in this spreadsheet will be preserved.\n\nContinue?',
      ui.ButtonSet.YES_NO
    );
    if (result !== ui.Button.YES) return;

    _trashForm(existingPink);
    _trashForm(existingLate);
    _trashForm(existingYellow);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var roster = _getRosterData();

  ss.toast('Building Pink Sheet form…', 'Form Builder', -1);
  var pink = _buildPinkForm(roster.allNames);
  props.setProperty(_PROP_PINK, pink.getId());

  ss.toast('Building Late Check-In form…', 'Form Builder', -1);
  var late = _buildLateForm(roster.namesBySection);
  props.setProperty(_PROP_LATE, late.getId());

  ss.toast('Building Yellow Sheet form…', 'Form Builder', -1);
  var yellow = _buildYellowForm(roster.allNames);
  props.setProperty(_PROP_YELLOW, yellow.getId());

  // Install per-form triggers now that IDs are saved
  ss.toast('Installing form submit triggers…', 'Form Builder', -1);
  installFormSubmitTriggers();

  ss.toast('All 3 forms built. Run "Sync roster names to forms" if roster is populated.', 'Form Builder', 15);
  console.log('FormBuilder: Pink=' + pink.getId() + '  Late=' + late.getId() + '  Yellow=' + yellow.getId());
}

/**
 * Logs the published (student-facing) and edit (staff) URLs for each form.
 * Run from the Apps Script editor: select logFormUrls and click Run.
 */
function logFormUrls() {
  var ids = _getStoredFormIds();
  var keys = ['PINK', 'LATE', 'YELLOW'];
  for (var i = 0; i < keys.length; i++) {
    var id = ids[keys[i]];
    if (!id) {
      console.log(keys[i] + ': not built yet — run buildAllForms first');
      continue;
    }
    var form = FormApp.openById(id);
    console.log(keys[i] + '  student URL : ' + form.getPublishedUrl());
    console.log(keys[i] + '  edit URL    : ' + form.getEditUrl());
  }
}

// ─── Private: Form builders ────────────────────────────────────────────────

/**
 * Builds the Pink Sheet (excused absence request) form.
 *
 * Questions:
 *   1. Your Full Name      — LIST  (roster)
 *   2. Ensemble            — LIST  (FORM_CONFIG.ENSEMBLE_CHOICES)
 *   3. Your Section        — LIST  (SECTION_TABS)
 *   4. Date of Absence     — DATE
 *   5. Reason              — PARAGRAPH
 *
 * @param {string[]} allNames  Sorted active-member full names.
 * @returns {GoogleAppsScript.Forms.Form}
 */
function _buildPinkForm(allNames) {
  var form = FormApp.create('KSUMB Pink Sheet Request');
  form.setDescription(
    'Use this form to request an excused absence from a KSUMB rehearsal or event. ' +
      'Submissions are reviewed by staff before taking effect.'
  );
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);

  var nameItem = form.addListItem();
  nameItem.setTitle('Your Full Name').setRequired(true);
  if (allNames.length > 0) nameItem.setChoiceValues(allNames);

  var ensembleItem = form.addListItem();
  ensembleItem.setTitle('Ensemble').setRequired(true);
  ensembleItem.setChoiceValues(FORM_CONFIG.ENSEMBLE_CHOICES);

  var sectionItem = form.addListItem();
  sectionItem.setTitle('Your Section').setRequired(true);
  sectionItem.setChoiceValues(SECTION_TABS);

  var dateItem = form.addDateItem();
  dateItem.setTitle('Date of Absence').setRequired(true);

  var reasonItem = form.addParagraphTextItem();
  reasonItem.setTitle('Reason').setRequired(true);

  return form;
}

/**
 * Builds the Late Check-In form.
 *
 * Structure:
 *   Page 1  — "What is your section?" (MULTIPLE_CHOICE, routes to section page)
 *   Per section page:
 *     • PAGE_BREAK  — "SectionName — Select Your Name"
 *     • Your Name   — LIST  (section-filtered roster)
 *     • Reason for late arrival — MULTIPLE_CHOICE (FORM_CONFIG.LATE_REASONS)
 *     • If "Other", please explain: — TEXT (optional)
 *
 * Arrival time is derived from the form submission timestamp (no separate question
 * needed — students submit this form when they arrive at rehearsal).
 *
 * @param {Object.<string, string[]>} namesBySection  Names grouped by section, sorted.
 * @returns {GoogleAppsScript.Forms.Form}
 */
function _buildLateForm(namesBySection) {
  var form = FormApp.create('KSUMB Late Check-In');
  form.setDescription('Arrived late to rehearsal? Submit this form immediately upon arrival.');
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);

  // First question — section picker; choices will be set after pages are created
  var sectionQuestion = form.addMultipleChoiceItem();
  sectionQuestion.setTitle('What is your section?').setRequired(true);

  // Create one page per section, collect page references for routing
  var sectionPages = {};
  for (var t = 0; t < SECTION_TABS.length; t++) {
    var section = SECTION_TABS[t];

    var page = form.addPageBreakItem();
    page.setTitle(section + ' \u2014 Select Your Name'); // em dash matches inspectFormQuestions output

    var nameItem = form.addListItem();
    nameItem.setTitle('Your Name').setRequired(true);
    var sectionNames = namesBySection[section] || [];
    nameItem.setChoiceValues(sectionNames.length > 0 ? sectionNames : ['(no members)']);

    var reasonItem = form.addMultipleChoiceItem();
    reasonItem.setTitle('Reason for late arrival').setRequired(true);
    reasonItem.setChoiceValues(FORM_CONFIG.LATE_REASONS);

    var otherItem = form.addTextItem();
    otherItem.setTitle('If \u201cOther\u201d, please explain:'); // curly quotes

    sectionPages[section] = page;
  }

  // Wire routing: each section choice navigates to that section's page
  var choices = [];
  for (var s = 0; s < SECTION_TABS.length; s++) {
    choices.push(sectionQuestion.createChoice(SECTION_TABS[s], sectionPages[SECTION_TABS[s]]));
  }
  sectionQuestion.setChoices(choices);

  return form;
}

/**
 * Builds the Yellow Sheet (semester class conflict) form.
 *
 * Questions:
 *   1. Your Full Name        — LIST      (roster)
 *   2. Ensemble              — LIST      (FORM_CONFIG.ENSEMBLE_CHOICES)
 *   3. Your Section          — LIST      (SECTION_TABS)
 *   4. Conflict Days         — CHECKBOX  (FORM_CONFIG.CONFLICT_DAYS)
 *   5. Conflict Start Time   — TIME
 *   6. Conflict End Time     — TIME
 *   7. Notes                 — PARAGRAPH (optional)
 *
 * @param {string[]} allNames  Sorted active-member full names.
 * @returns {GoogleAppsScript.Forms.Form}
 */
function _buildYellowForm(allNames) {
  var form = FormApp.create('KSUMB Yellow Sheet (Class Conflict)');
  form.setDescription(
    'Use this form to report a recurring class conflict with KSUMB rehearsal. ' +
      'This is for semester-long conflicts only — not individual absences (use the Pink Sheet for those).'
  );
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);

  var nameItem = form.addListItem();
  nameItem.setTitle('Your Full Name').setRequired(true);
  if (allNames.length > 0) nameItem.setChoiceValues(allNames);

  var ensembleItem = form.addListItem();
  ensembleItem.setTitle('Ensemble').setRequired(true);
  ensembleItem.setChoiceValues(FORM_CONFIG.ENSEMBLE_CHOICES);

  var sectionItem = form.addListItem();
  sectionItem.setTitle('Your Section').setRequired(true);
  sectionItem.setChoiceValues(SECTION_TABS);

  var daysItem = form.addCheckboxItem();
  daysItem.setTitle('Conflict Days').setRequired(true);
  daysItem.setChoiceValues(FORM_CONFIG.CONFLICT_DAYS);

  var startItem = form.addTimeItem();
  startItem.setTitle('Conflict Start Time').setRequired(true);

  var endItem = form.addTimeItem();
  endItem.setTitle('Conflict End Time').setRequired(true);

  var notesItem = form.addParagraphTextItem();
  notesItem.setTitle('Notes'); // optional

  return form;
}

// ─── Private: Helpers ──────────────────────────────────────────────────────

/**
 * Reads the Database tab and returns all member names for form population.
 * Includes every row that has a non-empty Full Name — no status filtering.
 * Deduplicates names within each list to satisfy Google Forms' requirement
 * that choice values be unique within a single question.
 * @returns {{ allNames: string[], namesBySection: Object.<string, string[]> }}
 */
function _getRosterData() {
  var data = getTableData('Database');
  if (data.length < 2) {
    console.warn('_getRosterData: Database tab is empty or has no data rows.');
    return { allNames: [], namesBySection: {} };
  }

  var headers = data[0];
  var colFullName = headers.indexOf('Full Name');
  var colSection = headers.indexOf('Section');

  if (colFullName === -1 || colSection === -1) {
    throw new Error(
      'Database tab missing "Full Name" or "Section" column. Found: ' + JSON.stringify(headers),
    );
  }

  var seenNames = {};
  var allNames = [];
  var namesBySection = {};

  for (var i = 1; i < data.length; i++) {
    var fullName = String(data[i][colFullName]).trim();
    var section = String(data[i][colSection]).trim();
    if (!fullName) continue;

    // Deduplicate across all names (prevents "duplicate choice values" error)
    if (seenNames[fullName]) {
      console.warn('_getRosterData: duplicate name skipped — "' + fullName + '"');
      continue;
    }
    seenNames[fullName] = true;
    allNames.push(fullName);

    if (!namesBySection[section]) namesBySection[section] = [];
    namesBySection[section].push(fullName);
  }

  allNames.sort();
  var sections = Object.keys(namesBySection);
  for (var s = 0; s < sections.length; s++) {
    namesBySection[sections[s]].sort();
  }

  console.log('_getRosterData: loaded ' + allNames.length + ' member(s) from Database.');
  return { allNames: allNames, namesBySection: namesBySection };
}

/**
 * Diagnostic: logs the raw Database tab headers and first 5 rows to the console.
 * Run from the Apps Script editor to verify what _getRosterData sees.
 */
function inspectDatabase() {
  var data = getTableData('Database');
  console.log('Row count (including header): ' + data.length);
  if (data.length === 0) { console.log('Database tab is completely empty.'); return; }
  console.log('Headers: ' + JSON.stringify(data[0]));
  var preview = Math.min(data.length, 6);
  for (var i = 1; i < preview; i++) {
    console.log('Row ' + i + ': ' + JSON.stringify(data[i]));
  }
}

/**
 * Returns stored form IDs from Script Properties.
 * @returns {{ PINK: string, LATE: string, YELLOW: string }}
 */
function _getStoredFormIds() {
  var props = PropertiesService.getScriptProperties();
  return {
    PINK: props.getProperty(_PROP_PINK) || '',
    LATE: props.getProperty(_PROP_LATE) || '',
    YELLOW: props.getProperty(_PROP_YELLOW) || '',
  };
}

/**
 * Moves a form to Drive trash. Silently skips blank or invalid IDs.
 * @param {string} formId
 */
function _trashForm(formId) {
  if (!formId) return;
  try {
    DriveApp.getFileById(formId).setTrashed(true);
    console.log('FormBuilder: trashed ' + formId);
  } catch (err) {
    console.warn('FormBuilder: could not trash ' + formId + ' — ' + err.message);
  }
}
