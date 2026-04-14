/** @OnlyCurrentDoc */

// ---------------------------------------------------------------------------
// Roster → Form sync
// ---------------------------------------------------------------------------

/**
 * Pushes active member names from the Database tab into all three forms.
 *
 * Pink / Yellow — updates "Your Full Name" and "Your Section" list questions.
 * Late          — updates each section page's "Your Name" list with that
 *                 section's members only (matches page titles like
 *                 "Alto Sax — Select Your Name").
 *
 * Run from: Attendance menu → "Sync roster names to forms"
 */
function syncRosterToForms() {
  var ids = _getStoredFormIds();
  if (!ids.PINK && !ids.LATE && !ids.YELLOW) {
    SpreadsheetApp.getUi().alert(
      'No Forms Found',
      'No forms have been built yet. Use Attendance → "Build / rebuild forms" first.',
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
    return;
  }

  var roster = _getRosterData();
  var allNames = roster.allNames;
  var namesBySection = roster.namesBySection;
  var updatedQuestions = 0;

  // Pink and Yellow: update "Your Full Name" and "Your Section"
  var simpleIds = [ids.PINK, ids.YELLOW];
  for (var f = 0; f < simpleIds.length; f++) {
    if (!simpleIds[f]) continue;
    var form = FormApp.openById(simpleIds[f]);
    var items = form.getItems();
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var title = item.getTitle();
      var type = item.getType();

      if (title === 'Your Full Name' && type === FormApp.ItemType.LIST) {
        if (allNames.length > 0) {
          item.asListItem().setChoiceValues(allNames);
          updatedQuestions++;
        }
      }
      if (title === 'Your Section' && type === FormApp.ItemType.LIST) {
        // Deduplicate SECTION_TABS in case of any accidental duplicates
        var uniqueSections = SECTION_TABS.filter(function (s, idx) {
          return SECTION_TABS.indexOf(s) === idx;
        });
        item.asListItem().setChoiceValues(uniqueSections);
        updatedQuestions++;
      }
    }
  }

  // Late form: update each section's "Your Name" page list
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
        lateItem
          .asListItem()
          .setChoiceValues(sectionNames.length > 0 ? sectionNames : ['(no members)']);
        updatedQuestions++;
        currentSection = null;
      }
    }
  }

  var msg =
    'Synced ' + allNames.length + ' member(s) across ' + updatedQuestions + ' form question(s).';
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Sync Forms');
  console.log('FormSync: ' + msg);
}

// ---------------------------------------------------------------------------
// Trigger management
// ---------------------------------------------------------------------------

/**
 * Installs one onFormSubmit trigger per form (Pink, Late, Yellow).
 * Each trigger calls a dedicated handler, so there is no need to detect which
 * form submitted — each handler knows exactly what to do.
 *
 * Forms are NOT linked to the spreadsheet via setDestination, so no
 * auto-generated "Form Responses" tabs are created. The queue tabs
 * (Pink Sheets, Late Check-Ins, Yellow Sheets) are the sole record.
 *
 * Called automatically at the end of buildAllForms. Safe to re-run:
 * removes all existing form-submit triggers first.
 */
function installFormSubmitTriggers() {
  var ids = _getStoredFormIds();

  // Remove all existing onFormSubmit triggers to avoid duplicates
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
// Called by installable triggers — NOT run directly.
// ---------------------------------------------------------------------------

/**
 * Fires when a Pink Sheet form is submitted.
 * Appends a Pending row to the Pink Sheets queue tab.
 * @param {GoogleAppsScript.Events.FormsOnFormSubmit} e
 */
function onPinkSubmit(e) {
  try {
    var fields = _responseToFields(e.response);
    var name = _field(fields, 'Your Full Name');
    var section = _field(fields, 'Your Section');
    var date = _field(fields, 'Date of Absence');

    getSheet('Pink Sheets').appendRow([name, section, date, 'Pending']);
    console.log('FormSync: Pink — ' + name + ' | ' + section + ' | ' + date);
  } catch (err) {
    console.error('FormSync: onPinkSubmit error — ' + err.message);
  }
}

/**
 * Fires when a Late Check-In form is submitted.
 * Uses the form submission timestamp as the arrival time (students submit on arrival).
 * "Your Name" appears on every section page; _field() returns the first non-empty answer.
 * @param {GoogleAppsScript.Events.FormsOnFormSubmit} e
 */
function onLateSubmit(e) {
  try {
    var fields = _responseToFields(e.response);
    var name = _field(fields, 'Your Name');
    var section = _field(fields, 'What is your section?');
    var arrival = e.response.getTimestamp(); // Date object — Sheets stores as proper date value

    getSheet('Late Check-Ins').appendRow([name, section, arrival, 'Pending']);
    console.log('FormSync: Late — ' + name + ' | ' + section + ' | ' + arrival);
  } catch (err) {
    console.error('FormSync: onLateSubmit error — ' + err.message);
  }
}

/**
 * Fires when a Yellow Sheet form is submitted.
 * Conflict Days is a CHECKBOX question — checked values arrive as an array
 * and are joined into a comma-separated string (e.g., "Monday, Wednesday").
 * @param {GoogleAppsScript.Events.FormsOnFormSubmit} e
 */
function onYellowSubmit(e) {
  try {
    var fields = _responseToFields(e.response);
    var name = _field(fields, 'Your Full Name');
    var section = _field(fields, 'Your Section');
    var days = _field(fields, 'Conflict Days');
    var startTime = _field(fields, 'Conflict Start Time');
    var endTime = _field(fields, 'Conflict End Time');

    getSheet('Yellow Sheets').appendRow([name, section, days, startTime, endTime, 'Pending']);
    console.log('FormSync: Yellow — ' + name + ' | ' + section + ' | ' + days);
  } catch (err) {
    console.error('FormSync: onYellowSubmit error — ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * Logs question titles and types for all built forms.
 * Run from the Apps Script editor after building to verify structure.
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
      console.log(
        '  [' + i + '] type=' + items[i].getType() + '  title="' + items[i].getTitle() + '"',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Converts a FormResponse into a namedValues-style map:
 *   { "Question Title": ["answer", ...], ... }
 *
 * CHECKBOX responses (string arrays) are joined into a single comma-separated
 * string so downstream code handles them uniformly.
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

    // CHECKBOX returns string[] — join to a single comma-separated string
    if (Array.isArray(value)) {
      value = value.join(', ');
    }

    // Collect all values for a title (Late form has duplicate "Your Name" across pages)
    if (!fields[title]) fields[title] = [];
    fields[title].push(String(value));
  }
  return fields;
}

/**
 * Returns the first non-empty value for a field title.
 * Handles the Late form's duplicate "Your Name" questions by skipping blank entries.
 *
 * @param {Object.<string, string[]>} fields
 * @param {string} key
 * @returns {string}
 */
function _field(fields, key) {
  if (!fields[key]) return '';
  var vals = fields[key];
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i]).trim();
    if (v) return v;
  }
  return '';
}
