/** @OnlyCurrentDoc */

/**
 * Opens the DateAdd dialog so staff can specify a rehearsal date and time.
 * Replaces the stub in code.js.
 */
function addRehearsalDate() {
  var config = getConfig();
  var defaultTime = config[CONFIG_KEYS.REHEARSAL_START_TIME] || DEFAULT_CONFIG_VALUES[CONFIG_KEYS.REHEARSAL_START_TIME];

  var template = HtmlService.createTemplateFromFile('DateAddDialog');
  template.defaultTime = defaultTime;

  var html = template.evaluate().setWidth(320).setHeight(220).setTitle('Add Rehearsal Date');

  SpreadsheetApp.getUi().showModalDialog(html, 'Add Rehearsal Date');
}

/**
 * Parses a section-tab date header into a Date object.
 *
 * Handles:
 * - Headers that are already Date objects (Sheets auto-conversion)
 * - String headers in "M/D h:mm a" format (no year — appends current year)
 *
 * @param {*} headerValue - The raw header cell value.
 * @returns {Date|null} Parsed Date, or null if not a date header.
 */
function parseDateHeader(headerValue) {
  if (headerValue instanceof Date) {
    return headerValue;
  }

  if (typeof headerValue !== 'string' || !headerValue.trim()) {
    return null;
  }

  var str = headerValue.trim();

  // Expected format: "M/D h:mm a" e.g. "3/30 3:30 PM"
  // Append current year so Date.parse can handle it
  var match = str.match(/^(\d{1,2}\/\d{1,2})\s+(.+)$/);
  if (!match) return null;

  var datePart = match[1]; // "3/30"
  var timePart = match[2]; // "3:30 PM"
  var year = new Date().getFullYear();
  var candidate = new Date(datePart + '/' + year + ' ' + timePart);

  if (isNaN(candidate.getTime())) return null;
  return candidate;
}

/**
 * Inserts a new rehearsal date column across all section tabs in chronological order.
 * Called from the DateAdd dialog via google.script.run.
 *
 * @param {string} dateString - Date portion, e.g. "2026-04-09" (from input[type=date]).
 * @param {string} timeString - Time portion, e.g. "15:15" (from input[type=time]).
 */
function insertRehearsalDate(dateString, timeString) {
  // Build the Date object from dialog inputs
  var parts = dateString.split('-');
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) - 1;
  var day = parseInt(parts[2], 10);

  var timeParts = timeString.split(':');
  var hours = parseInt(timeParts[0], 10);
  var minutes = parseInt(timeParts[1], 10);

  var rehearsalDate = new Date(year, month, day, hours, minutes, 0);

  // Format header string: "M/d h:mm a" → e.g. "3/30 3:30 PM"
  var headerString = Utilities.formatDate(rehearsalDate, getAppTimezone(), 'M/d h:mm a');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabsProcessed = 0;
  var tabsSkipped = 0;

  var sectionTabs = getConfiguredSectionTabs();
  for (var t = 0; t < sectionTabs.length; t++) {
    var tabName = sectionTabs[t];
    var sheet = ss.getSheetByName(tabName);

    if (!sheet) {
      console.warn('DateAdd: tab not found — ' + tabName);
      continue;
    }

    var lastCol = sheet.getLastColumn();
    var lastRow = sheet.getLastRow();

    // Read header row (row 1)
    var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

    // Date columns start at col 2 (col 1 = Name)
    var dateHeaders = [];
    for (var c = 1; c < headers.length; c++) {
      var parsed = parseDateHeader(headers[c]);
      if (parsed) {
        dateHeaders.push({ col: c + 1, date: parsed }); // 1-based column index
      }
    }

    // Check for duplicate
    var isDuplicate = false;
    for (var d = 0; d < dateHeaders.length; d++) {
      if (dateHeaders[d].date.getTime() === rehearsalDate.getTime()) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) {
      console.log('DateAdd: skipping ' + tabName + ' — column already exists for ' + headerString);
      tabsSkipped++;
      continue;
    }

    // Find chronological insertion position
    var insertCol = -1;
    for (var i = 0; i < dateHeaders.length; i++) {
      if (rehearsalDate.getTime() < dateHeaders[i].date.getTime()) {
        insertCol = dateHeaders[i].col; // insert before this column
        break;
      }
    }

    var newCol;
    var copyFromCol;

    if (insertCol === -1) {
      // Append after the last date column (or after col 1 if no date columns exist)
      var afterCol = dateHeaders.length > 0 ? dateHeaders[dateHeaders.length - 1].col : 1;
      sheet.insertColumnAfter(afterCol);
      newCol = afterCol + 1;
      copyFromCol = dateHeaders.length > 0 ? afterCol : -1;
    } else {
      // Insert before the found position
      sheet.insertColumnBefore(insertCol);
      // The new column is now at insertCol; existing columns shifted right
      newCol = insertCol;
      copyFromCol = insertCol + 1;
    }

    // Set header
    sheet.getRange(1, newCol).setValue(headerString);

    // Copy formatting + data validation from adjacent column
    if (copyFromCol > 0 && lastRow > 1) {
      var source = sheet.getRange(2, copyFromCol, lastRow - 1, 1);
      var target = sheet.getRange(2, newCol, lastRow - 1, 1);
      source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    }

    tabsProcessed++;
  }

  SpreadsheetApp.flush();
  processPinkSheetsForDate(rehearsalDate);
  processPendingLateCheckInsForDate(rehearsalDate);

  var message = 'Added ' + headerString + ' to ' + tabsProcessed + ' tab(s).';
  if (tabsSkipped > 0) {
    message += ' Skipped ' + tabsSkipped + ' (already existed).';
  }
  ss.toast(message, 'DateAdd Complete');
  console.log('DateAdd: ' + message);
}

