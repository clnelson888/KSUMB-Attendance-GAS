/** @OnlyCurrentDoc */

/**
 * Returns the header index map for the Late Check-Ins queue.
 *
 * @param {string[]} headers
 * @returns {Object.<string, number>}
 */
function getLateCheckInHeaderMap(headers) {
  return {
    submissionId: headers.indexOf('Submission ID'),
    submittedAt: headers.indexOf('Submitted At'),
    fullName: headers.indexOf('Full Name'),
    section: headers.indexOf('Section'),
    arrivalTime: headers.indexOf('Arrival Time'),
    reason: headers.indexOf('Reason'),
    otherExplanation: headers.indexOf('Other Explanation'),
    status: headers.indexOf('Status'),
    processedAt: headers.indexOf('Processed At'),
    error: headers.indexOf('Error'),
  };
}

/**
 * Builds a queue row array matching the Late Check-Ins header order.
 *
 * @param {string[]} headers
 * @param {Object} payload
 * @returns {Array}
 */
function buildLateCheckInQueueRow(headers, payload) {
  var row = [];
  for (var i = 0; i < headers.length; i++) row.push('');

  var headerMap = getLateCheckInHeaderMap(headers);
  row[headerMap.submissionId] = payload.submissionId;
  row[headerMap.submittedAt] = payload.submittedAt;
  row[headerMap.fullName] = payload.name;
  row[headerMap.section] = payload.section;
  row[headerMap.arrivalTime] = payload.arrival;
  row[headerMap.reason] = payload.reason;
  row[headerMap.otherExplanation] = payload.otherExplanation;
  row[headerMap.status] = getStatusValue('PENDING');
  return row;
}

/**
 * Acquires the script lock for write-critical attendance updates.
 *
 * @returns {GoogleAppsScript.Lock.Lock}
 */
function acquireLateCheckInLock() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  return lock;
}

/**
 * Appends a late check-in submission to the queue and returns the row index.
 *
 * @param {Object} payload
 * @returns {{sheet: GoogleAppsScript.Spreadsheet.Sheet, rowIndex: number, headerMap: Object}}
 */
function appendLateCheckInQueueRow(payload) {
  var lateSheet = getSheet('Late Check-Ins');
  var headers = lateSheet.getRange(1, 1, 1, lateSheet.getLastColumn()).getValues()[0];
  var headerMap = getLateCheckInHeaderMap(headers);
  var row = buildLateCheckInQueueRow(headers, payload);

  lateSheet.appendRow(row);
  if (typeof applyQueueStatusValidation === 'function') applyQueueStatusValidation(lateSheet);

  return {
    sheet: lateSheet,
    rowIndex: lateSheet.getLastRow(),
    headerMap: headerMap,
  };
}

/**
 * Writes the queue outcome for a Late Check-In row.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} lateSheet
 * @param {Object} headerMap
 * @param {number} rowIndex
 * @param {Object} outcome
 */
function writeLateCheckInOutcome(lateSheet, headerMap, rowIndex, outcome) {
  if (outcome.statusValue) {
    lateSheet.getRange(rowIndex, headerMap.status + 1).setValue(outcome.statusValue);
  }
  if (headerMap.processedAt !== -1) {
    lateSheet.getRange(rowIndex, headerMap.processedAt + 1).setValue(outcome.processedAt || '');
  }
  if (headerMap.error !== -1) {
    lateSheet.getRange(rowIndex, headerMap.error + 1).setValue(outcome.errorMessage || '');
  }
}

/**
 * Validates the minimum submission payload.
 *
 * @param {Object} payload
 * @throws {Error}
 */
function validateLateCheckInPayload(payload) {
  if (!payload.name) throw new Error('Late Check-In is missing the student name.');
  if (!payload.section) throw new Error('Late Check-In is missing the section.');
  if (!isValidDateLike(payload.arrival)) {
    throw new Error('Late Check-In arrival time is invalid.');
  }
}

/**
 * Processes a single late-check-in queue item against the section attendance
 * sheet. Returns a structured outcome without mutating the queue row.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {Object} payload
 * @returns {{statusValue: string, processedAt: Date|string, errorMessage: string, updated: boolean}}
 */
