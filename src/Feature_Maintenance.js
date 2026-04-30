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
 * Full destructive reset: clears all attendance history, queue logs, Yellow
 * Sheet notes, and member names from every section tab. Each section tab is
 * left with the header row and a single placeholder name row so that
 * per-cell data validation on column A is preserved.
 *
 * Prompts for confirmation before running — this cannot be undone.
 */
function systemReset() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.alert(
    '⚠️ System Reset — Are you sure?',
    'This will permanently clear:\n' +
      '  • All member names from every section tab\n' +
      '  • All rehearsal date columns from every section tab\n' +
      '  • All queue logs (Pink Sheets, Yellow Sheets, Late Check-Ins)\n' +
      '  • All Yellow Sheet notes from section name cells\n\n' +
      'The Database tab is not affected.\n\n' +
      'This cannot be undone. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;

  clearAttendanceHistory();
  clearSectionRoster();

  var queueSheets = ['Pink Sheets', 'Late Check-Ins', 'Yellow Sheets'];
  for (var i = 0; i < queueSheets.length; i++) {
    clearManagedSheetData(queueSheets[i]);
  }

  clearYellowSheetNotesFromSections();
  logSystemEvent('Maintenance', 'systemReset', 'INFO', '', 'System Reset completed.');
  ui.alert(
    'System Reset',
    'Attendance history, member names, queue logs, and Yellow Sheet notes were cleared.\n\nRun Roster & Forms › Sync Roster from Database to repopulate section tabs.',
    ui.ButtonSet.OK
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
 * Clears all member name rows from every section tab, then writes
 * EXAMPLE_MEMBER_NAME into row 2. Extra rows (3+) are physically deleted to
 * match the approach clearAttendanceHistory uses for extra date columns —
 * keeping the sheet tidy while leaving the placeholder row so any data
 * validation on column A survives until roster sync repopulates the tab.
 */
function clearSectionRoster() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sectionTabs = getConfiguredSectionTabs();

  for (var i = 0; i < sectionTabs.length; i++) {
    var sheet = ss.getSheetByName(sectionTabs[i]);
    if (!sheet) continue;

    var lastRow = sheet.getLastRow();

    if (lastRow >= 2) {
      sheet.getRange(2, 1).clearContent().clearNote();
    }
    sheet.getRange(2, 1).setValue(EXAMPLE_MEMBER_NAME);

    // Delete rows beyond the placeholder — mirrors how clearAttendanceHistory
    // deletes extra date columns rather than just clearing their content.
    if (lastRow > 2) {
      sheet.deleteRows(3, lastRow - 2);
    }
  }
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
