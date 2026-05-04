/** @OnlyCurrentDoc */

/**
 * Default section tab names. Used as a bootstrap fallback until settings are
 * saved into document properties.
 * @type {string[]}
 */
const DEFAULT_SECTION_TABS = [
  'Piccolo',
  'Clarinet',
  'Alto Sax',
  'Tenor Sax',
  'Trumpet',
  'Horn',
  'Trombone',
  'Baritone',
  'Tuba',
  'Percussion',
  'Classy Cats',
  'Color Guard',
  'Twirlers',
  'Drum Majors',
  'Student Staff',
];

/**
 * Settings keys used by the app.
 * @type {Object.<string, string>}
 */
const CONFIG_KEYS = {
  SECTION_TABS: 'SECTION_TABS',
  TIMEZONE: 'TIMEZONE',
  REHEARSAL_START_TIME: 'REHEARSAL_START_TIME',
  LATE_THRESHOLD_MINUTES: 'LATE_THRESHOLD_MINUTES',
  YELLOW_SHEET_THRESHOLD_MINUTES: 'YELLOW_SHEET_THRESHOLD_MINUTES',
  YELLOW_SHEET_THRESHOLD_MODE: 'YELLOW_SHEET_THRESHOLD_MODE',
  STATUS_PENDING: 'STATUS_PENDING',
  STATUS_APPROVED: 'STATUS_APPROVED',
  STATUS_DENIED: 'STATUS_DENIED',
  STATUS_COMPLETE: 'STATUS_COMPLETE',
  ATTENDANCE_PRESENT: 'ATTENDANCE_PRESENT',
  ATTENDANCE_TARDY: 'ATTENDANCE_TARDY',
  ATTENDANCE_ABSENT: 'ATTENDANCE_ABSENT',
  ATTENDANCE_EXCUSED: 'ATTENDANCE_EXCUSED',
  LATE_REASONS: 'LATE_REASONS',
  ROSTER_NOTE_COLUMNS: 'ROSTER_NOTE_COLUMNS',
};

const CONFIG_PROPERTY_PREFIX = 'CFG__';

/**
 * Shared Utilities.formatDate token used for the "Submitted/Approved/Denied"
 * lines in pink and yellow sheet notes. `h` = 12-hour, `mm` = zero-padded
 * minutes, `a` = AM/PM (SimpleDateFormat tokens).
 * @type {string}
 */
const DATETIME_NOTE_FORMAT = 'M/d/yyyy h:mm a';

/**
 * Placeholder header used for a single "example" date column that
 * clearAttendanceHistory leaves behind on every section tab so that
 * per-row data validation rules stay attached to a real column. When the
 * first real rehearsal date is inserted, the example column's header is
 * renamed in place rather than inserting a new column alongside it.
 * @type {string}
 */
const EXAMPLE_DATE_HEADER = '1/1 12:00 AM';

/**
 * Placeholder name written to row 2 of every section tab by systemReset so
 * that per-cell data validation rules on column A survive the roster wipe.
 * Roster sync overwrites this row when real members are synced in.
 * @type {string}
 */
const EXAMPLE_MEMBER_NAME = 'Wildcat, Willie';

/**
 * Default values written by initializeSystem() when a setting is missing.
 * @type {Object.<string, string|number>}
 */
const DEFAULT_CONFIG_VALUES = {};
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.SECTION_TABS] = DEFAULT_SECTION_TABS.join('\n');
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.TIMEZONE] = 'America/Chicago';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.REHEARSAL_START_TIME] = '15:30';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.LATE_THRESHOLD_MINUTES] = 10;
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.YELLOW_SHEET_THRESHOLD_MINUTES] = 15;
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.YELLOW_SHEET_THRESHOLD_MODE] = 'after_class_end';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_PENDING] = 'Pending';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_APPROVED] = 'Approved';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_DENIED] = 'Denied';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_COMPLETE] = 'Completed';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.ATTENDANCE_PRESENT] = 'Present';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.ATTENDANCE_TARDY] = 'Tardy';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.ATTENDANCE_ABSENT] = 'Absent';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.ATTENDANCE_EXCUSED] = 'Excused';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.LATE_REASONS] = [
  'Class',
  'Parking / traffic',
  'Work',
  'Personal emergency',
  'Other',
].join('\n');
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.ROSTER_NOTE_COLUMNS] = '';

