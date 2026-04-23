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
    approvedAt: headers.indexOf('Approved At'),
    deniedAt: headers.indexOf('Denied At'),
    processedAt: headers.indexOf('Processed At'),
    error: headers.indexOf('Error'),
  };
}

/**
 * Finds an existing Yellow Sheet row for a given Form response. Only matches
 * on Response ID so that legitimate edits to the same form response update
 * the row in place while every new form submission creates a new row — even
 * when the submitter is the same student with a different class conflict.
 *
 * @param {Array[]} allData
 * @param {Object} headerMap
 * @param {Object} payload
 * @returns {number} 1-based sheet row, or -1 if not found.
 */
function findExistingYellowSheetRow(allData, headerMap, payload) {
  if (!payload.responseId) return -1;
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][headerMap.responseId] || '').trim() === payload.responseId) {
      return i + 1;
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
 * Recomposes the section-tab name-cell note for a student from every Yellow
 * Sheet row currently in the queue for that student. Approved rows contribute
 * a class-conflict line; any pending row adds a "Pending Yellow Sheet" line
 * with the most recent submission timestamp.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} section
 * @param {string} name
 */
function rebuildYellowSheetNameCellNote(ss, section, name) {
  var nameCell = findYellowStudentNameCell(ss, section, name);
  if (!nameCell) return;

  var yellowSheet = ss.getSheetByName('Yellow Sheets');
  if (!yellowSheet || yellowSheet.getLastRow() < 2) {
    nameCell.setNote('');
    return;
  }

  var allData = yellowSheet.getDataRange().getValues();
  var headerMap = getYellowSheetHeaderMap(allData[0]);
  var approvedStatus = getStatusValue('APPROVED');
  var pendingStatus = getStatusValue('PENDING');

  var approvedLines = [];
  var hasPending = false;
  var mostRecentPendingSubmittedAt = null;

  for (var i = 1; i < allData.length; i++) {
    var rowSection = String(allData[i][headerMap.section] || '').trim();
    var rowName = String(allData[i][headerMap.fullName] || '').trim();
    if (rowSection !== section || rowName !== name) continue;

    var status = String(allData[i][headerMap.status] || '').trim();
    if (status === approvedStatus) {
      approvedLines.push(
        buildYellowSheetApprovedNote(
          String(allData[i][headerMap.conflictDays] || '').trim(),
          formatTimeValue(allData[i][headerMap.startTime]),
          formatTimeValue(allData[i][headerMap.endTime])
        )
      );
    } else if (status === pendingStatus) {
      hasPending = true;
      var submittedAt = allData[i][headerMap.submittedAt];
      var submittedDate = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
      if (!isNaN(submittedDate.getTime())) {
        if (!mostRecentPendingSubmittedAt || submittedDate > mostRecentPendingSubmittedAt) {
          mostRecentPendingSubmittedAt = submittedDate;
        }
      }
    }
  }

  var pendingLabel = mostRecentPendingSubmittedAt ? _formatYellowTimestamp(mostRecentPendingSubmittedAt) : '';

  nameCell.setNote(buildYellowSheetCombinedNote(approvedLines, hasPending, pendingLabel));
}

/**
 * Writes or updates a Yellow Sheet submission row. A form-response edit that
 * matches an existing Response ID updates that row in place (and reverts its
 * status to Pending); every other submission appends a new row so the full
 * history of conflicts per student is preserved.
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
  rowValues[headerMap.status] = getStatusValue('PENDING');
  if (headerMap.approvedAt !== -1) rowValues[headerMap.approvedAt] = '';
  if (headerMap.deniedAt !== -1) rowValues[headerMap.deniedAt] = '';
  rowValues[headerMap.processedAt] = '';
  rowValues[headerMap.error] = '';

  var targetRow = existingRow === -1 ? yellowSheet.getLastRow() + 1 : existingRow;
  yellowSheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);

  rebuildYellowSheetNameCellNote(ss, payload.section, payload.name);

  return targetRow;
}

/**
 * Formats a timestamp for yellow sheet notes using DATETIME_NOTE_FORMAT.
 *
 * @param {Date|string} value
 * @returns {string}
 */
function _formatYellowTimestamp(value) {
  if (!value) return '';
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  if (typeof Utilities !== 'undefined' && Utilities && Utilities.formatDate) {
    return Utilities.formatDate(date, getAppTimezone(), DATETIME_NOTE_FORMAT);
  }
  return date.toString();
}

/**
 * Processes actionable Yellow Sheet rows. Stamps first-set Approved At /
 * Denied At timestamps, stamps Processed At for audit, and recomposes each
 * affected student's section-tab name-cell note from their full set of
 * Yellow Sheets. Status is never overwritten by automation — staff decisions
 * remain the source of truth on the queue row.
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
  var approvedStatus = getStatusValue('APPROVED');
  var deniedStatus = getStatusValue('DENIED');
  var processed = 0;
  var affected = {};
  var lock = LockService.getScriptLock();

  lock.waitLock(30000);
  try {
    for (var i = 1; i < allData.length; i++) {
      var statusValue = String(allData[i][headerMap.status] || '').trim();
      if (statusValue !== approvedStatus && statusValue !== deniedStatus) continue;

      var name = String(allData[i][headerMap.fullName] || '').trim();
      var section = String(allData[i][headerMap.section] || '').trim();
      if (!name || !section) continue;

      var now = new Date();

      if (statusValue === approvedStatus && headerMap.approvedAt !== -1) {
        var existingApprovedAt = allData[i][headerMap.approvedAt];
        if (!(existingApprovedAt instanceof Date) && !existingApprovedAt) {
          yellowSheet.getRange(i + 1, headerMap.approvedAt + 1).setValue(now);
        }
      }
      if (statusValue === deniedStatus && headerMap.deniedAt !== -1) {
        var existingDeniedAt = allData[i][headerMap.deniedAt];
        if (!(existingDeniedAt instanceof Date) && !existingDeniedAt) {
          yellowSheet.getRange(i + 1, headerMap.deniedAt + 1).setValue(now);
        }
      }
      if (headerMap.processedAt !== -1) {
        yellowSheet.getRange(i + 1, headerMap.processedAt + 1).setValue(now);
      }
      if (headerMap.error !== -1) {
        yellowSheet.getRange(i + 1, headerMap.error + 1).setValue('');
      }

      affected[section + '||' + name] = { section: section, name: name };
      processed++;
    }

    var affectedKeys = Object.keys(affected);
    for (var k = 0; k < affectedKeys.length; k++) {
      rebuildYellowSheetNameCellNote(ss, affected[affectedKeys[k]].section, affected[affectedKeys[k]].name);
    }

    SpreadsheetApp.flush();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }

  return processed;
}
