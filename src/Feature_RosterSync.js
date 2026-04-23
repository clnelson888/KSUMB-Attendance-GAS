/** @OnlyCurrentDoc */

/**
 * Reads the Database tab and returns active members grouped by section,
 * plus a count of rows ignored (inactive, blank, or duplicate).
 *
 * @returns {{ bySection: Object.<string, string[]>, ignoredCount: number }}
 */
function getDatabaseRosterBySection() {
  var data = getTableData('Database', {
    namedRange: 'DATABASE_ROSTER',
    expectedHeaders: ['Full Name', 'Section'],
  });
  if (data.length < 2) {
    return { bySection: {}, ignoredCount: 0 };
  }

  var headers = data[0];
  var colFullName = headers.indexOf('Full Name');
  var colSection = headers.indexOf('Section');
  // Accept either "Status" (current DB schema) or legacy "Active"
  var colActive = headers.indexOf('Status') !== -1 ? headers.indexOf('Status') : headers.indexOf('Active');

  if (colFullName === -1 || colSection === -1) {
    throw new Error(
      'Database tab missing columns. Expected: Full Name, Section. Got: ' + JSON.stringify(headers)
    );
  }

  var members = [];
  var totalRows = 0;
  for (var i = 1; i < data.length; i++) {
    var fullName = String(data[i][colFullName] || '').trim();
    var section = String(data[i][colSection] || '').trim();
    if (!fullName && !section) continue;
    totalRows++;
    members.push({
      fullName: fullName,
      section: section,
      active: colActive !== -1 ? data[i][colActive] : true,
    });
  }

  var bySection = groupActiveRosterMembersBySection(members);
  var kept = 0;
  var sectionKeys = Object.keys(bySection);
  for (var s = 0; s < sectionKeys.length; s++) kept += bySection[sectionKeys[s]].length;

  return { bySection: bySection, ignoredCount: Math.max(totalRows - kept, 0) };
}

/**
 * Collects existing section rows and notes keyed by "section||fullName" so
 * attendance history moves with the student during roster sync even when
 * the same name appears in multiple sections.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {Object.<string, {values: Array, notes: Array}>}
 */
function collectExistingSectionRecords(ss) {
  var records = {};
  var sectionTabs = getConfiguredSectionTabs();

  for (var i = 0; i < sectionTabs.length; i++) {
    var sectionName = sectionTabs[i];
    var sheet = ss.getSheetByName(sectionName);
    if (!sheet) continue;

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) continue;

    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var notes = sheet.getRange(2, 1, lastRow - 1, lastCol).getNotes();
    for (var r = 0; r < values.length; r++) {
      var fullName = String(values[r][0] || '').trim();
      if (!fullName) continue;
      records[sectionName + '||' + fullName] = {
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
 * @param {string} sectionName
 * @param {string[]} memberNames
 * @param {number} columnCount
 * @param {Object.<string, {values: Array, notes: Array}>} existingRecords
 * @returns {{values: Array[], notes: Array[], kept: number, added: number}}
 */
function buildSectionSyncRows(sectionName, memberNames, columnCount, existingRecords) {
  var rows = [];
  var notes = [];
  var kept = 0;
  var added = 0;

  for (var i = 0; i < memberNames.length; i++) {
    var fullName = memberNames[i];
    var valuesRow = [];
    var notesRow = [];
    for (var c = 0; c < columnCount; c++) {
      valuesRow.push('');
      notesRow.push('');
    }

    valuesRow[0] = fullName;
    var existing = existingRecords[sectionName + '||' + fullName];
    if (existing) {
      for (var j = 0; j < Math.min(existing.values.length, columnCount); j++) {
        valuesRow[j] = existing.values[j];
      }
      valuesRow[0] = fullName;
      for (var k = 0; k < Math.min(existing.notes.length, columnCount); k++) {
        notesRow[k] = existing.notes[k];
      }
      kept++;
    } else {
      added++;
    }

    rows.push(valuesRow);
    notes.push(notesRow);
  }

  return { values: rows, notes: notes, kept: kept, added: added };
}

/**
 * Counts names present on a section tab before sync that are not in the
 * new member list (i.e. were removed by this sync).
 *
 * @param {string} sectionName
 * @param {string[]} memberNames
 * @param {Object.<string, {values: Array, notes: Array}>} existingRecords
 * @returns {number}
 */
function countRemovedFromSection(sectionName, memberNames, existingRecords) {
  var memberSet = {};
  for (var i = 0; i < memberNames.length; i++) memberSet[memberNames[i]] = true;

  var prefix = sectionName + '||';
  var removed = 0;
  var keys = Object.keys(existingRecords);
  for (var k = 0; k < keys.length; k++) {
    if (keys[k].indexOf(prefix) !== 0) continue;
    var priorName = keys[k].slice(prefix.length);
    if (!memberSet[priorName]) removed++;
  }
  return removed;
}

/**
 * Synchronizes section tabs from the Database roster, preserving attendance
 * values and notes for existing members.
 */
function syncRosterFromDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var roster = getDatabaseRosterBySection();
  var rosterBySection = roster.bySection;
  var existingRecords = collectExistingSectionRecords(ss);
  var sectionTabs = getConfiguredSectionTabs();
  var lock = LockService.getScriptLock();
  var perSection = [];
  var totals = { added: 0, updated: 0, deleted: 0, ignored: roster.ignoredCount };

  lock.waitLock(30000);
  try {
    for (var i = 0; i < sectionTabs.length; i++) {
      var sectionName = sectionTabs[i];
      var sheet = ss.getSheetByName(sectionName);
      if (!sheet) continue;

      var lastCol = Math.max(sheet.getLastColumn(), 1);
      var memberNames = rosterBySection[sectionName] || [];
      var sectionRows = buildSectionSyncRows(sectionName, memberNames, lastCol, existingRecords);
      var removed = countRemovedFromSection(sectionName, memberNames, existingRecords);
      var existingDataRowCount = Math.max(sheet.getLastRow() - 1, 0);

      if (existingDataRowCount > 0) {
        sheet.getRange(2, 1, existingDataRowCount, lastCol).clearContent().clearNote();
      }

      if (sectionRows.values.length > 0) {
        sheet.getRange(2, 1, sectionRows.values.length, lastCol).setValues(sectionRows.values);
        sheet.getRange(2, 1, sectionRows.notes.length, lastCol).setNotes(sectionRows.notes);
      }

      totals.added += sectionRows.added;
      totals.updated += sectionRows.kept;
      totals.deleted += removed;

      perSection.push(
        sectionName +
          ': ' +
          memberNames.length +
          ' member(s) (+' +
          sectionRows.added +
          ', -' +
          removed +
          ', ' +
          sectionRows.kept +
          ' kept)'
      );
    }

    SpreadsheetApp.flush();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }

  syncRosterToForms();

  var headline =
    'Roster sync: +' +
    totals.added +
    ' added, -' +
    totals.deleted +
    ' removed, ' +
    totals.updated +
    ' kept, ' +
    totals.ignored +
    ' ignored.';

  logSystemEvent('RosterSync', 'syncRosterFromDatabase', 'INFO', '', headline);
  SpreadsheetApp.getActiveSpreadsheet().toast(headline, 'Roster Sync');
  SpreadsheetApp
    .getUi()
    .alert('Roster Sync', headline + '\n\n' + perSection.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);

  return totals;
}