/**
 * Logical status names used internally.
 * @type {Object.<string, string>}
 */
const STATUS_KEYS = {
  PENDING: CONFIG_KEYS.STATUS_PENDING,
  APPROVED: CONFIG_KEYS.STATUS_APPROVED,
  DENIED: CONFIG_KEYS.STATUS_DENIED,
  COMPLETE: CONFIG_KEYS.STATUS_COMPLETE,
};

/**
 * Logical attendance names used internally.
 * @type {Object.<string, string>}
 */
const ATTENDANCE_KEYS = {
  PRESENT: CONFIG_KEYS.ATTENDANCE_PRESENT,
  TARDY: CONFIG_KEYS.ATTENDANCE_TARDY,
  ABSENT: CONFIG_KEYS.ATTENDANCE_ABSENT,
  EXCUSED: CONFIG_KEYS.ATTENDANCE_EXCUSED,
};

/**
 * Memoized config cache. Reset each GAS execution.
 * @type {Object.<string, *>|null}
 */
let _configCache = null;

/**
 * Returns the property key used to persist a config value.
 *
 * @param {string} key
 * @returns {string}
 */
function getConfigPropertyKey(key) {
  return CONFIG_PROPERTY_PREFIX + String(key || '').trim();
}

/**
 * Returns the document property store when available.
 *
 * @returns {GoogleAppsScript.Properties.Properties|null}
 */
function getConfigPropertyStore() {
  if (typeof PropertiesService === 'undefined') return null;
  if (!PropertiesService || !PropertiesService.getDocumentProperties) return null;
  return PropertiesService.getDocumentProperties();
}

/**
 * Reads config values from document properties.
 *
 * @returns {Object.<string, string>}
 */
function getPropertyConfig() {
  var store = getConfigPropertyStore();
  if (!store) return {};

  var allProperties = store.getProperties();
  var config = {};
  var keys = Object.keys(CONFIG_KEYS);
  for (var i = 0; i < keys.length; i++) {
    var key = CONFIG_KEYS[keys[i]];
    var propertyKey = getConfigPropertyKey(key);
    if (Object.prototype.hasOwnProperty.call(allProperties, propertyKey)) {
      config[key] = allProperties[propertyKey];
    }
  }
  return config;
}

/**
 * Reads legacy key/value pairs from the Data sheet when present.
 *
 * @returns {Object.<string, *>}
 */
function getLegacyDataConfig() {
  if (typeof SpreadsheetApp === 'undefined') return {};

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return {};

  var dataSheet = ss.getSheetByName('Data');
  if (!dataSheet) return {};

  var values = null;
  var named = typeof ss.getRangeByName === 'function' ? ss.getRangeByName('DATA_CONFIG') : null;
  if (named) {
    values = named.getValues();
  } else if (typeof _detectTableRange === 'function') {
    try {
      values = _detectTableRange(dataSheet, ['Key'], 20);
    } catch (err) {
      values = null;
    }
  }

  if (!values) {
    var fallback = dataSheet.getDataRange && dataSheet.getDataRange();
    values = fallback ? fallback.getValues() : null;
  }

  if (!values || values.length < 2) return {};

  var config = {};
  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (!key) continue;
    config[key] = values[i][1];
  }
  return config;
}

/**
 * Reads config values from document properties first, then falls back to the
 * legacy Data sheet if present.
 *
 * @returns {Object.<string, *>}
 */