// ─── Delete Rehearsal Date ────────────────────────────────────────────────────

/**
 * Opens the Delete Date dialog, pre-populated with date columns found in the first
 * available section tab.
 */
function openDeleteDateDialog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dateOptions = [];

  var sectionTabs = getConfiguredSectionTabs();
  for (var t = 0; t < sectionTabs.length; t++) {
    var sheet = ss.getSheetByName(sectionTabs[t]);
    if (!sheet) continue;

    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) continue;

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    for (var c = 1; c < headers.length; c++) {
      var parsed = parseDateHeader(headers[c]);
      if (parsed) {
        dateOptions.push({ label: String(headers[c]), date: parsed.getTime() });
      }
    }
    break; // Use the first available tab's header row
  }

  // Sort chronologically so the dropdown is ordered
  dateOptions.sort(function (a, b) {
    return a.date - b.date;
  });

  var labels = dateOptions.map(function (o) {
    return o.label;
  });

  var template = HtmlService.createTemplateFromFile('DateDeleteDialog');
  template.dateOptions = labels;

  var html = template.evaluate().setWidth(320).setHeight(185).setTitle('Delete Rehearsal Date');
  SpreadsheetApp.getUi().showModalDialog(html, 'Delete Rehearsal Date');
}

/**
 * Deletes the column matching the given header string from every section tab.
 * Called from the DateDeleteDialog via google.script.run.
 *
 * @param {string} headerString - The exact header text, e.g. "3/30 3:30 PM".
 */
function deleteRehearsalDate(headerString) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabsProcessed = 0;
  var tabsSkipped = 0;
  var deletedDate = parseDateHeader(headerString);

  var sectionTabs = getConfiguredSectionTabs();
  for (var t = 0; t < sectionTabs.length; t++) {
    var tabName = sectionTabs[t];
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) continue;

    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      tabsSkipped++;
      continue;
    }

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var colToDelete = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]) === headerString) {
        colToDelete = c + 1; // 1-based
        break;
      }
    }

    if (colToDelete === -1) {
      tabsSkipped++;
      continue;
    }

    sheet.deleteColumn(colToDelete);
    tabsProcessed++;
  }

  SpreadsheetApp.flush();
  if (deletedDate) {
    resetQueuesForDeletedDate(deletedDate);
  }

  var message = 'Deleted "' + headerString + '" from ' + tabsProcessed + ' tab(s).';
  if (tabsSkipped > 0) {
    message += ' ' + tabsSkipped + ' tab(s) did not have this column.';
  }
  ss.toast(message, 'Delete Complete');
  console.log('DateDelete: ' + message);
}

