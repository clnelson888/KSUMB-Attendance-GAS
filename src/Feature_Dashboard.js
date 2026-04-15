/** @OnlyCurrentDoc */

/**
 * Opens the unified operations dashboard inside the spreadsheet UI.
 */
function openOperationsDashboard() {
  var html = createOperationsDashboardTemplate_()
    .evaluate()
    .setTitle('Attendance Operations Dashboard')
    .setWidth(1480)
    .setHeight(980);

  SpreadsheetApp.getUi().showModelessDialog(html, 'Attendance Operations Dashboard');
}

/**
 * Web app entry point for the dashboard.
 *
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet() {
  return createOperationsDashboardTemplate_()
    .evaluate()
    .setTitle('Attendance Operations Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Creates the dashboard template.
 *
 * @returns {GoogleAppsScript.HTML.HtmlTemplate}
 */
function createOperationsDashboardTemplate_() {
  var template = HtmlService.createTemplateFromFile('OperationsDashboard');
  template.appName = 'KSUMB Attendance Operations';
  return template;
}

/**
 * Returns all data required to render the operations dashboard.
 *
 * @returns {Object}
 */
function getDashboardState() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var validation = collectEnvironmentValidation_();

  return {
    generatedAt: new Date().toISOString(),
    spreadsheet: {
      id: ss.getId(),
      name: ss.getName(),
      url: ss.getUrl(),
      timezone: ss.getSpreadsheetTimeZone(),
    },
    health: {
      errors: validation.errors,
      warnings: validation.warnings,
      info: validation.info,
      counts: {
        errors: validation.errors.length,
        warnings: validation.warnings.length,
      },
    },
    settings: getSettingsDialogModel(),
    defaultAttendanceValue: getDefaultAttendanceValue_(),
    sections: getDashboardSectionsSnapshot_(),
    queues: getDashboardQueuesSnapshot_(),
    forms: getDashboardFormsSnapshot_(),
    logs: getDashboardLogSnapshot_(),
  };
}

/**
 * Executes a named dashboard action.
 *
 * @param {string} action
 * @param {Object=} payload
 * @returns {{message: string}}
 */
function runDashboardAction(action, payload) {
  payload = payload || {};

  switch (action) {
    case 'initializeSystem':
      return { message: initializeSystemForDashboard_() };
    case 'validateEnvironment':
      return { message: collectEnvironmentValidation_().report };
    case 'saveSettings':
      return { message: saveSettings(payload.values || {}) };
    case 'resetSettings':
      return { message: resetSettingsToDefaults() };
    case 'setDefaultAttendance':
      setDefaultAttendanceValue(payload.value || '');
      return { message: 'Default attendance value saved.' };
    case 'addDate':
      insertRehearsalDate(payload.dateString, payload.timeString);
      return { message: 'Rehearsal date added.' };
    case 'deleteDate':
      deleteRehearsalDate(payload.headerString);
      return { message: 'Rehearsal date deleted.' };
    case 'buildForms':
      return { message: buildAllFormsForDashboard_() };
    case 'syncRoster':
      return { message: syncRosterFromDatabaseForDashboard_() };
    case 'syncForms':
      return { message: syncRosterToFormsForDashboard_() };
    case 'processQueues':
      return { message: processApprovedRequestsForDashboard_() };
    case 'generateConcernList':
      return { message: generateConcernListForDashboard_() };
    case 'clearAttendanceHistory':
      return { message: clearAttendanceHistoryForDashboard_() };
    case 'newYearSetup':
      return { message: newYearSetupForDashboard_() };
    default:
      throw new Error('Unknown dashboard action: ' + action);
  }
}

/**
 * Creates a UI-free environment validation payload.
 *
 * @returns {{errors: string[], warnings: string[], info: string[], report: string}}
 */
function collectEnvironmentValidation_() {
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

  return {
    errors: errors,
    warnings: warnings,
    info: info,
    report: reportParts.join('\n'),
  };
}

/**
 * Initializes the workbook without UI prompts.
 *
 * @returns {string}
 */
function initializeSystemForDashboard_() {
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

  var queueSheets = ['Pink Sheets', 'Late Check-Ins', 'Yellow Sheets'];
  for (var j = 0; j < queueSheets.length; j++) {
    var queueSheet = ss.getSheetByName(queueSheets[j]);
    if (queueSheet) applyQueueStatusValidation(queueSheet);
  }

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

  return (
    results.join('\n') +
    '\n\nImported ' +
    importedLegacyConfig +
    ' legacy setting(s) from the Data tab.' +
    '\nSeeded ' +
    configPropertiesAdded +
    ' missing document property setting(s).' +
    '\nNormalized ' +
    legacyStatusUpdates +
    ' legacy status value(s).'
  );
}

