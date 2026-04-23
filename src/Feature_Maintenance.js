/** @OnlyCurrentDoc */

/**
 * Removes all rehearsal date columns from every configured section tab.
 */
function clearAttendanceHistory() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sectionTabs = getConfiguredSectionTabs();
  var lock = LockService.getScriptLock();
  var cleared = 0;

  lock.waitLock(30000);
  try {
    for (var i = 0; i < sectionTabs.length; i++) {
      var sheet = ss.getSheetByName(sectionTabs[i]);
      if (!sheet) continue;

      var lastCol = sheet.getLastColumn();
      var lastRow = sheet.getLastRow();

      if (lastCol < 2) {
        sheet.getRange(1, 2).setValue(EXAMPLE_DATE_HEADER);
        cleared++;
        continue;
      }

      if (lastCol > 2) {
        sheet.deleteColumns(3, lastCol - 2);
      }

      sheet.getRange(1, 2).setValue(EXAMPLE_DATE_HEADER);
      if (lastRow > 1) {
        sheet.getRange(2, 2, lastRow - 1, 1).clearContent().clearNote();
      }
      cleared++;
    }

    SpreadsheetApp.flush();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }

  logSystemEvent(
    'Maintenance',
    'clearAttendanceHistory',
    'INFO',
    '',
    'Cleared attendance history from ' + cleared + ' section tab(s).'
  );
  SpreadsheetApp.getUi().alert(
    'Clear Attendance History',
    'Cleared attendance history from ' + cleared + ' section tab(s).',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Clears queue logs and section history for a new year while preserving the
 * Database and Data tabs.
 */
function newYearSetup() {
  clearAttendanceHistory();

  var queueSheets = ['Pink Sheets', 'Late Check-Ins', 'Yellow Sheets'];
  for (var i = 0; i < queueSheets.length; i++) {
    clearManagedSheetData(queueSheets[i]);
  }

  clearYellowSheetNotesFromSections();
  logSystemEvent('Maintenance', 'newYearSetup', 'INFO', '', 'Completed New Year Setup.');
  SpreadsheetApp.getUi().alert(
    'New Year Setup',
    'Attendance history, queue logs, and Yellow Sheet notes were cleared.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Clears all data rows from a managed sheet but preserves the header row.
 *
 * @param {string} sheetName
 */
function clearManagedSheetData(sheetName) {
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return;

  sheet
    .getRange(2, 1, lastRow - 1, lastCol)
    .clearContent()
    .clearNote();
}

/**
 * Removes Yellow Sheet notes from section name cells.
 */
function clearYellowSheetNotesFromSections() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sectionTabs = getConfiguredSectionTabs();

  for (var i = 0; i < sectionTabs.length; i++) {
    var sheet = ss.getSheetByName(sectionTabs[i]);
    if (!sheet) continue;

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;

    var noteRange = sheet.getRange(2, 1, lastRow - 1, 1);
    var blankNotes = [];
    for (var r = 0; r < lastRow - 1; r++) {
      blankNotes.push(['']);
    }
    noteRange.setNotes(blankNotes);
  }
}
