/** @OnlyCurrentDoc */

// ---------------------------------------------------------------------------
// Roster -> Form sync
// ---------------------------------------------------------------------------

/**
 * Pushes active member names from the Database tab into all three forms.
 *
 * Pink / Yellow update "Your Full Name" and "Your Section" list questions.
 * Late updates each section page's "Your Name" list with that section's
 * members only.
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
  var sectionTabs = getConfiguredSectionTabs();
  var updatedQuestions = 0;

  var simpleIds = [ids.PINK, ids.YELLOW];
  for (var f = 0; f < simpleIds.length; f++) {
    if (!simpleIds[f]) continue;
    var form = FormApp.openById(simpleIds[f]);
    var items = form.getItems();

    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var title = item.getTitle();
      var type = item.getType();

      if (title === 'Your Full Name' && type === FormApp.ItemType.LIST && allNames.length > 0) {
        item.asListItem().setChoiceValues(allNames);
        updatedQuestions++;
      }

      if (title === 'Your Section' && type === FormApp.ItemType.LIST) {
        item.asListItem().setChoiceValues(sectionTabs);
        updatedQuestions++;
      }
    }
  }

  if (ids.LATE) {
    var lateForm = FormApp.openById(ids.LATE);
    var lateItems = lateForm.getItems();
    var currentSection = null;

    for (var k = 0; k < lateItems.length; k++) {
      var lateItem = lateItems[k];
      var lateType = lateItem.getType();
      var lateTitle = lateItem.getTitle();

      if (lateType === FormApp.ItemType.PAGE_BREAK) {
        var match = lateTitle.match(/^(.+?)\s+[\u2014\u2013-]\s+Select Your Name/i);
        currentSection = match ? match[1].trim() : null;
        continue;
      }

      if (lateType === FormApp.ItemType.LIST && lateTitle === 'Your Name' && currentSection) {
        var sectionNames = namesBySection[currentSection] || [];
        lateItem.asListItem().setChoiceValues(sectionNames.length > 0 ? sectionNames : ['(no members)']);
        updatedQuestions++;
        currentSection = null;
      }
    }
  }

  var msg = 'Synced ' + allNames.length + ' member(s) across ' + updatedQuestions + ' form question(s).';
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Sync Forms');
  console.log('FormSync: ' + msg);
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
  try {
    var fields = _responseToFields(e.response);
    var submissionId = generateSubmissionId();
    var submittedAt = e.response.getTimestamp();
    var name = _field(fields, 'Your Full Name');
    var section = _field(fields, 'Your Section');
    var date = _field(fields, 'Date of Absence');
    var reason = _field(fields, 'Reason');

    getSheet('Pink Sheets').appendRow([
      submissionId,
      submittedAt,
      name,
      section,
      date,
      reason,
      getStatusValue('PENDING'),
      '',
      '',
    ]);
    console.log('FormSync: Pink -> ' + name + ' | ' + section + ' | ' + date);
  } catch (err) {
    console.error('FormSync: onPinkSubmit error -> ' + err.message);
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
      name: _field(fields, 'Your Name'),
      section: _field(fields, 'What is your section?'),
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
      name: _field(fields, 'Your Full Name'),
      section: _field(fields, 'Your Section'),
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
