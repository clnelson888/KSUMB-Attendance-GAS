/** @OnlyCurrentDoc */

/**
 * Returns the { statusValue: hexColor } map configured for the workbook,
 * falling back to the defaults when a setting is missing.
 *
 * @returns {Object.<string, string>}
 */
function getStatusColorMap() {
  var map = {};
  map[getStatusValue('PENDING')] = String(
    getConfigValue(CONFIG_KEYS.STATUS_COLOR_PENDING, DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_COLOR_PENDING])
  );
  map[getStatusValue('APPROVED')] = String(
    getConfigValue(CONFIG_KEYS.STATUS_COLOR_APPROVED, DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_COLOR_APPROVED])
  );
  map[getStatusValue('DENIED')] = String(
    getConfigValue(CONFIG_KEYS.STATUS_COLOR_DENIED, DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_COLOR_DENIED])
  );
  map[getStatusValue('COMPLETE')] = String(
    getConfigValue(CONFIG_KEYS.STATUS_COLOR_COMPLETE, DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_COLOR_COMPLETE])
  );
  return map;
}

/**
 * Builds a data-validation rule that restricts a cell to the given list of
 * status values. `requireValueInList(..., true)` renders as a dropdown in
 * Google Sheets — recent Sheets versions display this as a chip.
 *
 * @param {string[]} statuses
 * @returns {GoogleAppsScript.Spreadsheet.DataValidation}
 */
function buildStatusDataValidation(statuses) {
  return SpreadsheetApp.newDataValidation().requireValueInList(statuses, true).setAllowInvalid(false).build();
}

/**
 * Applies the status data validation + per-value conditional-format colors
 * to the Status column of a queue sheet, across rows 2..lastRow. Callers
 * must re-invoke after appending rows so the new rows pick up the rule.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} statusColumnIndex - Zero-based column index of the Status column.
 * @param {string[]} statuses
 */
function applyStatusValidationToColumn(sheet, statusColumnIndex, statuses) {
  if (statusColumnIndex < 0) return;

  var lastRow = Math.max(sheet.getLastRow(), 2);
  var rowCount = lastRow - 1;
  if (rowCount < 1) rowCount = 1;

  var range = sheet.getRange(2, statusColumnIndex + 1, rowCount, 1);
  range.setDataValidation(buildStatusDataValidation(statuses));

  applyStatusConditionalFormatting(sheet, range, statuses);
}

/**
 * Replaces this sheet's conditional-format rules that target the status
 * column with a fresh per-status color set. Rules on other columns are
 * preserved.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {GoogleAppsScript.Spreadsheet.Range} range - The status-column range.
 * @param {string[]} statuses
 */
function applyStatusConditionalFormatting(sheet, range, statuses) {
  var colorMap = getStatusColorMap();
  var targetColumn = range.getColumn();
  var targetSheetId = sheet.getSheetId();

  var existingRules = sheet.getConditionalFormatRules();
  var keptRules = [];
  for (var i = 0; i < existingRules.length; i++) {
    var rule = existingRules[i];
    var ranges = rule.getRanges();
    var touchesStatusCol = false;
    for (var r = 0; r < ranges.length; r++) {
      if (
        ranges[r].getSheet().getSheetId() === targetSheetId &&
        ranges[r].getColumn() <= targetColumn &&
        ranges[r].getLastColumn() >= targetColumn
      ) {
        touchesStatusCol = true;
        break;
      }
    }
    if (!touchesStatusCol) keptRules.push(rule);
  }

  for (var s = 0; s < statuses.length; s++) {
    var status = statuses[s];
    var color = colorMap[status];
    if (!color) continue;
    var newRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(status)
      .setBackground(color)
      .setRanges([range])
      .build();
    keptRules.push(newRule);
  }

  sheet.setConditionalFormatRules(keptRules);
}
