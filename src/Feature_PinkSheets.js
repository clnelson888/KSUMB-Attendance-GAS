/** @OnlyCurrentDoc */

/**
 * Returns the header index map for the Pink Sheets queue.
 *
 * @param {string[]} headers
 * @returns {Object.<string, number>}
 */
function getPinkSheetHeaderMap(headers) {
  return {
    submissionId: headers.indexOf('Submission ID'),
    submittedAt: headers.indexOf('Submitted At'),
    fullName: headers.indexOf('Full Name'),
    section: headers.indexOf('Section'),
    date: headers.indexOf('Date'),
    reason: headers.indexOf('Reason'),
    status: headers.indexOf('Status'),
    approvedAt: headers.indexOf('Approved At'),
    deniedAt: headers.indexOf('Denied At'),
    processedAt: headers.indexOf('Processed At'),
    error: headers.indexOf('Error'),
  };
}

/**
 * Writes the queue outcome for a Pink Sheet row.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} pinkSheet
 * @param {Object} headerMap
 * @param {number} rowIndex
 * @param {Object} outcome
 */
function writePinkSheetOutcome(pinkSheet, headerMap, rowIndex, outcome) {
  pinkSheet.getRange(rowIndex, headerMap.status + 1).setValue(outcome.statusValue);

  if (headerMap.approvedAt !== -1 && outcome.approvedAt != null && outcome.approvedAt !== '') {
    pinkSheet.getRange(rowIndex, headerMap.approvedAt + 1).setValue(outcome.approvedAt);
  }

  if (headerMap.deniedAt !== -1 && outcome.deniedAt != null && outcome.deniedAt !== '') {
    pinkSheet.getRange(rowIndex, headerMap.deniedAt + 1).setValue(outcome.deniedAt);
  }

  if (headerMap.processedAt !== -1) {
    pinkSheet.getRange(rowIndex, headerMap.processedAt + 1).setValue(outcome.processedAt || '');
  }

  if (headerMap.error !== -1) {
    pinkSheet.getRange(rowIndex, headerMap.error + 1).setValue(outcome.errorMessage || '');
  }
}

/**
 * Applies one Pink Sheet row to the appropriate attendance cell when possible.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {Object} payload
 * @returns {{statusValue: string, processedAt: Date|string, errorMessage: string, updated: boolean}}
 */
function processSinglePinkSheet(ss, payload) {
  var statuses = {
    pending: getStatusValue('PENDING'),
    approved: getStatusValue('APPROVED'),
    denied: getStatusValue('DENIED'),
    complete: getStatusValue('COMPLETE'),
  };

  var sectionSheet = ss.getSheetByName(payload.section);
  if (!sectionSheet) {
    return {
      statusValue: payload.status,
      processedAt: '',
      approvedAt: '',
      deniedAt: '',
      errorMessage: 'Section tab not found: ' + payload.section,
      updated: false,
    };
  }

  var lastRow = sectionSheet.getLastRow();
  var lastCol = sectionSheet.getLastColumn();
  if (lastRow < 2 || lastCol < 2) {
    return {
      statusValue: payload.status,
      processedAt: '',
      approvedAt: '',
      deniedAt: '',
      errorMessage: 'Section tab is missing roster rows or date columns: ' + payload.section,
      updated: false,
    };
  }

  var allData = sectionSheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = allData[0];
  var studentRow = -1;
  for (var r = 1; r < allData.length; r++) {
    if (String(allData[r][0]).trim() === payload.name) {
      studentRow = r + 1;
      break;
    }
  }

  if (studentRow === -1) {
    return {
      statusValue: payload.status,
      processedAt: '',
      approvedAt: '',
      deniedAt: '',
      errorMessage: 'Student not found on section tab: ' + payload.name,
      updated: false,
    };
  }

  var targetDate = payload.date instanceof Date ? payload.date : new Date(payload.date);
  if (isNaN(targetDate.getTime())) {
    return {
      statusValue: payload.status,
      processedAt: '',
      approvedAt: '',
      deniedAt: '',
      errorMessage: 'Pink Sheet date is invalid for ' + payload.name,
      updated: false,
    };
  }

  var colIndex = matchDateColumn(headers, targetDate);
  var hasMatchingDate = colIndex !== -1;
  var action = determinePinkSheetAction(payload.status, hasMatchingDate, statuses);

  var tz = getAppTimezone();
  var now = new Date();
  var approvedAt = payload.approvedAt instanceof Date ? payload.approvedAt : null;
  var deniedAt = payload.deniedAt instanceof Date ? payload.deniedAt : null;

  if (payload.status === statuses.approved && !approvedAt) approvedAt = now;
  if (payload.status === statuses.denied && !deniedAt) deniedAt = now;

  if (!hasMatchingDate) {
    return {
      statusValue: action.nextStatus,
      processedAt: action.nextStatus === statuses.complete ? now : '',
      approvedAt: approvedAt || '',
      deniedAt: deniedAt || '',
      errorMessage: '',
      updated: false,
    };
  }

  var noteText = buildPinkSheetNoteText({
    statusValue: payload.status,
    submittedAtLabel: _formatPinkTimestamp(payload.submittedAt, tz),
    approvedAtLabel: approvedAt ? _formatPinkTimestamp(approvedAt, tz) : '',
    deniedAtLabel: deniedAt ? _formatPinkTimestamp(deniedAt, tz) : '',
  });
  var targetCell = sectionSheet.getRange(studentRow, colIndex + 1);

  if (action.writeAttendance) {
    targetCell.setValue(action.clearAttendance ? '' : getAttendanceValue('EXCUSED'));
  }

  if (action.writeNote) {
    targetCell.setNote(noteText);
  }

  return {
    statusValue: action.nextStatus,
    processedAt: action.nextStatus === statuses.complete ? now : '',
    approvedAt: approvedAt || '',
    deniedAt: deniedAt || '',
    errorMessage: '',
    updated: action.writeAttendance || action.writeNote,
  };
}

