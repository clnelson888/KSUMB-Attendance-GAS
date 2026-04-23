/** @OnlyCurrentDoc */

/**
 * Standard headers for system-managed tabs.
 * @type {Object.<string, string[]>}
 */
const SYSTEM_SHEET_HEADERS = {
  'Pink Sheets': [
    'Submission ID',
    'Submitted At',
    'Full Name',
    'Section',
    'Date',
    'Reason',
    'Status',
    'Approved At',
    'Denied At',
    'Processed At',
    'Error',
  ],
  'Late Check-Ins': [
    'Submission ID',
    'Submitted At',
    'Full Name',
    'Section',
    'Arrival Time',
    'Reason',
    'Other Explanation',
    'Status',
    'Processed At',
    'Error',
  ],
  'Yellow Sheets': [
    'Submission ID',
    'Response ID',
    'Submitted At',
    'Last Updated At',
    'Full Name',
    'Section',
    'Conflict Days',
    'Start Time',
    'End Time',
    'Notes',
    'Status',
    'Approved At',
    'Denied At',
    'Processed At',
    'Error',
  ],
  'System Log': ['Timestamp', 'Feature', 'Action', 'Severity', 'Reference ID', 'Message'],
};

/**
 * Returns all configured system sheet names.
 *
 * @returns {string[]}
 */
function getManagedSystemSheetNames() {
  return Object.keys(SYSTEM_SHEET_HEADERS);
}

/**
 * Creates a sheet if it does not exist.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} sheetName
 * @returns {{sheet: GoogleAppsScript.Spreadsheet.Sheet, created: boolean}}
 */
function ensureSheetExists(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    return { sheet: sheet, created: false };
  }

  return {
    sheet: ss.insertSheet(sheetName),
    created: true,
  };
}

/**
 * Ensures a sheet has the expected header row. Writes headers only when the
 * first row is empty to avoid overwriting existing data.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} headers
 * @returns {boolean} True if headers were written.
 */
function ensureHeaders(sheet, headers) {
  var existingHeader =
    sheet.getLastColumn() > 0
      ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]
      : [];
  var hasAnyHeaderValue = existingHeader.some(function (value) {
    return String(value || '').trim() !== '';
  });

  if (hasAnyHeaderValue) {
    return false;
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return true;
}

/**
 * Updates legacy status values to the current vocabulary. For Pink and Yellow
 * Sheets, the terminal "Completed"/"Complete" status no longer exists — rows
 * carrying that value are mapped back to Approved (or Denied, if a Denied At
 * timestamp was recorded). Late Check-Ins keep "Completed" as terminal.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {number} Number of cells updated.
 */