/**
 * Resets Pink Sheet and Late Check-In rows that reference a deleted date so
 * they can be reprocessed if the date is added again later.
 *
 * @param {Date} deletedDate
 */
function resetQueuesForDeletedDate(deletedDate) {
  resetPinkSheetQueueForDeletedDate(deletedDate);
  resetLateQueueForDeletedDate(deletedDate);
}

/**
 * Resets matching Pink Sheet rows to Pending.
 *
 * @param {Date} deletedDate
 */
function resetPinkSheetQueueForDeletedDate(deletedDate) {
  var pinkSheet = getSheet('Pink Sheets');
  var allData = pinkSheet.getDataRange().getValues();
  if (allData.length < 2) return;

  var headers = allData[0];
  var headerMap = getPinkSheetHeaderMap(headers);
  var pendingStatus = getStatusValue('PENDING');

  for (var i = 1; i < allData.length; i++) {
    var sheetDate =
      allData[i][headerMap.date] instanceof Date ? allData[i][headerMap.date] : new Date(allData[i][headerMap.date]);
    if (!shouldResetQueueRowForDeletedDate(sheetDate, deletedDate)) continue;

    pinkSheet.getRange(i + 1, headerMap.status + 1).setValue(pendingStatus);
    if (headerMap.processedAt !== -1) {
      pinkSheet.getRange(i + 1, headerMap.processedAt + 1).setValue('');
    }
    if (headerMap.error !== -1) {
      pinkSheet.getRange(i + 1, headerMap.error + 1).setValue('');
    }
  }
}

/**
 * Resets matching Late Check-In rows to Pending.
 *
 * @param {Date} deletedDate
 */
function resetLateQueueForDeletedDate(deletedDate) {
  var lateSheet = getSheet('Late Check-Ins');
  var allData = lateSheet.getDataRange().getValues();
  if (allData.length < 2) return;

  var headers = allData[0];
  var headerMap = getLateCheckInHeaderMap(headers);
  var pendingStatus = getStatusValue('PENDING');

  for (var i = 1; i < allData.length; i++) {
    var arrival =
      allData[i][headerMap.arrivalTime] instanceof Date
        ? allData[i][headerMap.arrivalTime]
        : new Date(allData[i][headerMap.arrivalTime]);
    if (!shouldResetQueueRowForDeletedDate(arrival, deletedDate)) continue;

    lateSheet.getRange(i + 1, headerMap.status + 1).setValue(pendingStatus);
    if (headerMap.processedAt !== -1) {
      lateSheet.getRange(i + 1, headerMap.processedAt + 1).setValue('');
    }
    if (headerMap.error !== -1) {
      lateSheet.getRange(i + 1, headerMap.error + 1).setValue('');
    }
  }
}

// ─── Default Attendance Value ─────────────────────────────────────────────────

/**
 * Opens the dialog for viewing and changing the default attendance value.
 */
function openDefaultAttendanceDialog() {
  var current = PropertiesService.getScriptProperties().getProperty('DEFAULT_ATTENDANCE_VALUE') || '';

  var template = HtmlService.createTemplateFromFile('DefaultAttendanceDialog');
  template.currentDefault = current;

  var html = template.evaluate().setWidth(320).setHeight(210).setTitle('Default Attendance Value');
  SpreadsheetApp.getUi().showModalDialog(html, 'Default Attendance Value');
}

/**
 * Saves the default attendance value to Script Properties.
 * Called from DefaultAttendanceDialog via google.script.run.
 *
 * @param {string} value - The default value to fill into new date columns (empty string = blank).
 */
function setDefaultAttendanceValue(value) {
  PropertiesService.getScriptProperties().setProperty('DEFAULT_ATTENDANCE_VALUE', value == null ? '' : String(value));
}
