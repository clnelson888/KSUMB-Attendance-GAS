/** @OnlyCurrentDoc */

/**
 * Runs when the spreadsheet is opened. Registers the Attendance custom menu.
 * @param {GoogleAppsScript.Events.SheetsOnOpen} e - The onOpen event object.
 */
function onOpen(e) {
  var ui = SpreadsheetApp.getUi();

  var rosterMenu = ui
    .createMenu('📋 Roster & Forms')
    .addItem('Sync roster from database', 'syncRosterFromDatabase')
    .addItem('Sync roster names to forms', 'syncRosterToForms')
    .addItem('Build / rebuild forms', 'buildAllForms');

  var adminMenu = ui
    .createMenu('⚠️ Admin')
    .addItem('Settings', 'openSettingsDialog')
    .addItem('Validate environment', 'validateEnvironment')
    .addItem('Initialize system', 'initializeSystem')
    .addSeparator()
    .addItem('New year setup', 'newYearSetup')
    .addItem('Clear attendance history', 'clearAttendanceHistory');

  ui.createMenu('🥁 Attendance')
    .addItem('➕ Add rehearsal date', 'addRehearsalDate')
    .addItem('🗑️ Delete rehearsal date', 'openDeleteDateDialog')
    .addSeparator()
    .addItem('✅ Process approved requests', 'processApprovedRequests')
    .addSeparator()
    .addSubMenu(rosterMenu)
    .addSubMenu(adminMenu)
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

/**
 * Retrieves all sheet names and their unique GIDs.
 * @customfunction
 */
function GET_SHEETS() {
  const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  return sheets.map((sheet) => [sheet.getName(), sheet.getSheetId()]);
}