function normalizeLegacyStatusValues(ss) {
  var updates = 0;
  var propertyStore = getConfigPropertyStore();
  if (propertyStore) {
    var propertyKey = getConfigPropertyKey(CONFIG_KEYS.STATUS_COMPLETE);
    var propertyValue = String(propertyStore.getProperties()[propertyKey] || '').trim();
    if (propertyValue === 'Complete') {
      var normalizedProperty = {};
      normalizedProperty[propertyKey] = 'Completed';
      propertyStore.setProperties(normalizedProperty, false);
      updates++;
      resetConfigCache();
    }
  }

  var completedStatus = getStatusValue('COMPLETE');
  var approvedStatus = getStatusValue('APPROVED');
  var deniedStatus = getStatusValue('DENIED');

  // Late Check-Ins: only normalize 'Complete' -> 'Completed'.
  var lateSheet = ss.getSheetByName('Late Check-Ins');
  if (lateSheet && lateSheet.getLastRow() >= 2) {
    var lateHeaders = lateSheet.getRange(1, 1, 1, lateSheet.getLastColumn()).getValues()[0];
    var lateStatusIndex = lateHeaders.indexOf('Status');
    if (lateStatusIndex !== -1) {
      var lateStatusRange = lateSheet.getRange(2, lateStatusIndex + 1, lateSheet.getLastRow() - 1, 1);
      var lateStatusValues = lateStatusRange.getValues();
      var lateChanged = false;
      for (var lr = 0; lr < lateStatusValues.length; lr++) {
        if (String(lateStatusValues[lr][0] || '').trim() === 'Complete') {
          lateStatusValues[lr][0] = completedStatus;
          updates++;
          lateChanged = true;
        }
      }
      if (lateChanged) lateStatusRange.setValues(lateStatusValues);
    }
  }

  // Pink Sheets: remap terminal rows to Approved/Denied based on timestamps.
  var pinkSheet = ss.getSheetByName('Pink Sheets');
  if (pinkSheet && pinkSheet.getLastRow() >= 2) {
    var pinkHeaders = pinkSheet.getRange(1, 1, 1, pinkSheet.getLastColumn()).getValues()[0];
    var pinkStatusIndex = pinkHeaders.indexOf('Status');
    var pinkApprovedIndex = pinkHeaders.indexOf('Approved At');
    var pinkDeniedIndex = pinkHeaders.indexOf('Denied At');
    if (pinkStatusIndex !== -1) {
      var pinkRows = pinkSheet.getRange(2, 1, pinkSheet.getLastRow() - 1, pinkSheet.getLastColumn()).getValues();
      var pinkChanged = false;
      for (var pr = 0; pr < pinkRows.length; pr++) {
        if (!isCompleteStatusValue(pinkRows[pr][pinkStatusIndex])) continue;
        var pinkDeniedAt = pinkDeniedIndex !== -1 ? pinkRows[pr][pinkDeniedIndex] : '';
        pinkRows[pr][pinkStatusIndex] = pinkDeniedAt instanceof Date || pinkDeniedAt ? deniedStatus : approvedStatus;
        updates++;
        pinkChanged = true;
      }
      if (pinkChanged) {
        pinkSheet.getRange(2, 1, pinkRows.length, pinkRows[0].length).setValues(pinkRows);
      }
    }
  }

  // Yellow Sheets: remap terminal rows to Approved (no prior Denied At
  // column existed); backfill Approved At from Processed At when available.
  var yellowSheet = ss.getSheetByName('Yellow Sheets');
  if (yellowSheet && yellowSheet.getLastRow() >= 2) {
    var yellowHeaders = yellowSheet.getRange(1, 1, 1, yellowSheet.getLastColumn()).getValues()[0];
    var yellowStatusIndex = yellowHeaders.indexOf('Status');
    var yellowApprovedIndex = yellowHeaders.indexOf('Approved At');
    var yellowProcessedIndex = yellowHeaders.indexOf('Processed At');
    if (yellowStatusIndex !== -1) {
      var yellowRows = yellowSheet
        .getRange(2, 1, yellowSheet.getLastRow() - 1, yellowSheet.getLastColumn())
        .getValues();
      var yellowChanged = false;
      for (var yr = 0; yr < yellowRows.length; yr++) {
        if (!isCompleteStatusValue(yellowRows[yr][yellowStatusIndex])) continue;
        yellowRows[yr][yellowStatusIndex] = approvedStatus;
        if (
          yellowApprovedIndex !== -1 &&
          !yellowRows[yr][yellowApprovedIndex] &&
          yellowProcessedIndex !== -1 &&
          yellowRows[yr][yellowProcessedIndex]
        ) {
          yellowRows[yr][yellowApprovedIndex] = yellowRows[yr][yellowProcessedIndex];
        }
        updates++;
        yellowChanged = true;
      }
      if (yellowChanged) {
        yellowSheet.getRange(2, 1, yellowRows.length, yellowRows[0].length).setValues(yellowRows);
      }
    }
  }

  return updates;
}

/**
 * Writes a row to the System Log sheet if it exists.
 *
 * @param {string} feature
 * @param {string} action
 * @param {string} severity
 * @param {string} referenceId
 * @param {string} message
 */
function logSystemEvent(feature, action, severity, referenceId, message) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName('System Log');
  if (!logSheet) return;

  logSheet.appendRow([new Date(), feature, action, severity, referenceId || '', message || '']);
}

/**
 * Initializes the workbook support tabs, config rows, and queue validation.
 * Safe to re-run.
 */
