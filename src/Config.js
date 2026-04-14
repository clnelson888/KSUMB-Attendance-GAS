/** @OnlyCurrentDoc */

/**
 * Default section tab names. Used as a bootstrap fallback until the Data tab
 * is initialized with SECTION_TABS.
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
 * Data-tab key names used by the app.
 * @type {Object.<string, string>}
 */
const CONFIG_KEYS = {
  SECTION_TABS: 'SECTION_TABS',
  TIMEZONE: 'TIMEZONE',
  REHEARSAL_START_TIME: 'REHEARSAL_START_TIME',
  LATE_THRESHOLD_MINUTES: 'LATE_THRESHOLD_MINUTES',
  STATUS_PENDING: 'STATUS_PENDING',
  STATUS_APPROVED: 'STATUS_APPROVED',
  STATUS_DENIED: 'STATUS_DENIED',
  STATUS_COMPLETE: 'STATUS_COMPLETE',
  ATTENDANCE_PRESENT: 'ATTENDANCE_PRESENT',
  ATTENDANCE_TARDY: 'ATTENDANCE_TARDY',
  ATTENDANCE_ABSENT: 'ATTENDANCE_ABSENT',
  ATTENDANCE_EXCUSED: 'ATTENDANCE_EXCUSED',
  LATE_REASONS: 'LATE_REASONS',
};

/**
 * Default values written by initializeSystem() when a key is missing.
 * @type {Object.<string, string|number>}
 */
const DEFAULT_CONFIG_VALUES = {};
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.SECTION_TABS] = DEFAULT_SECTION_TABS.join('\n');
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.TIMEZONE] = 'America/Chicago';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.REHEARSAL_START_TIME] = '15:30';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.LATE_THRESHOLD_MINUTES] = 15;
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_PENDING] = 'Pending';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_APPROVED] = 'Approved';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_DENIED] = 'Denied';
DEFAULT_CONFIG_VALUES[CONFIG_KEYS.STATUS_COMPLETE] = 'Complete';
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
 * Reads key/value pairs from the Data tab and returns them as an object.
 * Memoized for the duration of a single GAS execution.
 *
 * Expects columns: Key (col A), Value (col B).
 *
 * @returns {Object.<string, *>} Config map.
 */
function getConfig() {
  if (_configCache) return _configCache;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dataSheet = ss.getSheetByName('Data');
  var config = {};

  if (!dataSheet) {
    _configCache = config;
    return config;
  }

  var data = dataSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var key = data[i][0];
    var value = data[i][1];
    if (key) {
      config[String(key).trim()] = value;
    }
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
    throw new Error('Missing required Data config key: ' + key);
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
 * Returns the active section tab list from the Data tab, falling back to the
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
 * Returns a configured queue status string.
 *
 * @param {keyof typeof STATUS_KEYS|string} logicalName
 * @returns {string}
 */
function getStatusValue(logicalName) {
  var key = STATUS_KEYS[logicalName] || logicalName;
  return String(getConfigValue(key, DEFAULT_CONFIG_VALUES[key] || logicalName));
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
