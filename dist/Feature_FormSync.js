/** @OnlyCurrentDoc */

// ---------------------------------------------------------------------------
// Roster -> Form sync
// ---------------------------------------------------------------------------

/**
 * Pushes active member names from the Database tab into all three forms.
 *
 * All forms use a section-router first page plus per-section name lists.
 */
function syncRosterToForms() {
  var ids = _getStoredFormIds();
  if (!ids.PINK && !ids.LATE && !ids.YELLOW) {
    SpreadsheetApp.getUi().alert(
      'No Forms Found',
      'No forms have been built yet. Use Attendance -> "Build / rebuild forms" first.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  var roster = _getRosterData();
  var allNames = roster.allNames;
  var namesBySection = roster.namesBySection;
  var ignoredCount = roster.ignoredCount || 0;
  var updatedQuestions = 0;

  var formIds = [ids.PINK, ids.LATE, ids.YELLOW];
  for (var f = 0; f < formIds.length; f++) {
    if (!formIds[f]) continue;
    updatedQuestions += _syncFormSectionNameLists(FormApp.openById(formIds[f]), namesBySection);
  }

  var msg =
    'Synced ' +
    allNames.length +
    ' member(s) across ' +
    updatedQuestions +
    ' form question(s). Ignored ' +
    ignoredCount +
    ' row(s).';
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Sync Forms');
  console.log('FormSync: ' + msg);
  return { synced: allNames.length, questions: updatedQuestions, ignored: ignoredCount };
}

// ---------------------------------------------------------------------------
// Trigger management
// ---------------------------------------------------------------------------

/**
 * Installs one onFormSubmit trigger per form.
 */
function installFormSubmitTriggers() {
  var ids = _getStoredFormIds();

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  var installed = 0;
  if (ids.PINK) {
    ScriptApp.newTrigger('onPinkSubmit').forForm(ids.PINK).onFormSubmit().create();
    installed++;
  }
  if (ids.LATE) {
    ScriptApp.newTrigger('onLateSubmit').forForm(ids.LATE).onFormSubmit().create();
    installed++;
  }
  if (ids.YELLOW) {
    ScriptApp.newTrigger('onYellowSubmit').forForm(ids.YELLOW).onFormSubmit().create();
    installed++;
  }

  console.log('FormSync: installed ' + installed + ' form submit trigger(s).');
}

// ---------------------------------------------------------------------------
// Per-form submit handlers
// ---------------------------------------------------------------------------

/**
 * Fires when a Pink Sheet form is submitted.
 *
 * @param {GoogleAppsScript.Events.FormsOnFormSubmit} e
 */
function onPinkSubmit(e) {
  var pinkSheetInfo = null;

  try {
    var fields = _responseToFields(e.response);
    var submissionId = generateSubmissionId();
    var submittedAt = e.response.getTimestamp();
    var name = requireResolvedSubmittedName(_field(fields, FORM_NAME_LIST_TITLE), _field(fields, FORM_MANUAL_NAME_TITLE));
    var section = _field(fields, FORM_SECTION_QUESTION_TITLE);
    var rawDate = _field(fields, 'Date of Absence');
    var parsedDate = rawDate ? new Date(rawDate) : '';
    var date = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : rawDate;
    var reason = _field(fields, 'Reason');
    var pinkSheet = getSheet('Pink Sheets');
    var headerMap = getPinkSheetHeaderMap(pinkSheet.getRange(1, 1, 1, pinkSheet.getLastColumn()).getValues()[0]);

    pinkSheet.appendRow([
      submissionId,
      submittedAt,
      name,
      section,
      date,
      reason,
      getStatusValue('PENDING'),
      '',
      '',
      '',
      '',
    ]);
    pinkSheetInfo = {
      sheet: pinkSheet,
      headerMap: headerMap,
      rowIndex: pinkSheet.getLastRow(),
    };
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var outcome = processSinglePinkSheet(SpreadsheetApp.getActiveSpreadsheet(), {
        submissionId: submissionId,
        submittedAt: submittedAt,
        name: name,
        section: section,
        date: date,
        status: getStatusValue('PENDING'),
      });
      writePinkSheetOutcome(pinkSheetInfo.sheet, pinkSheetInfo.headerMap, pinkSheetInfo.rowIndex, outcome);
      SpreadsheetApp.flush();
    } finally {
      SpreadsheetApp.flush();
      lock.releaseLock();
    }

    console.log('FormSync: Pink -> ' + name + ' | ' + section + ' | ' + date);
  } catch (err) {
    console.error('FormSync: onPinkSubmit error -> ' + err.message);
    if (pinkSheetInfo) {
      writePinkSheetOutcome(pinkSheetInfo.sheet, pinkSheetInfo.headerMap, pinkSheetInfo.rowIndex, {
        statusValue: getStatusValue('PENDING'),
        processedAt: '',
        errorMessage: err.message,
      });
    }
    logSystemEvent('FormSync', 'onPinkSubmit', 'ERROR', '', err.message);
  }
}

/**
 * Fires when a Late Check-In form is submitted.
 *
 * @param {GoogleAppsScript.Events.FormsOnFormSubmit} e
 */
function onLateSubmit(e) {
  var lateSheetInfo = null;

  try {
    var fields = _responseToFields(e.response);
    var submissionId = generateSubmissionId();
    var submittedAt = e.response.getTimestamp();
    var payload = {
      submissionId: submissionId,
      submittedAt: submittedAt,
      name: requireResolvedSubmittedName(_field(fields, FORM_NAME_LIST_TITLE), _field(fields, FORM_MANUAL_NAME_TITLE)),
      section: _field(fields, FORM_SECTION_QUESTION_TITLE),
      arrival: submittedAt,
      reason: _field(fields, 'Reason for late arrival'),
      otherExplanation: _field(fields, 'If "Other", please explain:') || _field(fields, 'If “Other”, please explain:'),
    };

    lateSheetInfo = appendLateCheckInQueueRow(payload);

    var lock = acquireLateCheckInLock();
    try {
      var outcome = processSingleLateCheckIn(SpreadsheetApp.getActiveSpreadsheet(), payload);
      writeLateCheckInOutcome(lateSheetInfo.sheet, lateSheetInfo.headerMap, lateSheetInfo.rowIndex, outcome);
      SpreadsheetApp.flush();
    } finally {
      SpreadsheetApp.flush();
      lock.releaseLock();
    }

    console.log('FormSync: Late -> ' + payload.name + ' | ' + payload.section + ' | ' + payload.arrival);
  } catch (err) {
    console.error('FormSync: onLateSubmit error -> ' + err.message);
    if (lateSheetInfo) {
      writeLateCheckInOutcome(lateSheetInfo.sheet, lateSheetInfo.headerMap, lateSheetInfo.rowIndex, {
        statusValue: getStatusValue('PENDING'),
        processedAt: '',
        errorMessage: err.message,
      });
    }
    logSystemEvent('FormSync', 'onLateSubmit', 'ERROR', '', err.message);
  }
}

/**
 * Fires when a Yellow Sheet form is submitted.
 *
 * @param {GoogleAppsScript.Events.FormsOnFormSubmit} e
 */
function onYellowSubmit(e) {
  try {
    var fields = _responseToFields(e.response);
    var payload = {
      submissionId: generateSubmissionId(),
      responseId: e.response.getId(),
      submittedAt: e.response.getTimestamp(),
      lastUpdatedAt: e.response.getTimestamp(),
      name: requireResolvedSubmittedName(_field(fields, FORM_NAME_LIST_TITLE), _field(fields, FORM_MANUAL_NAME_TITLE)),
      section: _field(fields, FORM_SECTION_QUESTION_TITLE),
      days: _field(fields, 'Conflict Days'),
      startTime: _field(fields, 'Conflict Start Time'),
      endTime: _field(fields, 'Conflict End Time'),
      notes: _field(fields, 'Notes'),
    };

    upsertYellowSheetSubmission(payload);
    console.log('FormSync: Yellow -> ' + payload.name + ' | ' + payload.section + ' | ' + payload.days);
  } catch (err) {
    console.error('FormSync: onYellowSubmit error -> ' + err.message);
    logSystemEvent('FormSync', 'onYellowSubmit', 'ERROR', '', err.message);
  }
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * Logs question titles and types for all built forms.
 */
function inspectFormQuestions() {
  var ids = _getStoredFormIds();
  var keys = ['PINK', 'LATE', 'YELLOW'];
  for (var k = 0; k < keys.length; k++) {
    var id = ids[keys[k]];
    if (!id) {
      console.log('=== ' + keys[k] + ': not built ===');
      continue;
    }
    var form = FormApp.openById(id);
    var items = form.getItems();
    console.log('=== ' + keys[k] + ' FORM: ' + form.getTitle() + ' ===');
    for (var i = 0; i < items.length; i++) {
      console.log('  [' + i + '] type=' + items[i].getType() + '  title="' + items[i].getTitle() + '"');
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Converts a FormResponse into a namedValues-style map.
 *
 * @param {GoogleAppsScript.Forms.FormResponse} response
 * @returns {Object.<string, string[]>}
 */
function _responseToFields(response) {
  var fields = {};
  var itemResponses = response.getItemResponses();
  for (var i = 0; i < itemResponses.length; i++) {
    var ir = itemResponses[i];
    var title = ir.getItem().getTitle();
    var value = ir.getResponse();

    if (Array.isArray(value)) {
      value = value.join(', ');
    }

    if (!fields[title]) fields[title] = [];
    fields[title].push(String(value));
  }
  return fields;
}

/**
 * Returns the first non-empty field value for a given title.
 *
 * @param {Object.<string, string[]>} fields
 * @param {string} key
 * @returns {string}
 */
function _field(fields, key) {
  if (!fields[key]) return '';
  var values = fields[key];
  for (var i = 0; i < values.length; i++) {
    var value = String(values[i]).trim();
    if (value) return value;
  }
  return '';
}

/**
 * Generates a queue-safe submission identifier.
 *
 * @returns {string}
 */
function generateSubmissionId() {
  return Utilities.getUuid();
}

function _syncFormSectionNameLists(form, namesBySection) {
  var items = form.getItems();
  var currentSection = '';
  var updatedQuestions = 0;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var type = item.getType();
    var title = item.getTitle();

    if (type === FormApp.ItemType.PAGE_BREAK) {
      currentSection = extractSectionFromPageTitle(title);
      continue;
    }

    if (type === FormApp.ItemType.LIST && title === FORM_NAME_LIST_TITLE && currentSection) {
      var sectionNames = namesBySection[currentSection] || [];
      item.asListItem().setChoiceValues(sectionNames.length > 0 ? sectionNames : ['(no members)']);
      updatedQuestions++;
      currentSection = '';
    }
  }

  return updatedQuestions;
}