/**
 * Returns dashboard metrics for section tabs and rehearsal dates.
 *
 * @returns {Object}
 */
function getDashboardSectionsSnapshot_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sectionNames = getConfiguredSectionTabs();
  var items = [];
  var totalMembers = 0;
  var allDateLabels = [];

  for (var i = 0; i < sectionNames.length; i++) {
    var sheet = ss.getSheetByName(sectionNames[i]);
    if (!sheet) {
      items.push({
        name: sectionNames[i],
        exists: false,
        members: 0,
      });
      continue;
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var memberCount = 0;
    if (lastRow > 1) {
      var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var r = 0; r < names.length; r++) {
        if (String(names[r][0] || '').trim()) {
          memberCount++;
        }
      }
    }
    totalMembers += memberCount;

    if (allDateLabels.length === 0 && lastCol > 1) {
      var headers = sheet.getRange(1, 2, 1, lastCol - 1).getValues()[0];
      for (var c = 0; c < headers.length; c++) {
        if (parseDateHeader(headers[c])) {
          allDateLabels.push(String(headers[c]));
        }
      }
    }

    items.push({
      name: sectionNames[i],
      exists: true,
      members: memberCount,
    });
  }

  return {
    totalSections: sectionNames.length,
    totalMembers: totalMembers,
    dateCount: allDateLabels.length,
    nextDates: allDateLabels.slice(0, 8),
    allDates: allDateLabels,
    items: items,
  };
}

/**
 * Returns queue counts and recent rows.
 *
 * @returns {Object}
 */
function getDashboardQueuesSnapshot_() {
  return {
    pink: buildQueueSnapshot_('Pink Sheets', {
      submittedAt: 'Submitted At',
      status: 'Status',
      name: 'Full Name',
      section: 'Section',
      detail: 'Date',
    }),
    late: buildQueueSnapshot_('Late Check-Ins', {
      submittedAt: 'Submitted At',
      status: 'Status',
      name: 'Full Name',
      section: 'Section',
      detail: 'Arrival Time',
    }),
    yellow: buildQueueSnapshot_('Yellow Sheets', {
      submittedAt: 'Submitted At',
      status: 'Status',
      name: 'Full Name',
      section: 'Section',
      detail: 'Conflict Days',
    }),
  };
}

/**
 * Builds a generic queue summary.
 *
 * @param {string} sheetName
 * @param {Object} columns
 * @returns {Object}
 */
function buildQueueSnapshot_(sheetName, columns) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
    return {
      sheetName: sheetName,
      total: 0,
      counts: {},
      items: [],
    };
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = data.slice(1);
  var statusIndex = headers.indexOf(columns.status);
  var submittedIndex = headers.indexOf(columns.submittedAt);
  var nameIndex = headers.indexOf(columns.name);
  var sectionIndex = headers.indexOf(columns.section);
  var detailIndex = headers.indexOf(columns.detail);
  var counts = {};
  var items = [];

  for (var i = 0; i < rows.length; i++) {
    var status = statusIndex === -1 ? '' : String(rows[i][statusIndex] || '').trim();
    counts[status || 'Unspecified'] = (counts[status || 'Unspecified'] || 0) + 1;

    items.push({
      submittedAt: submittedIndex === -1 ? '' : formatDashboardDateTime_(rows[i][submittedIndex]),
      status: status,
      name: nameIndex === -1 ? '' : String(rows[i][nameIndex] || ''),
      section: sectionIndex === -1 ? '' : String(rows[i][sectionIndex] || ''),
      detail: detailIndex === -1 ? '' : formatDashboardDateTime_(rows[i][detailIndex]),
    });
  }

  items.sort(function (a, b) {
    return String(b.submittedAt).localeCompare(String(a.submittedAt));
  });

  return {
    sheetName: sheetName,
    total: rows.length,
    counts: counts,
    items: items.slice(0, 8),
  };
}

/**
 * Returns form status and quick links.
 *
 * @returns {Object[]}
 */