function getConfig() {
  if (_configCache) return _configCache;

  var config = getLegacyDataConfig();
  var propertyConfig = getPropertyConfig();
  var propertyKeys = Object.keys(propertyConfig);
  for (var i = 0; i < propertyKeys.length; i++) {
    config[propertyKeys[i]] = propertyConfig[propertyKeys[i]];
  }

  _configCache = config;
  return config;
}

/**
 * Resets the per-execution config cache.
 */
function resetConfigCache() {
  _configCache = null;
}

/**
 * Returns a config value or a fallback.
 *
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function getConfigValue(key, fallback) {
  var config = getConfig();
  if (Object.prototype.hasOwnProperty.call(config, key)) {
    return config[key];
  }
  return fallback;
}

/**
 * Returns a required config value or throws.
 *
 * @param {string} key
 * @returns {*}
 * @throws {Error}
 */
function requireConfigValue(key) {
  var value = getConfigValue(key, '');
  if (value === '' || value == null) {
    throw new Error('Missing required setting: ' + key);
  }
  return value;
}

/**
 * Returns the configured timezone.
 *
 * @returns {string}
 */
function getAppTimezone() {
  return String(getConfigValue(CONFIG_KEYS.TIMEZONE, DEFAULT_CONFIG_VALUES[CONFIG_KEYS.TIMEZONE]));
}

/**
 * Parses a newline or comma-delimited config value into a clean string list.
 *
 * @param {*} rawValue
 * @returns {string[]}
 */
function parseConfigList(rawValue) {
  if (rawValue == null) return [];
  return String(rawValue)
    .split(/\r?\n|,/)
    .map(function (value) {
      return value.trim();
    })
    .filter(function (value, index, values) {
      return value && values.indexOf(value) === index;
    });
}

/**
 * Returns the active section tab list from settings, falling back to the
 * bootstrap defaults if the system has not been initialized yet.
 *
 * @returns {string[]}
 */
function getConfiguredSectionTabs() {
  var configured = parseConfigList(getConfigValue(CONFIG_KEYS.SECTION_TABS, ''));
  return configured.length > 0 ? configured : DEFAULT_SECTION_TABS.slice();
}

/**
 * Returns the configured late-reason list.
 *
 * @returns {string[]}
 */
function getConfiguredLateReasons() {
  var configured = parseConfigList(getConfigValue(CONFIG_KEYS.LATE_REASONS, ''));
  if (configured.length > 0) return configured;
  return parseConfigList(DEFAULT_CONFIG_VALUES[CONFIG_KEYS.LATE_REASONS]);
}

/**
 * Returns the ordered list of Database column names whose values should be
 * appended to each member's name-cell note during a roster sync. Empty list
 * means no contact info is appended.
 *
 * @returns {string[]}
 */
function getConfiguredRosterNoteColumns() {
  return parseConfigList(getConfigValue(CONFIG_KEYS.ROSTER_NOTE_COLUMNS, ''));
}

/**
 * Returns a configured queue status string.
 *
 * @param {keyof typeof STATUS_KEYS|string} logicalName
 * @returns {string}
 */
function getStatusValue(logicalName) {
  var key = STATUS_KEYS[logicalName] || logicalName;
  var value = String(getConfigValue(key, DEFAULT_CONFIG_VALUES[key] || logicalName));
  if (key === CONFIG_KEYS.STATUS_COMPLETE && value.trim() === 'Complete') {
    return 'Completed';
  }
  return value;
}

/**
 * Returns true when a status value represents the terminal completed state,
 * including the legacy "Complete" spelling used by earlier builds.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isCompleteStatusValue(value) {
  var normalized = String(value || '').trim();
  return normalized === getStatusValue('COMPLETE') || normalized === 'Complete';
}

/**
 * Returns a configured attendance value.
 *
 * @param {keyof typeof ATTENDANCE_KEYS|string} logicalName
 * @returns {string}
 */
