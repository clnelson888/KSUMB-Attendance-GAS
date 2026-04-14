/** @OnlyCurrentDoc */

/**
 * Returns the header index map for the Yellow Sheets queue.
 *
 * @param {string[]} headers
 * @returns {Object.<string, number>}
 */
function getYellowSheetHeaderMap(headers) {
  return {
    submissionId: headers.indexOf('Submission ID'),
    responseId: headers.indexOf('Response ID'),
    submittedAt: headers.indexOf('Submitted At'),
    lastUpdatedAt: headers.indexOf('Last Updated At'),
    fullName: headers.indexOf('Full Name'),
    section: headers.indexOf('Section'),
    conflictDays: headers.indexOf('Conflict Days'),
    startTime: headers.indexOf('Start Time'),
    endTime: headers.indexOf('End Time'),
    notes: headers.indexOf('Notes'),
    status: headers.indexOf('Status'),
    processedAt: headers.indexOf('Processed At'),
    error: headers.indexOf('Error'),
  };
}

/**
 * Finds an existing Yellow Sheet row by response ID or full name.
 *
 * @param {Array[]} allData
 * @param {Object} headerMap
 * @param {Object} payload
 * @returns {number}
 */
function findExistingYellowSheetRow(allData, headerMap, payload) {
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][headerMap.responseId] || '').trim() === payload.responseId && payload.responseId) {
      return i + 1;
    }
  }

  for (var j = 1; j < allData.length; j++) {
    if (String(allData[j][headerMap.fullName] || '').trim() === payload.name) {
      return j + 1;
    }
  }

  return -1;
}

/**
 * Finds the name cell for a student in a section tab.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} section
 * @param {string} name
 * @returns {GoogleAppsScript.Spreadsheet.Range|null}
 */
function findYellowStudentNameCell(ss, section, name) {
  var sheet = ss.getSheetByName(section);
  if (!sheet) return null;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0] || '').trim() === name) {
      return sheet.getRange(i + 2, 1);
    }
  }

  return null;
}

/**
 * Writes or updates a Yellow Sheet submission row.
 *
 * @param {Object} payload
 * @returns {number} Sheet row index.
 */
function upsertYellowSheetSubmission(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var yellowSheet = getSheet('Yellow Sheets');
  var allData = yellowSheet.getDataRange().getValues();
  var headers = allData[0];
  var headerMap = getYellowSheetHeaderMap(headers);
  var existingRow = findExistingYellowSheetRow(allData, headerMap, payload);
  var previousStatus = '';

  if (existingRow !== -1) {
    previousStatus = String(yellowSheet.getRange(existingRow, headerMap.status + 1).getValue() || '').trim();
  }

  var nextStatus = getYellowSubmissionStatus(previousStatus, {
    pending: getStatusValue('PENDING'),
    complete: getStatusValue('COMPLETE'),
  });

  var rowValues = [];
  for (var i = 0; i < headers.length; i++) rowValues.push('');
  rowValues[headerMap.submissionId] = payload.submissionId;
  rowValues[headerMap.responseId] = payload.responseId;
  rowValues[headerMap.submittedAt] = payload.submittedAt;
  rowValues[headerMap.lastUpdatedAt] = payload.lastUpdatedAt;
  rowValues[headerMap.fullName] = payload.name;
  rowValues[headerMap.section] = payload.section;
  rowValues[headerMap.conflictDays] = payload.days;
  rowValues[headerMap.startTime] = payload.startTime;
  rowValues[headerMap.endTime] = payload.endTime;
  rowValues[headerMap.notes] = payload.notes;
  rowValues[headerMap.status] = nextStatus;
  rowValues[headerMap.processedAt] = '';
  rowValues[headerMap.error] = '';

  var targetRow = existingRow === -1 ? yellowSheet.getLastRow() + 1 : existingRow;
  yellowSheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);

  if (existingRow !== -1 && isCompleteStatusValue(previousStatus)) {
    var nameCell = findYellowStudentNameCell(ss, payload.section, payload.name);
    if (nameCell) {
      nameCell.setNote(getPendingYellowSheetNoteText());
    }
  }

  return targetRow;
}

/**
 * Processes actionable Yellow Sheet rows and updates section-name notes.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {number}
 */
function processYellowSheetActions(ss) {
  var yellowSheet = getSheet('Yellow Sheets');
  var allData = yellowSheet.getDataRange().getValues();
  if (allData.length < 2) return 0;

  var headers = allData[0];
  var headerMap = getYellowSheetHeaderMap(headers);
  var completeStatus = getStatusValue('COMPLETE');
  var approvedStatus = getStatusValue('APPROVED');
  var deniedStatus = getStatusValue('DENIED');
  var processed = 0;
  var lock = LockService.getScriptLock();

  lock.waitLock(30000);
  try {
    for (var i = 1; i < allData.length; i++) {
      var statusValue = String(allData[i][headerMap.status] || '').trim();
      if (statusValue !== approvedStatus && statusValue !== deniedStatus) continue;

      var name = String(allData[i][headerMap.fullName] || '').trim();
      var section = String(allData[i][headerMap.section] || '').trim();
      var nameCell = findYellowStudentNameCell(ss, section, name);
      if (!nameCell) continue;

      if (statusValue === approvedStatus) {
        nameCell.setNote(
          buildYellowSheetApprovedNote(
            String(allData[i][headerMap.conflictDays] || '').trim(),
            formatTimeValue(allData[i][headerMap.startTime]),
            formatTimeValue(allData[i][headerMap.endTime])
          )
        );
      } else {
        nameCell.setNote('');
      }

      yellowSheet.getRange(i + 1, headerMap.status + 1).setValue(completeStatus);
      if (headerMap.processedAt !== -1) {
        yellowSheet.getRange(i + 1, headerMap.processedAt + 1).setValue(new Date());
      }
      if (headerMap.error !== -1) {
        yellowSheet.getRange(i + 1, headerMap.error + 1).setValue('');
      }
      processed++;
    }

    SpreadsheetApp.flush();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }

  return processed;
}
