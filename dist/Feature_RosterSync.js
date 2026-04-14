/** @OnlyCurrentDoc */

/**
 * Reads the Database tab and returns active members grouped by section.
 *
 * @returns {Object.<string, string[]>}
 */
function getDatabaseRosterBySection() {
  var data = getTableData('Database');
  if (data.length < 2) {
    return {};
  }

  var headers = data[0];
  var colFullName = headers.indexOf('Full Name');
  var colSection = headers.indexOf('Section');
  var colActive = headers.indexOf('Active');

  if (colFullName === -1 || colSection === -1 || colActive === -1) {
    throw new Error('Database tab must contain Full Name, Section, and Active columns.');
  }

  var members = [];
  for (var i = 1; i < data.length; i++) {
    members.push({
      fullName: data[i][colFullName],
      section: data[i][colSection],
      active: data[i][colActive],
    });
  }

  return groupActiveRosterMembersBySection(members);
}

/**
 * Collects existing section rows and notes by student name so attendance
 * history can move with the student during roster sync.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {Object.<string, {values: Array, notes: Array}>}
 */
function collectExistingSectionRecords(ss) {
  var records = {};
  var sectionTabs = getConfiguredSectionTabs();

  for (var i = 0; i < sectionTabs.length; i++) {
    var sheet = ss.getSheetByName(sectionTabs[i]);
    if (!sheet) continue;

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) continue;

    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var notes = sheet.getRange(2, 1, lastRow - 1, lastCol).getNotes();
    for (var r = 0; r < values.length; r++) {
      var fullName = String(values[r][0] || '').trim();
      if (!fullName) continue;
      records[fullName] = {
        values: values[r].slice(),
        notes: notes[r].slice(),
      };
    }
  }

  return records;
}

/**
 * Builds the new values/notes arrays for a section tab.
 *
 * @param {string[]} memberNames
 * @param {number} columnCount
 * @param {Object.<string, {values: Array, notes: Array}>} existingRecords
 * @returns {{values: Array[], notes: Array[]}}
 */
function buildSectionSyncRows(memberNames, columnCount, existingRecords) {
  var rows = [];
  var notes = [];

  for (var i = 0; i < memberNames.length; i++) {
    var fullName = memberNames[i];
    var valuesRow = [];
    var notesRow = [];
    for (var c = 0; c < columnCount; c++) {
      valuesRow.push('');
      notesRow.push('');
    }

    valuesRow[0] = fullName;
    var existing = existingRecords[fullName];
    if (existing) {
      for (var j = 0; j < Math.min(existing.values.length, columnCount); j++) {
        valuesRow[j] = existing.values[j];
      }
      valuesRow[0] = fullName;
      for (var k = 0; k < Math.min(existing.notes.length, columnCount); k++) {
        notesRow[k] = existing.notes[k];
      }
    }

    rows.push(valuesRow);
    notes.push(notesRow);
  }

  return { values: rows, notes: notes };
}

/**
 * Synchronizes section tabs from the Database roster, preserving attendance
 * values and notes for existing members.
 */
function syncRosterFromDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rosterBySection = getDatabaseRosterBySection();
  var existingRecords = collectExistingSectionRecords(ss);
  var sectionTabs = getConfiguredSectionTabs();
  var lock = LockService.getScriptLock();
  var summary = [];

  lock.waitLock(30000);
  try {
    for (var i = 0; i < sectionTabs.length; i++) {
      var sectionName = sectionTabs[i];
      var sheet = ss.getSheetByName(sectionName);
      if (!sheet) continue;

      var lastCol = Math.max(sheet.getLastColumn(), 1);
      var memberNames = rosterBySection[sectionName] || [];
      var sectionRows = buildSectionSyncRows(memberNames, lastCol, existingRecords);
      var existingDataRowCount = Math.max(sheet.getLastRow() - 1, 0);

      if (existingDataRowCount > 0) {
        sheet.getRange(2, 1, existingDataRowCount, lastCol).clearContent().clearNote();
      }

      if (sectionRows.values.length > 0) {
        sheet.getRange(2, 1, sectionRows.values.length, lastCol).setValues(sectionRows.values);
        sheet.getRange(2, 1, sectionRows.notes.length, lastCol).setNotes(sectionRows.notes);
      }

      summary.push(sectionName + ': ' + memberNames.length + ' member(s)');
    }

    SpreadsheetApp.flush();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }

  syncRosterToForms();
  logSystemEvent('RosterSync', 'syncRosterFromDatabase', 'INFO', '', 'Roster sync completed.');
  SpreadsheetApp.getUi().alert('Roster Sync', summary.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}
