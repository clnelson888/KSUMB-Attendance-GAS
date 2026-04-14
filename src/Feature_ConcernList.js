/** @OnlyCurrentDoc */

// ---------------------------------------------------------------------------
// Concern List — snapshot of students not fully present at rehearsal
// ---------------------------------------------------------------------------

/**
 * Opens the Concern List dialog so staff can pick a rehearsal date.
 * Called from the Attendance menu.
 */
function generateConcernList() {
  var html = HtmlService.createHtmlOutputFromFile("ConcernListDialog")
    .setWidth(300)
    .setHeight(180)
    .setTitle("Generate Concern List");

  SpreadsheetApp.getUi().showModalDialog(html, "Generate Concern List");
}

/**
 * Scans all section tabs for students who are empty, Absent, or Tardy
 * on the given date and writes the results to the Concern List tab.
 * Called from the dialog via google.script.run.
 *
 * @param {string} dateString - Date in "YYYY-MM-DD" format from the date input.
 */
function buildConcernList(dateString) {
  var parts = dateString.split("-");
  var targetDate = new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10),
  );

  var dateLabel = Utilities.formatDate(targetDate, "America/Chicago", "M/d");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var concerns = [];

  for (var t = 0; t < SECTION_TABS.length; t++) {
    var tabName = SECTION_TABS[t];
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) continue;

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 2) continue;

    var allData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var colIdx = matchDateColumn(allData[0], targetDate);
    if (colIdx === -1) continue;

    for (var r = 1; r < allData.length; r++) {
      var name = String(allData[r][0]).trim();
      if (!name) continue;

      var cellValue = String(allData[r][colIdx]).trim();
      var isConcern =
        cellValue === "" || cellValue === "Absent" || cellValue === "Tardy";

      if (isConcern) {
        concerns.push([
          tabName,
          name,
          cellValue === "" ? "No Record" : cellValue,
          dateLabel,
        ]);
      }
    }
  }

  // Write to Concern List tab
  var clSheet = getSheet("Concern List");
  var clLastRow = clSheet.getLastRow();

  // Clear existing data rows (keep header row 1)
  if (clLastRow > 1) {
    clSheet
      .getRange(2, 1, clLastRow - 1, clSheet.getLastColumn())
      .clearContent();
  }

  if (concerns.length > 0) {
    clSheet.getRange(2, 1, concerns.length, 4).setValues(concerns);
  }

  SpreadsheetApp.flush();
  ss.toast(
    concerns.length + " student(s) on concern list for " + dateLabel + ".",
    "Concern List",
  );
  console.log("ConcernList: " + concerns.length + " concerns for " + dateLabel);
}
