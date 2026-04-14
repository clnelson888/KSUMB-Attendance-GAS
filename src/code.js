/** @OnlyCurrentDoc */

/**
 * Runs when the spreadsheet is opened. Registers the Attendance custom menu.
 * @param {GoogleAppsScript.Events.SheetsOnOpen} e - The onOpen event object.
 */
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu("Attendance")
    .addItem("Add rehearsal date", "addRehearsalDate")
    .addItem("Delete rehearsal date", "openDeleteDateDialog")
    .addItem("Set default attendance value", "openDefaultAttendanceDialog")
    .addSeparator()
    .addItem("Build / rebuild forms", "buildAllForms")
    .addItem("Sync roster names to forms", "syncRosterToForms")
    .addSeparator()
    .addItem("Process approved requests", "processApprovedRequests")
    .addItem("Generate concern list", "generateConcernList")
    .addToUi();
}
