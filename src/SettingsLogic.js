/**
 * Normalizes raw settings values into the persisted string format used by
 * document properties. Only includes keys that are present in rawValues so
 * that omitted fields (e.g. STATUS_* and ATTENDANCE_* labels removed from
 * the UI) are never overwritten with blanks.
 *
 * @param {Object.<string, *>} rawValues
 * @returns {Object.<string, string>}
 */
function normalizeSettingsPayload(rawValues) {
  var normalized = {};
  var keys = Object.keys(DEFAULT_CONFIG_VALUES);

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(rawValues, key)) continue;
    var value = rawValues[key];

    if (key === CONFIG_KEYS.SECTION_TABS || key === CONFIG_KEYS.LATE_REASONS || key === CONFIG_KEYS.ROSTER_NOTE_COLUMNS) {
      normalized[key] = parseConfigList(value).join('\n');
      continue;
    }

    normalized[key] = String(value == null ? '' : value).trim();
  }

  return normalized;
}

/**
 * Validates settings before they are persisted.
 *
 * @param {Object.<string, string>} values
 * @returns {string[]}
 */
function validateSettingsPayload(values) {
  var errors = [];

  if (!parseConfigList(values[CONFIG_KEYS.SECTION_TABS]).length) {
    errors.push('At least one section is required.');
  }

  if (!String(values[CONFIG_KEYS.TIMEZONE] || '').trim()) {
    errors.push('Timezone is required.');
  }

  if (!/^\d{2}:\d{2}$/.test(String(values[CONFIG_KEYS.REHEARSAL_START_TIME] || '').trim())) {
    errors.push('Rehearsal start time must use HH:MM 24-hour format.');
  }

  var threshold = String(values[CONFIG_KEYS.LATE_THRESHOLD_MINUTES] || '').trim();
  if (!/^\d+$/.test(threshold)) {
    errors.push('Late threshold minutes must be a whole number.');
  }

  if (!parseConfigList(values[CONFIG_KEYS.LATE_REASONS]).length) {
    errors.push('At least one late reason is required.');
  }

  return errors;
}
