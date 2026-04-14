/** @OnlyCurrentDoc */

/**
 * Returns a Sheet object by tab name.
 * @param {string} sheetName - The tab name to look up.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} The sheet.
 * @throws {Error} If the sheet does not exist.
 */
function getSheet(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet "' + sheetName + '" not found.');
  return sheet;
}

/**
 * Reads all data from a named sheet tab as a 2D array (batch read).
 * @param {string} sheetName - The tab name to read from.
 * @returns {Array[]} 2D array of cell values (row-major). Row 0 is headers.
 */
function getTableData(sheetName) {
  return getSheet(sheetName).getDataRange().getValues();
}

/**
 * Reads a sheet and splits headers from data rows.
 * @param {string} sheetName - The tab name to read from.
 * @returns {{ headers: string[], data: any[][] }} Headers array and data rows.
 */
function getTableDataWithHeaders(sheetName) {
  const all = getTableData(sheetName);
  return {
    headers: all[0] || [],
    data: all.slice(1),
  };
}

/**
 * Writes a 2D array to a named sheet tab in a single batch call.
 * @param {string} sheetName - The tab name to write to.
 * @param {Array[]} data - 2D array of values to write.
 * @param {number} [startRow=1] - 1-based row to begin writing.
 * @param {number} [startCol=1] - 1-based column to begin writing.
 */
function writeTableData(sheetName, data, startRow, startCol) {
  startRow = startRow || 1;
  startCol = startCol || 1;
  if (!data || data.length === 0) return;
  const sheet = getSheet(sheetName);
  sheet.getRange(startRow, startCol, data.length, data[0].length).setValues(data);
}