function processSingleLateCheckIn(ss, payload) {
  var pendingStatus = getStatusValue('PENDING');
  var completeStatus = getStatusValue('COMPLETE');
  var attendanceValues = {
    present: getAttendanceValue('PRESENT'),
    tardy: getAttendanceValue('TARDY'),
    absent: getAttendanceValue('ABSENT'),
    excused: getAttendanceValue('EXCUSED'),
  };

  validateLateCheckInPayload(payload);

  var sectionSheet = ss.getSheetByName(payload.section);
  if (!sectionSheet) {
    return {
      statusValue: pendingStatus,
      processedAt: '',
      errorMessage: 'Section tab not found: ' + payload.section,
      updated: false,
    };
  }

  var lastRow = sectionSheet.getLastRow();
  var lastCol = sectionSheet.getLastColumn();
  if (lastRow < 2 || lastCol < 2) {
    return {
      statusValue: pendingStatus,
      processedAt: '',
      errorMessage: 'Section tab is missing roster rows or date columns: ' + payload.section,
      updated: false,
    };
  }

  var allData = sectionSheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = allData[0];
  var rowIndex = -1;
  for (var r = 1; r < allData.length; r++) {
    if (String(allData[r][0]).trim() === payload.name) {
      rowIndex = r + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    return {
      statusValue: pendingStatus,
      processedAt: '',
      errorMessage: 'Student not found on section tab: ' + payload.name,
      updated: false,
    };
  }

  var colIndex = matchDateColumn(headers, payload.arrival);
  if (colIndex === -1) {
    return {
      statusValue: pendingStatus,
      processedAt: '',
      errorMessage: '',
      updated: false,
    };
  }

  var rehearsalStart = parseDateHeader(headers[colIndex]);
  if (!rehearsalStart) {
    return {
      statusValue: pendingStatus,
      processedAt: '',
      errorMessage: 'Could not parse rehearsal header for section ' + payload.section,
      updated: false,
    };
  }

  var currentValue = String(allData[rowIndex - 1][colIndex] || '').trim();
  if (!canLateCheckInOverwriteAttendance(currentValue, attendanceValues)) {
    return {
      statusValue: pendingStatus,
      processedAt: '',
      errorMessage: 'Existing attendance value is not safe to overwrite: ' + currentValue,
      updated: false,
    };
  }

  var thresholdMinutes = parseLateThresholdMinutes(
    getConfigValue(CONFIG_KEYS.LATE_THRESHOLD_MINUTES, DEFAULT_CONFIG_VALUES[CONFIG_KEYS.LATE_THRESHOLD_MINUTES]),
    DEFAULT_CONFIG_VALUES[CONFIG_KEYS.LATE_THRESHOLD_MINUTES]
  );
  var attendanceValue = determineLateAttendanceStatus(
    payload.arrival,
    rehearsalStart,
    thresholdMinutes,
    attendanceValues.present,
    attendanceValues.tardy
  );

  var targetCell = sectionSheet.getRange(rowIndex, colIndex + 1);
  targetCell.setValue(attendanceValue);
  targetCell.setNote(
    buildLateCheckInNoteText(
      Utilities.formatDate(payload.arrival, getAppTimezone(), 'h:mm a'),
      payload.reason,
      payload.otherExplanation
    )
  );

  return {
    statusValue: completeStatus,
    processedAt: new Date(),
    errorMessage: '',
    updated: true,
  };
}

/**
 * Reprocesses any pending Late Check-In rows whose arrival date matches the
 * provided rehearsal date.
 *
 * @param {Date} targetDate
 * @returns {number}
 */
function processPendingLateCheckInsForDate(targetDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lateSheet = getSheet('Late Check-Ins');
  var allData = lateSheet.getDataRange().getValues();
  if (allData.length < 2) return 0;

  var headers = allData[0];
  var headerMap = getLateCheckInHeaderMap(headers);
  var pendingStatus = getStatusValue('PENDING');
  var processed = 0;
  var lock = acquireLateCheckInLock();

  try {
    for (var i = 1; i < allData.length; i++) {
      if (String(allData[i][headerMap.status]).trim() !== pendingStatus) continue;

      var arrival = allData[i][headerMap.arrivalTime];
      var arrivalDate = arrival instanceof Date ? arrival : new Date(arrival);
      if (!isSameCalendarDate(arrivalDate, targetDate)) continue;

      var payload = {
        submissionId: String(allData[i][headerMap.submissionId] || '').trim(),
        submittedAt: allData[i][headerMap.submittedAt],
        name: String(allData[i][headerMap.fullName] || '').trim(),
        section: String(allData[i][headerMap.section] || '').trim(),
        arrival: arrivalDate,
        reason: String(allData[i][headerMap.reason] || '').trim(),
        otherExplanation: String(allData[i][headerMap.otherExplanation] || '').trim(),
      };

      var outcome = processSingleLateCheckIn(ss, payload);
      writeLateCheckInOutcome(lateSheet, headerMap, i + 1, outcome);
      if (outcome.updated) processed++;
    }

    SpreadsheetApp.flush();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }

  return processed;
}