function getDashboardFormsSnapshot_() {
  var ids = _getStoredFormIds();
  var keys = [
    { key: 'PINK', label: 'Pink Sheet' },
    { key: 'LATE', label: 'Late Check-In' },
    { key: 'YELLOW', label: 'Yellow Sheet' },
  ];
  var results = [];

  for (var i = 0; i < keys.length; i++) {
    var formId = ids[keys[i].key];
    var item = {
      key: keys[i].key,
      label: keys[i].label,
      id: formId || '',
      built: !!formId,
      publishedUrl: '',
      editUrl: '',
      title: '',
    };

    if (formId) {
      try {
        var form = FormApp.openById(formId);
        item.title = form.getTitle();
        item.publishedUrl = form.getPublishedUrl();
        item.editUrl = form.getEditUrl();
      } catch (err) {
        item.error = err.message;
      }
    }

    results.push(item);
  }

  return results;
}

/**
 * Returns recent system log rows.
 *
 * @returns {Object[]}
 */
function getDashboardLogSnapshot_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System Log');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = data.slice(1);
  var timestampIndex = headers.indexOf('Timestamp');
  var featureIndex = headers.indexOf('Feature');
  var actionIndex = headers.indexOf('Action');
  var severityIndex = headers.indexOf('Severity');
  var messageIndex = headers.indexOf('Message');
  var items = [];

  for (var i = Math.max(rows.length - 10, 0); i < rows.length; i++) {
    items.push({
      timestamp: timestampIndex === -1 ? '' : formatDashboardDateTime_(rows[i][timestampIndex]),
      feature: featureIndex === -1 ? '' : String(rows[i][featureIndex] || ''),
      action: actionIndex === -1 ? '' : String(rows[i][actionIndex] || ''),
      severity: severityIndex === -1 ? '' : String(rows[i][severityIndex] || ''),
      message: messageIndex === -1 ? '' : String(rows[i][messageIndex] || ''),
    });
  }

  return items.reverse();
}

/**
 * Returns the current default attendance script property.
 *
 * @returns {string}
 */
function getDefaultAttendanceValue_() {
  return PropertiesService.getScriptProperties().getProperty('DEFAULT_ATTENDANCE_VALUE') || '';
}

/**
 * Formats dates for dashboard display.
 *
 * @param {*} value
 * @returns {string}
 */
function formatDashboardDateTime_(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, getAppTimezone(), 'MMM d, yyyy h:mm a');
  }
  return String(value);
}

/**
 * Rebuilds forms without spreadsheet UI prompts.
 *
 * @returns {string}
 */
function buildAllFormsForDashboard_() {
  var props = PropertiesService.getScriptProperties();
  var existingIds = _getStoredFormIds();

  _trashForm(existingIds.PINK);
  _trashForm(existingIds.LATE);
  _trashForm(existingIds.YELLOW);

  var roster = _getRosterData();
  var pink = _buildPinkForm(roster.namesBySection);
  props.setProperty(_PROP_PINK, pink.getId());

  var late = _buildLateForm(roster.namesBySection);
  props.setProperty(_PROP_LATE, late.getId());

  var yellow = _buildYellowForm(roster.namesBySection);
  props.setProperty(_PROP_YELLOW, yellow.getId());

  installFormSubmitTriggers();

  logSystemEvent(
    'FormBuilder',
    'buildAllFormsForDashboard',
    'INFO',
    '',
    'Rebuilt all forms from the operations dashboard.'
  );

  return (
    'Forms rebuilt. Pink=' +
    pink.getId() +
    ', Late=' +
    late.getId() +
    ', Yellow=' +
    yellow.getId() +
    (existingIds.PINK || existingIds.LATE || existingIds.YELLOW ? '. Existing forms were moved to trash first.' : '.')
  );
}

/**
 * Dashboard-safe roster sync.
 *
 * @returns {string}
 */
function syncRosterFromDatabaseForDashboard_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rosterBySection = getDatabaseRosterBySection();
  var existingRecords = collectExistingSectionRecords(ss);
  var sectionTabs = getConfiguredSectionTabs();
  var lock = LockService.getScriptLock();
  var summary = [];

  lock.waitLock(30000);
  try {
    for (var i = 0; i < sectionTabs.length; i++) {
      var sectionName = sectionTabs[i];
      var sheet = ss.getSheetByName(sectionName);
      if (!sheet) continue;

      var lastCol = Math.max(sheet.getLastColumn(), 1);
      var memberNames = rosterBySection[sectionName] || [];
      var sectionRows = buildSectionSyncRows(memberNames, lastCol, existingRecords);
      var existingDataRowCount = Math.max(sheet.getLastRow() - 1, 0);

      if (existingDataRowCount > 0) {
        sheet.getRange(2, 1, existingDataRowCount, lastCol).clearContent().clearNote();
      }

      if (sectionRows.values.length > 0) {
        sheet.getRange(2, 1, sectionRows.values.length, lastCol).setValues(sectionRows.values);
        sheet.getRange(2, 1, sectionRows.notes.length, lastCol).setNotes(sectionRows.notes);
      }

      summary.push(sectionName + ': ' + memberNames.length + ' member(s)');
    }

    SpreadsheetApp.flush();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }

  syncRosterToFormsForDashboard_();
  logSystemEvent(
    'RosterSync',
    'syncRosterFromDatabaseForDashboard',
    'INFO',
    '',
    'Roster sync completed from dashboard.'
  );
  return summary.join('\n');
}

