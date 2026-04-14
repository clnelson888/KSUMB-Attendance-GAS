/** @OnlyCurrentDoc */

/**
 * Opens the settings dialog for document-property backed configuration.
 */
function openSettingsDialog() {
  var template = HtmlService.createTemplateFromFile('SettingsDialog');
  template.settingsModel = getSettingsDialogModel();

  var html = template.evaluate().setWidth(560).setHeight(640).setTitle('Attendance Settings');
  SpreadsheetApp.getUi().showModalDialog(html, 'Attendance Settings');
}

/**
 * Returns the current settings model used by the dialog.
 *
 * @returns {{values: Object.<string, string>, defaults: Object.<string, string>, hasLegacyDataSheet: boolean}}
 */
function getSettingsDialogModel() {
  return {
    values: getEditableConfigValues(),
    defaults: buildDefaultSettingsPayload(),
    hasLegacyDataSheet: hasLegacyDataSheet(),
  };
}

/**
 * Persists settings from the dialog and applies any workbook-side changes.
 *
 * @param {Object.<string, *>} rawValues
 * @returns {string}
 */
function saveSettings(rawValues) {
  var normalized = normalizeSettingsPayload(rawValues || {});
  var errors = validateSettingsPayload(normalized);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  setConfigValues(normalized);
  resetConfigCache();

  var sectionUpdates = ensureConfiguredSectionTabsExist(SpreadsheetApp.getActiveSpreadsheet());
  applyExistingQueueStatusValidations(SpreadsheetApp.getActiveSpreadsheet());

  logSystemEvent(
    'Settings',
    'saveSettings',
    'INFO',
    '',
    'Saved attendance settings to document properties.'
  );

  return (
    'Saved settings to document properties.\n' +
    'Created ' +
    sectionUpdates.created +
    ' section tab(s) and initialized ' +
    sectionUpdates.headers +
    ' section header row(s).'
  );
}

/**
 * Restores settings to the code defaults.
 *
 * @returns {string}
 */
function resetSettingsToDefaults() {
  resetConfigPropertiesToDefaults();
  resetConfigCache();

  var sectionUpdates = ensureConfiguredSectionTabsExist(SpreadsheetApp.getActiveSpreadsheet());
  applyExistingQueueStatusValidations(SpreadsheetApp.getActiveSpreadsheet());

  logSystemEvent(
    'Settings',
    'resetSettingsToDefaults',
    'INFO',
    '',
    'Reset attendance settings to default values.'
  );

  return (
    'Restored default settings.\n' +
    'Created ' +
    sectionUpdates.created +
    ' section tab(s) and initialized ' +
    sectionUpdates.headers +
    ' section header row(s).'
  );
}

/**
 * Builds a stringified defaults object for dialog reset behavior.
 *
 * @returns {Object.<string, string>}
 */
function buildDefaultSettingsPayload() {
  var defaults = {};
  var keys = Object.keys(DEFAULT_CONFIG_VALUES);
  for (var i = 0; i < keys.length; i++) {
    defaults[keys[i]] = String(DEFAULT_CONFIG_VALUES[keys[i]]);
  }
  return defaults;
}

/**
 * Ensures all configured section tabs exist.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {{created: number, headers: number}}
 */
function ensureConfiguredSectionTabsExist(ss) {
  var sectionTabs = getConfiguredSectionTabs();
  var result = { created: 0, headers: 0 };

  for (var i = 0; i < sectionTabs.length; i++) {
    var ensured = ensureSheetExists(ss, sectionTabs[i]);
    if (ensured.created) {
      result.created++;
    }
    if (ensureHeaders(ensured.sheet, ['Name'])) {
      result.headers++;
    }
  }

  return result;
}

/**
 * Applies queue status validation to any existing queue sheets.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 */
function applyExistingQueueStatusValidations(ss) {
  var queueSheets = ['Pink Sheets', 'Late Check-Ins', 'Yellow Sheets'];
  for (var i = 0; i < queueSheets.length; i++) {
    var sheet = ss.getSheetByName(queueSheets[i]);
    if (sheet) applyQueueStatusValidation(sheet);
  }
}
