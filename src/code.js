/** @OnlyCurrentDoc */

/**
 * Runs when the spreadsheet is opened. Registers the Attendance custom menu.
 * @param {GoogleAppsScript.Events.SheetsOnOpen} e - The onOpen event object.
 */
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu("Attendance")
    .addItem("Validate environment", "validateEnvironment")
    .addItem("Initialize system", "initializeSystem")
    .addSeparator()
    .addItem("Add rehearsal date", "addRehearsalDate")
    .addItem("Delete rehearsal date", "openDeleteDateDialog")
    .addSeparator()
    .addItem("Build / rebuild forms", "buildAllForms")
    .addItem("Roster sync", "syncRosterFromDatabase")
    .addItem("Sync roster names to forms", "syncRosterToForms")
    .addSeparator()
    .addItem("Clear attendance history", "clearAttendanceHistory")
    .addItem("New year setup", "newYearSetup")
    .addSeparator()
    .addItem("Process approved requests", "processApprovedRequests")
    .addItem("Generate concern list", "generateConcernList")
    .addToUi();
}
