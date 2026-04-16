/** @OnlyCurrentDoc */

/**
 * Runs when the spreadsheet is opened. Registers the Attendance custom menu.
 * @param {GoogleAppsScript.Events.SheetsOnOpen} e - The onOpen event object.
 */
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu('Attendance')
    .addItem('Settings', 'openSettingsDialog')
    .addItem('Validate environment', 'validateEnvironment')
    .addItem('Initialize system', 'initializeSystem')
    .addSeparator()
    .addItem('Add rehearsal date', 'addRehearsalDate')
    .addItem('Delete rehearsal date', 'openDeleteDateDialog')
    .addSeparator()
    .addItem('Build / rebuild forms', 'buildAllForms')
    .addItem('Roster sync', 'syncRosterFromDatabase')
    .addItem('Sync roster names to forms', 'syncRosterToForms')
    .addSeparator()
    .addItem('Clear attendance history', 'clearAttendanceHistory')
    .addItem('New year setup', 'newYearSetup')
    .addSeparator()
    .addItem('Process approved requests', 'processApprovedRequests')
    .addItem('Generate concern list', 'generateConcernList')
    .addToUi();
}

/**
 * Runs when a user edits the spreadsheet directly.
 * Processes Yellow Sheet and Pink Sheet approvals/denials as soon as staff
 * change the Status cell.
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 */
function onEdit(e) {
  if (!e || !e.range) return;

  var range = e.range;
  var sheet = range.getSheet();
  if (!sheet) return;

  var sheetName = sheet.getName();
  if (sheetName !== 'Yellow Sheets' && sheetName !== 'Pink Sheets') return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var statusColumn = headers.indexOf('Status') + 1;
  if (statusColumn <= 0) return;

  if (
    !shouldProcessQueueStatusEdit(
      sheetName,
      sheetName,
      range.getRow(),
      range.getColumn(),
      statusColumn,
      range.getValue(),
      getStatusValue('APPROVED'),
      getStatusValue('DENIED')
    )
  ) {
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (sheetName === 'Yellow Sheets') {
    processYellowSheetActions(ss);
  } else {
    processPinkSheetActions(ss);
  }
}
