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
 * Reads tabular data from a sheet as a 2D array (row 0 is headers).
 *
 * Resolution order:
 *   1. `options.namedRange` — read from `ss.getRangeByName(...)` if defined.
 *   2. `options.expectedHeaders` — scan the top of the sheet for a row
 *      containing all expected headers, then read that row plus the
 *      contiguous non-blank rows below it.
 *   3. Fallback: `sheet.getDataRange().getValues()` (legacy behavior).
 *
 * @param {string} sheetName
 * @param {{ namedRange?: string, expectedHeaders?: string[], searchRowLimit?: number }} [options]
 * @returns {Array[]}
 */
function getTableData(sheetName, options) {
  options = options || {};

  if (options.namedRange) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var named = ss && ss.getRangeByName(options.namedRange);
    if (named) return named.getValues();
  }

  var sheet = getSheet(sheetName);

  if (options.expectedHeaders && options.expectedHeaders.length) {
    var detected = _detectTableRange(sheet, options.expectedHeaders, options.searchRowLimit || 20);
    if (detected) return detected;
  }

  return sheet.getDataRange().getValues();
}

/**
 * Reads a sheet and splits headers from data rows.
 * @param {string} sheetName
 * @param {{ namedRange?: string, expectedHeaders?: string[], searchRowLimit?: number }} [options]
 * @returns {{ headers: string[], data: any[][] }}
 */
function getTableDataWithHeaders(sheetName, options) {
  const all = getTableData(sheetName, options);
  return {
    headers: all[0] || [],
    data: all.slice(1),
  };
}

/**
 * Scans the top of a sheet for a header row matching the expected tokens,
 * then returns a 2D slice from that row through the last contiguous
 * non-blank data row. Returns null when no matching header is found.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} expectedHeaders
 * @param {number} searchRowLimit
 * @returns {Array[]|null}
 */
function _detectTableRange(sheet, expectedHeaders, searchRowLimit) {
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  if (lastCol < 1 || lastRow < 1) return null;

  var scanRows = Math.min(searchRowLimit, lastRow);
  var scan = sheet.getRange(1, 1, scanRows, lastCol).getValues();

  var headerRow = -1;
  for (var r = 0; r < scan.length; r++) {
    var present = {};
    for (var c = 0; c < scan[r].length; c++) {
      var token = String(scan[r][c] == null ? '' : scan[r][c]).trim();
      if (token) present[token] = true;
    }
    var allMatched = true;
    for (var h = 0; h < expectedHeaders.length; h++) {
      if (!present[expectedHeaders[h]]) {
        allMatched = false;
        break;
      }
    }
    if (allMatched) {
      headerRow = r + 1;
      break;
    }
  }

  if (headerRow === -1) return null;

  var blockRows = lastRow - headerRow + 1;
  if (blockRows < 1) return null;
  var block = sheet.getRange(headerRow, 1, blockRows, lastCol).getValues();

  var endIdx = block.length;
  for (var i = 1; i < block.length; i++) {
    var isBlank = true;
    for (var cc = 0; cc < block[i].length; cc++) {
      if (String(block[i][cc] == null ? '' : block[i][cc]).trim() !== '') {
        isBlank = false;
        break;
      }
    }
    if (isBlank) {
      endIdx = i;
      break;
    }
  }

  return block.slice(0, endIdx);
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

/**
 * Diagnostic. Logs a summary of each sheet's dimensions, detected header row
 * for known tables (Database, Data), and whether known named ranges exist.
 * Flags sheets where the full data range extends past the contiguous block
 * (i.e. stray rows below the real table).
 */
function auditDataSheetRanges() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    console.log('auditDataSheetRanges: no active spreadsheet.');
    return;
  }

  var knownRanges = ['DATA_CONFIG', 'DATABASE_ROSTER'];
  for (var i = 0; i < knownRanges.length; i++) {
    var named = ss.getRangeByName(knownRanges[i]);
    var location = named ? `${named.getA1Notation()} on "${named.getSheet().getName()}"` : 'not defined';
    console.log(`Named range ${knownRanges[i]}: ${location}`);
  }

  var probes = [
    { sheet: 'Database', expectedHeaders: ['Full Name', 'Section'] },
    { sheet: 'Data', expectedHeaders: ['Key'] },
  ];

  for (var p = 0; p < probes.length; p++) {
    var sheet = ss.getSheetByName(probes[p].sheet);
    if (!sheet) {
      console.log(`Sheet "${probes[p].sheet}" not found.`);
      continue;
    }
    var detected = _detectTableRange(sheet, probes[p].expectedHeaders, 20);
    var lastRow = sheet.getLastRow();
    var detectedRows = detected ? detected.length : 0;
    var headerInfo = detected ? `, headers=${JSON.stringify(detected[0])}` : ', headers=<not detected>';
    console.log(
      `Sheet "${probes[p].sheet}": lastRow=${lastRow}, detectedBlockRows=${detectedRows}${headerInfo}`
    );
    if (detected && lastRow > detectedRows) {
      console.warn(
        `Sheet "${probes[p].sheet}": ${lastRow - detectedRows} row(s) exist outside the detected table block — stray data likely.`
      );
    }
  }
}
