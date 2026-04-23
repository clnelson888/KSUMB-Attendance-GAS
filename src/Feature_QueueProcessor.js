/** @OnlyCurrentDoc */

// ---------------------------------------------------------------------------
// Queue Processor — batch-applies approved form submissions to section tabs
// ---------------------------------------------------------------------------

/**
 * Orchestrator: processes all three approval queues and shows a summary toast.
 * Called from the Attendance menu.
 */
function processApprovedRequests() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Processing approved requests...', 'Please wait');

  var pinkCount = processApprovedPinkSheets(ss);
  var yellowCount = processApprovedYellowSheets(ss);

  SpreadsheetApp.flush();

  var total = pinkCount + yellowCount;
  if (total === 0) {
    ss.toast('No approved requests to process.', 'Queue Processor');
  } else {
    ss.toast(
      'Processed ' + total + ' request(s): ' + pinkCount + ' pink, ' + yellowCount + ' yellow.',
      'Queue Processor'
    );
  }
  console.log('QueueProcessor: pink=' + pinkCount + ' yellow=' + yellowCount);
}

// ---------------------------------------------------------------------------
// Date matching helper
// ---------------------------------------------------------------------------

/**
 * Finds the 0-based column index in a header row whose date matches the
 * target date. Matches on calendar date (M/d) first, then — when multiple
 * columns share the same date (e.g., two rehearsals on the same day) —
 * picks the one whose time-of-day is closest to the target's time-of-day.
 *
 * This lets Late Check-Ins land on the rehearsal the student was actually
 * arriving at, rather than always the earliest slot of the day.
 *
 * @param {Array} headers - Row 0 from the section tab (mixed Date/string values).
 * @param {Date} targetDate - The date (and time) to match against.
 * @returns {number} 0-based column index, or -1 if not found.
 */
function matchDateColumn(headers, targetDate) {
  var tz = getAppTimezone();
  var targetMd = Utilities.formatDate(targetDate, tz, 'M/d');
  var targetMinutes = targetDate.getHours() * 60 + targetDate.getMinutes();

  var bestCol = -1;
  var bestDiff = Infinity;
  for (var c = 1; c < headers.length; c++) {
    var parsed = parseDateHeader(headers[c]);
    if (!parsed) continue;
    if (Utilities.formatDate(parsed, tz, 'M/d') !== targetMd) continue;

    var headerMinutes = parsed.getHours() * 60 + parsed.getMinutes();
    var diff = Math.abs(headerMinutes - targetMinutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestCol = c;
    }
  }
  return bestCol;
}

// ---------------------------------------------------------------------------
// Late Check-Ins processor
// ---------------------------------------------------------------------------

/**
 * Processes all approved Late Check-In rows.
 * Sets matching section tab cells to "Tardy", then marks rows "Completed".
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - The active spreadsheet.
 * @returns {number} Number of rows processed.
 */
function processApprovedLateCheckIns(ss) {
  var tabData = getTableDataWithHeaders('Late Check-Ins');
  var headers = tabData.headers;
  var rows = tabData.data;

  var colName = headers.indexOf('Full Name');
  var colSection = headers.indexOf('Section');
  var colArrival = headers.indexOf('Arrival Time');
  var colStatus = headers.indexOf('Status');

  if (colName === -1 || colSection === -1 || colArrival === -1 || colStatus === -1) {
    console.error('LateCheckIns: missing required columns. Found: ' + JSON.stringify(headers));
    return 0;
  }

  // Collect approved rows with their original row indices (1-based, offset by header)
  var approved = [];
  var approvedStatus = getStatusValue('APPROVED');
  var completeStatus = getStatusValue('COMPLETE');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][colStatus]).trim() === approvedStatus) {
      approved.push({
        rowIndex: i + 2, // 1-based sheet row (header=1, first data=2)
        name: String(rows[i][colName]).trim(),
        section: String(rows[i][colSection]).trim(),
        arrival: rows[i][colArrival],
      });
    }
  }

  if (approved.length === 0) return 0;

  // Group by section
  var bySection = groupByKey(approved, 'section');

  // Process each section
  var processed = applyAttendanceUpdates(ss, bySection, getAttendanceValue('TARDY'), function (item) {
    return item.arrival instanceof Date ? item.arrival : new Date(item.arrival);
  });

  // Mark processed rows as Completed
  var lateSheet = getSheet('Late Check-Ins');
  for (var j = 0; j < approved.length; j++) {
    lateSheet.getRange(approved[j].rowIndex, colStatus + 1).setValue(completeStatus);
  }

  return processed;
}

