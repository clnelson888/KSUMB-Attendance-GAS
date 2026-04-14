/** @OnlyCurrentDoc */

/**
 * Sets up or refreshes the Concern List tab as a formula-driven report.
 * After setup, staff can change the selector in B1 without running a script.
 */
function generateConcernList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var concernSheet = getSheet('Concern List');
  var sectionTabs = getConfiguredSectionTabs();
  var dateOptions = getConcernListDateOptions(ss, sectionTabs);
  var presentValue = getAttendanceValue('PRESENT');

  configureConcernListSheet(concernSheet, dateOptions, presentValue, sectionTabs);
  concernSheet.activate();
  ss.toast('Concern List formulas refreshed.', 'Concern List');
}

/**
 * Returns the available rehearsal date headers from the first section tab that
 * contains date columns.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string[]} sectionTabs
 * @returns {string[]}
 */
function getConcernListDateOptions(ss, sectionTabs) {
  for (var i = 0; i < sectionTabs.length; i++) {
    var sheet = ss.getSheetByName(sectionTabs[i]);
    if (!sheet) continue;

    var lastCol = sheet.getLastColumn();
    if (lastCol < 2) continue;

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var options = [];
    for (var c = 1; c < headers.length; c++) {
      if (parseDateHeader(headers[c])) {
        options.push(String(headers[c]));
      }
    }
    if (options.length > 0) return options;
  }

  return [];
}

/**
 * Configures the Concern List layout, selector, and formulas.
 *
 * Layout:
 *   A1 = label
 *   B1 = date selector
 *   A3:C3 = report headers
 *   A4 = array formula output
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} concernSheet
 * @param {string[]} dateOptions
 * @param {string} presentValue
 * @param {string[]} sectionTabs
 */
function configureConcernListSheet(concernSheet, dateOptions, presentValue, sectionTabs) {
  concernSheet.clear();
  concernSheet.getRange(1, 1).setValue('Selected Rehearsal');
  concernSheet.getRange(3, 1, 1, 3).setValues([['Student Name', 'Section', 'Attendance Status']]);
  concernSheet.setFrozenRows(3);

  if (dateOptions.length > 0) {
    var selectorRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(dateOptions, true)
      .setAllowInvalid(false)
      .build();

    concernSheet.getRange(1, 2).setDataValidation(selectorRule).setValue(dateOptions[0]);
  } else {
    concernSheet.getRange(1, 2).setValue('');
  }

  concernSheet
    .getRange(4, 1)
    .setFormula(buildConcernListFormula(sectionTabs, presentValue));

  concernSheet.autoResizeColumns(1, 3);
}

/**
 * Backward-compatible wrapper from the old dialog-based implementation.
 *
 * @param {string} ignoreDateString
 */
function buildConcernList(ignoreDateString) {
  generateConcernList();
}