/**
 * Dashboard-safe form roster sync.
 *
 * @returns {string}
 */
function syncRosterToFormsForDashboard_() {
  var ids = _getStoredFormIds();
  if (!ids.PINK && !ids.LATE && !ids.YELLOW) {
    throw new Error('No forms have been built yet. Build forms before syncing roster names to forms.');
  }

  var roster = _getRosterData();
  var namesBySection = roster.namesBySection;
  var updatedQuestions = 0;
  var formIds = [ids.PINK, ids.LATE, ids.YELLOW];

  for (var i = 0; i < formIds.length; i++) {
    if (!formIds[i]) continue;
    updatedQuestions += _syncFormSectionNameLists(FormApp.openById(formIds[i]), namesBySection);
  }

  var message = 'Synced ' + roster.allNames.length + ' member(s) across ' + updatedQuestions + ' form question(s).';
  logSystemEvent('FormSync', 'syncRosterToFormsForDashboard', 'INFO', '', message);
  return message;
}

/**
 * Dashboard-safe queue processing.
 *
 * @returns {string}
 */
function processApprovedRequestsForDashboard_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pinkCount = processApprovedPinkSheets(ss);
  var yellowCount = processApprovedYellowSheets(ss);
  SpreadsheetApp.flush();

  var total = pinkCount + yellowCount;
  var message =
    total === 0
      ? 'No approved requests to process.'
      : 'Processed ' + total + ' request(s): ' + pinkCount + ' pink, ' + yellowCount + ' yellow.';

  logSystemEvent('QueueProcessor', 'processApprovedRequestsForDashboard', 'INFO', '', message);
  return message;
}

/**
 * Dashboard-safe concern list refresh.
 *
 * @returns {string}
 */
function generateConcernListForDashboard_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var concernSheet = getSheet('Concern List');
  var sectionTabs = getConfiguredSectionTabs();
  var dateOptions = getConcernListDateOptions(ss, sectionTabs);
  var presentValue = getAttendanceValue('PRESENT');

  configureConcernListSheet(concernSheet, dateOptions, presentValue, sectionTabs);
  logSystemEvent('ConcernList', 'generateConcernListForDashboard', 'INFO', '', 'Concern list formulas refreshed.');
  return 'Concern List formulas refreshed.';
}

/**
 * Dashboard-safe attendance history clear.
 *
 * @returns {string}
 */
function clearAttendanceHistoryForDashboard_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sectionTabs = getConfiguredSectionTabs();
  var lock = LockService.getScriptLock();
  var cleared = 0;

  lock.waitLock(30000);
  try {
    for (var i = 0; i < sectionTabs.length; i++) {
      var sheet = ss.getSheetByName(sectionTabs[i]);
      if (!sheet) continue;

      var lastCol = sheet.getLastColumn();
      if (lastCol <= 1) continue;

      sheet.deleteColumns(2, lastCol - 1);
      cleared++;
    }

    SpreadsheetApp.flush();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }

  logSystemEvent(
    'Maintenance',
    'clearAttendanceHistoryForDashboard',
    'INFO',
    '',
    'Cleared attendance history from ' + cleared + ' section tab(s).'
  );
  return 'Cleared attendance history from ' + cleared + ' section tab(s).';
}

/**
 * Dashboard-safe new year setup.
 *
 * @returns {string}
 */
function newYearSetupForDashboard_() {
  var historyMessage = clearAttendanceHistoryForDashboard_();
  var queueSheets = ['Pink Sheets', 'Late Check-Ins', 'Yellow Sheets'];

  for (var i = 0; i < queueSheets.length; i++) {
    clearManagedSheetData(queueSheets[i]);
  }

  clearYellowSheetNotesFromSections();
  logSystemEvent('Maintenance', 'newYearSetupForDashboard', 'INFO', '', 'Completed New Year Setup from dashboard.');
  return historyMessage + '\nQueue logs and Yellow Sheet notes were also cleared.';
}
