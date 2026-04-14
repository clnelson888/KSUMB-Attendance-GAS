/**
 * Returns whether the input is a valid Date-like value.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidDateLike(value) {
  return Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime());
}

/**
 * Parses the configured late threshold into a non-negative integer.
 *
 * @param {*} rawValue
 * @param {number} fallbackMinutes
 * @returns {number}
 */
function parseLateThresholdMinutes(rawValue, fallbackMinutes) {
  var parsed = parseInt(rawValue, 10);
  if (isNaN(parsed) || parsed < 0) return fallbackMinutes;
  return parsed;
}

/**
 * Determines the attendance value for a late check-in.
 *
 * If the arrival is at or before rehearsal start plus the threshold, the
 * student is treated as present. Otherwise they are tardy.
 *
 * @param {Date} arrivalDate
 * @param {Date} rehearsalStartDate
 * @param {number} thresholdMinutes
 * @param {string} presentValue
 * @param {string} tardyValue
 * @returns {string}
 */
function determineLateAttendanceStatus(arrivalDate, rehearsalStartDate, thresholdMinutes, presentValue, tardyValue) {
  if (!isValidDateLike(arrivalDate)) {
    throw new Error('Arrival date is invalid.');
  }
  if (!isValidDateLike(rehearsalStartDate)) {
    throw new Error('Rehearsal start date is invalid.');
  }

  var thresholdMs = thresholdMinutes * 60 * 1000;
  var cutoff = rehearsalStartDate.getTime() + thresholdMs;
  return arrivalDate.getTime() <= cutoff ? presentValue : tardyValue;
}

/**
 * Returns whether the current attendance value may be overwritten by a
 * late-check-in update.
 *
 * @param {string} currentValue
 * @param {Object} attendanceValues
 * @returns {boolean}
 */
function canLateCheckInOverwriteAttendance(currentValue, attendanceValues) {
  var normalized = String(currentValue || '').trim();
  if (!normalized) return true;

  var allowed = [attendanceValues.present, attendanceValues.tardy, attendanceValues.absent, attendanceValues.excused];

  return allowed.indexOf(normalized) !== -1;
}

/**
 * Compares only the year-month-day portion of two Date objects.
 *
 * @param {Date} left
 * @param {Date} right
 * @returns {boolean}
 */
function isSameCalendarDate(left, right) {
  return (
    isValidDateLike(left) &&
    isValidDateLike(right) &&
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/**
 * Builds the note text written to an attendance cell after a successful
 * late-check-in update.
 *
 * @param {string} arrivalLabel
 * @param {string} reason
 * @param {string} otherExplanation
 * @returns {string}
 */
function buildLateCheckInNoteText(arrivalLabel, reason, otherExplanation) {
  var lines = ['Late check-in: ' + String(arrivalLabel || '').trim()];
  lines.push('Reason: ' + String(reason || '').trim());

  var details = String(otherExplanation || '').trim();
  if (details) {
    lines.push('Details: ' + details);
  }

  return lines.join('\n');
}