function getAttendanceValue(logicalName) {
  var key = ATTENDANCE_KEYS[logicalName] || logicalName;
  return String(getConfigValue(key, DEFAULT_CONFIG_VALUES[key] || logicalName));
}

/**
 * Returns the full settings payload used by the settings dialog.
 *
 * @returns {Object.<string, string>}
 */
function getEditableConfigValues() {
  var payload = {};
  var keys = Object.keys(DEFAULT_CONFIG_VALUES);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    payload[key] = String(getConfigValue(key, DEFAULT_CONFIG_VALUES[key]));
  }
  return payload;
}

/**
 * Persists settings into document properties.
 *
 * @param {Object.<string, *>} values
 * @returns {number} Number of keys written.
 */
function setConfigValues(values) {
  var store = getConfigPropertyStore();
  if (!store) {
    throw new Error('Document properties are not available in this environment.');
  }

  var propertyValues = {};
  var keys = Object.keys(DEFAULT_CONFIG_VALUES);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    propertyValues[getConfigPropertyKey(key)] = String(values[key] == null ? '' : values[key]);
  }

  store.setProperties(propertyValues, false);
  resetConfigCache();
  return Object.keys(propertyValues).length;
}

/**
 * Ensures every config key exists in document properties.
 *
 * @returns {number} Number of properties written.
 */
function ensureDefaultConfigProperties() {
  var store = getConfigPropertyStore();
  if (!store) return 0;

  var existing = store.getProperties();
  var toWrite = {};
  var keys = Object.keys(DEFAULT_CONFIG_VALUES);
  for (var i = 0; i < keys.length; i++) {
    var propertyKey = getConfigPropertyKey(keys[i]);
    if (!Object.prototype.hasOwnProperty.call(existing, propertyKey)) {
      toWrite[propertyKey] = String(DEFAULT_CONFIG_VALUES[keys[i]]);
    }
  }

  if (Object.keys(toWrite).length > 0) {
    store.setProperties(toWrite, false);
    resetConfigCache();
  }

  return Object.keys(toWrite).length;
}

/**
 * Imports legacy Data-sheet values into document properties.
 *
 * @param {boolean} overwriteExisting
 * @returns {number} Number of properties imported.
 */
function importLegacyDataConfigToProperties(overwriteExisting) {
  var store = getConfigPropertyStore();
  if (!store) return 0;

  var legacyConfig = getLegacyDataConfig();
  if (Object.keys(legacyConfig).length === 0) return 0;

  var existing = store.getProperties();
  var toWrite = {};
  var keys = Object.keys(DEFAULT_CONFIG_VALUES);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(legacyConfig, key)) continue;

    var propertyKey = getConfigPropertyKey(key);
    if (!overwriteExisting && Object.prototype.hasOwnProperty.call(existing, propertyKey)) continue;
    toWrite[propertyKey] = String(legacyConfig[key] == null ? '' : legacyConfig[key]);
  }

  if (Object.keys(toWrite).length > 0) {
    store.setProperties(toWrite, false);
    resetConfigCache();
  }

  return Object.keys(toWrite).length;
}

/**
 * Clears settings from document properties and restores defaults.
 *
 * @returns {number}
 */
function resetConfigPropertiesToDefaults() {
  var store = getConfigPropertyStore();
  if (!store) return 0;

  var keys = Object.keys(DEFAULT_CONFIG_VALUES);
  for (var i = 0; i < keys.length; i++) {
    store.deleteProperty(getConfigPropertyKey(keys[i]));
  }

  resetConfigCache();
  return ensureDefaultConfigProperties();
}

/**
 * Returns true when the legacy Data sheet is still present.
 *
 * @returns {boolean}
 */
function hasLegacyDataSheet() {
  if (typeof SpreadsheetApp === 'undefined') return false;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return !!(ss && ss.getSheetByName('Data'));
}