function initializeSystem() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var results = [];

  for (var i = 0; i < getManagedSystemSheetNames().length; i++) {
    var sheetName = getManagedSystemSheetNames()[i];
    var ensured = ensureSheetExists(ss, sheetName);
    var wroteHeaders = ensureHeaders(ensured.sheet, SYSTEM_SHEET_HEADERS[sheetName]);

    results.push((ensured.created ? 'Created ' : 'Found ') + sheetName + (wroteHeaders ? ' and added headers' : ''));
  }

  var importedLegacyConfig = importLegacyDataConfigToProperties(false);
  var configPropertiesAdded = ensureDefaultConfigProperties();
  resetConfigCache();
  var legacyStatusUpdates = normalizeLegacyStatusValues(ss);
  resetConfigCache();

  var configuredSections = getConfiguredSectionTabs();
  for (var k = 0; k < configuredSections.length; k++) {
    var ensuredSection = ensureSheetExists(ss, configuredSections[k]);
    var wroteSectionHeaders = ensureHeaders(ensuredSection.sheet, ['Name']);
    if (ensuredSection.created || wroteSectionHeaders) {
      results.push((ensuredSection.created ? 'Created ' : 'Updated ') + 'section tab ' + configuredSections[k]);
    }
  }

  SpreadsheetApp.flush();
  logSystemEvent(
    'Admin',
    'initializeSystem',
    'INFO',
    '',
    'Initialized workbook support tabs. Imported ' +
      importedLegacyConfig +
      ' legacy setting(s), seeded ' +
      configPropertiesAdded +
      ' property default(s), and normalized ' +
      legacyStatusUpdates +
      ' legacy status value(s).'
  );

  SpreadsheetApp.getUi().alert(
    'Initialize System',
    results.join('\n') +
      '\n\nImported ' +
      importedLegacyConfig +
      ' legacy setting(s) from the Data tab.' +
      '\nSeeded ' +
      configPropertiesAdded +
      ' missing document property setting(s).' +
      '\nNormalized ' +
      legacyStatusUpdates +
      ' legacy status value(s).',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Validates the workbook schema and alerts the user with a readable report.
 */
function validateEnvironment() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var errors = [];
  var warnings = [];
  var info = [];

  var managedSheets = getManagedSystemSheetNames();
  for (var i = 0; i < managedSheets.length; i++) {
    var sheetName = managedSheets[i];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      errors.push('Missing sheet: ' + sheetName);
      continue;
    }

    var expectedHeaders = SYSTEM_SHEET_HEADERS[sheetName];
    var actualHeaders = sheet.getLastColumn() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];

    for (var h = 0; h < expectedHeaders.length; h++) {
      if (actualHeaders.indexOf(expectedHeaders[h]) === -1) {
        warnings.push('Sheet "' + sheetName + '" is missing header "' + expectedHeaders[h] + '".');
      }
    }
  }

  var configuredSections = getConfiguredSectionTabs();
  for (var j = 0; j < configuredSections.length; j++) {
    if (!ss.getSheetByName(configuredSections[j])) {
      errors.push('Missing section tab: ' + configuredSections[j]);
    }
  }

  var requiredConfigKeys = Object.keys(DEFAULT_CONFIG_VALUES);
  for (var k = 0; k < requiredConfigKeys.length; k++) {
    var value = getConfigValue(requiredConfigKeys[k], '');
    if (value === '' || value == null) {
      errors.push('Missing setting: ' + requiredConfigKeys[k]);
    }
  }

  info.push('Configured sections: ' + configuredSections.length);
  info.push('Timezone: ' + getAppTimezone());
  info.push('Settings storage: Document Properties');
  if (hasLegacyDataSheet()) {
    warnings.push('Legacy Data sheet is still present. It is no longer the primary config source.');
  }

  var reportParts = [];
  reportParts.push('Errors: ' + errors.length);
  reportParts.push('Warnings: ' + warnings.length);
  reportParts.push('');

  if (errors.length > 0) {
    reportParts.push('Errors');
    reportParts = reportParts.concat(errors);
    reportParts.push('');
  }

  if (warnings.length > 0) {
    reportParts.push('Warnings');
    reportParts = reportParts.concat(warnings);
    reportParts.push('');
  }

  reportParts.push('Info');
  reportParts = reportParts.concat(info);

  var report = reportParts.join('\n');

  logSystemEvent(
    'Admin',
    'validateEnvironment',
    errors.length > 0 ? 'ERROR' : 'INFO',
    '',
    'Environment validation completed with ' + errors.length + ' error(s) and ' + warnings.length + ' warning(s).'
  );

  SpreadsheetApp.getUi().alert('Environment Validation', report, SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}