// ---------------------------------------------------------------------------
// Pink Sheets processor
// ---------------------------------------------------------------------------

/**
 * Processes all approved Pink Sheet rows.
 * Sets matching section tab cells to "Excused", then marks rows "Completed".
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - The active spreadsheet.
 * @returns {number} Number of rows processed.
 */
function processApprovedPinkSheets(ss) {
  return processPinkSheetActions(ss);
}

// ---------------------------------------------------------------------------
// Yellow Sheets processor
// ---------------------------------------------------------------------------

/**
 * Processes all actionable Yellow Sheet rows. Delegates to the single-row
 * processor in Feature_YellowSheets, which handles note aggregation across
 * every Yellow Sheet a student currently has on file.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {number}
 */
function processApprovedYellowSheets(ss) {
  return processYellowSheetActions(ss);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Groups an array of objects by a string key.
 *
 * @param {Object[]} items - Array of objects to group.
 * @param {string} key - Property name to group by.
 * @returns {Object.<string, Object[]>} Map of key value → array of items.
 */
function groupByKey(items, key) {
  var groups = {};
  for (var i = 0; i < items.length; i++) {
    var val = items[i][key];
    if (!groups[val]) groups[val] = [];
    groups[val].push(items[i]);
  }
  return groups;
}

/**
 * Applies attendance value updates to section tabs in batch.
 * Reads each section tab, modifies date columns in memory, writes back cols 2+.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - The active spreadsheet.
 * @param {Object.<string, Object[]>} bySection - Items grouped by section name.
 * @param {string} attendanceValue - Value to set (e.g., "Tardy", "Excused").
 * @param {function} getDate - Function that extracts a Date from an item.
 * @returns {number} Number of cells successfully updated.
 */
function applyAttendanceUpdates(ss, bySection, attendanceValue, getDate) {
  var updated = 0;
  var sectionNames = Object.keys(bySection);

  for (var s = 0; s < sectionNames.length; s++) {
    var sectionName = sectionNames[s];
    var items = bySection[sectionName];
    var sheet = ss.getSheetByName(sectionName);

    if (!sheet) {
      console.warn('QueueProcessor: section tab not found — ' + sectionName);
      continue;
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 2) continue;

    // Read full data
    var allData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var sectionHeaders = allData[0];

    // Build name → row-index map (0-based within allData)
    var nameMap = {};
    for (var r = 1; r < allData.length; r++) {
      nameMap[String(allData[r][0]).trim()] = r;
    }

    // Apply updates to the in-memory array
    var changed = false;
    for (var k = 0; k < items.length; k++) {
      var item = items[k];
      var rowIdx = nameMap[item.name];
      if (rowIdx === undefined) {
        console.warn('QueueProcessor: student not found in ' + sectionName + ' — ' + item.name);
        continue;
      }

      var targetDate = getDate(item);
      if (!targetDate || isNaN(targetDate.getTime())) {
        console.warn('QueueProcessor: invalid date for ' + item.name);
        continue;
      }

      var colIdx = matchDateColumn(sectionHeaders, targetDate);
      if (colIdx === -1) {
        console.warn(
          'QueueProcessor: no matching date column for ' +
            item.name +
            ' on ' +
            Utilities.formatDate(targetDate, getAppTimezone(), 'M/d')
        );
        continue;
      }

      allData[rowIdx][colIdx] = attendanceValue;
      changed = true;
      updated++;
    }

    // Write back only date columns (col 2+) to preserve name-cell notes
    if (changed) {
      var dateCols = allData.map(function (row) {
        return row.slice(1);
      });
      sheet.getRange(1, 2, dateCols.length, dateCols[0].length).setValues(dateCols);
    }
  }

  return updated;
}

/**
 * Formats a time value (Date object or string) into a short time string.
 *
 * @param {*} timeValue - A Date object or time string from the sheet.
 * @returns {string} Formatted time string (e.g., "2:30 PM"), or empty string.
 */
function formatTimeValue(timeValue) {
  if (!timeValue) return '';
  if (timeValue instanceof Date) {
    return Utilities.formatDate(timeValue, getAppTimezone(), 'h:mm a');
  }
  return String(timeValue).trim();
}