/**
 * Formats a timestamp for pink sheet notes using the shared note format.
 * Falls back to toString() when running under tests without Utilities.
 *
 * @param {Date|string} value
 * @param {string} tz
 * @returns {string}
 */
function _formatPinkTimestamp(value, tz) {
  if (!value) return '';
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  if (typeof Utilities !== 'undefined' && Utilities && Utilities.formatDate) {
    return Utilities.formatDate(date, tz, DATETIME_NOTE_FORMAT);
  }
  return date.toString();
}

/**
 * Processes Pink Sheet rows that are waiting to be applied.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {number}
 */
function processPinkSheetActions(ss) {
  var pinkSheet = getSheet('Pink Sheets');
  var allData = pinkSheet.getDataRange().getValues();
  if (allData.length < 2) return 0;

  var headers = allData[0];
  var headerMap = getPinkSheetHeaderMap(headers);
  var actionableStatuses = [getStatusValue('PENDING'), getStatusValue('APPROVED'), getStatusValue('DENIED')];
  var processed = 0;
  var lock = LockService.getScriptLock();

  lock.waitLock(30000);
  try {
    for (var i = 1; i < allData.length; i++) {
      var statusValue = String(allData[i][headerMap.status] || '').trim();
      if (actionableStatuses.indexOf(statusValue) === -1) continue;

      var payload = {
        submissionId: String(allData[i][headerMap.submissionId] || '').trim(),
        submittedAt:
          allData[i][headerMap.submittedAt] instanceof Date
            ? allData[i][headerMap.submittedAt]
            : new Date(allData[i][headerMap.submittedAt]),
        name: String(allData[i][headerMap.fullName] || '').trim(),
        section: String(allData[i][headerMap.section] || '').trim(),
        date: allData[i][headerMap.date],
        status: statusValue,
        approvedAt:
          headerMap.approvedAt !== -1 && allData[i][headerMap.approvedAt] instanceof Date
            ? allData[i][headerMap.approvedAt]
            : null,
        deniedAt:
          headerMap.deniedAt !== -1 && allData[i][headerMap.deniedAt] instanceof Date
            ? allData[i][headerMap.deniedAt]
            : null,
      };

      var outcome = processSinglePinkSheet(ss, payload);
      writePinkSheetOutcome(pinkSheet, headerMap, i + 1, outcome);
      if (outcome.updated) processed++;
    }

    SpreadsheetApp.flush();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }

  return processed;
}

/**
 * Reprocesses Pink Sheet rows for a newly added rehearsal date.
 *
 * @param {Date} targetDate
 * @returns {number}
 */
function processPinkSheetsForDate(targetDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pinkSheet = getSheet('Pink Sheets');
  var allData = pinkSheet.getDataRange().getValues();
  if (allData.length < 2) return 0;

  var headers = allData[0];
  var headerMap = getPinkSheetHeaderMap(headers);
  var statuses = [getStatusValue('PENDING'), getStatusValue('APPROVED'), getStatusValue('DENIED')];
  var processed = 0;
  var lock = LockService.getScriptLock();

  lock.waitLock(30000);
  try {
    for (var i = 1; i < allData.length; i++) {
      var statusValue = String(allData[i][headerMap.status] || '').trim();
      if (statuses.indexOf(statusValue) === -1) continue;

      var sheetDate =
        allData[i][headerMap.date] instanceof Date ? allData[i][headerMap.date] : new Date(allData[i][headerMap.date]);
      if (!isSameCalendarDate(sheetDate, targetDate)) continue;

      var payload = {
        submissionId: String(allData[i][headerMap.submissionId] || '').trim(),
        submittedAt:
          allData[i][headerMap.submittedAt] instanceof Date
            ? allData[i][headerMap.submittedAt]
            : new Date(allData[i][headerMap.submittedAt]),
        name: String(allData[i][headerMap.fullName] || '').trim(),
        section: String(allData[i][headerMap.section] || '').trim(),
        date: sheetDate,
        status: statusValue,
        approvedAt:
          headerMap.approvedAt !== -1 && allData[i][headerMap.approvedAt] instanceof Date
            ? allData[i][headerMap.approvedAt]
            : null,
        deniedAt:
          headerMap.deniedAt !== -1 && allData[i][headerMap.deniedAt] instanceof Date
            ? allData[i][headerMap.deniedAt]
            : null,
      };

      var outcome = processSinglePinkSheet(ss, payload);
      writePinkSheetOutcome(pinkSheet, headerMap, i + 1, outcome);
      if (outcome.updated) processed++;
    }

    SpreadsheetApp.flush();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }

  return processed;
}
