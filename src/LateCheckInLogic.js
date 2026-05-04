/**
 * Full day names indexed by JavaScript's Date.getDay() (0 = Sunday).
 * Must match the FORM_CONFIG.CONFLICT_DAYS choices in Feature_FormBuilder.js.
 * @type {string[]}
 */
var CONFLICT_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

/**
 * Returns whether the comma/space-separated conflict-days string includes the
 * given JavaScript day-of-week index (0 = Sunday, 1 = Monday, …).
 * Matches full day names case-insensitively.
 *
 * @param {string} conflictDaysString
 * @param {number} jsDay
 * @returns {boolean}
 */
function conflictDaysIncludesDay(conflictDaysString, jsDay) {
  var dayName = CONFLICT_DAY_NAMES[jsDay];
  if (!dayName) return false;
  var text = String(conflictDaysString || '').toLowerCase();
  return text.indexOf(dayName.toLowerCase()) !== -1;
}

/**
 * Returns a new Date that has the same calendar date as referenceDate but the
 * hours and minutes taken from timeSource. Used to project a GAS form
 * time-question value (stored as a Date on the 1899-12-30 epoch) onto the
 * actual arrival day.
 *
 * @param {Date} referenceDate - Provides year/month/day.
 * @param {Date} timeSource - Provides hours and minutes.
 * @returns {Date}
 */
function applyTimeToDate(referenceDate, timeSource) {
  return new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    timeSource.getHours(),
    timeSource.getMinutes(),
    0,
    0
  );
}

/**
 * Scans Yellow Sheet rows for the latest class-end time among all Approved
 * rows whose conflict days include the arrival date's day-of-week, for the
 * given member. Returns null when the member has no matching approved row.
 *
 * When multiple approved conflicts apply (e.g. two classes on Monday), the
 * latest end time is returned so the member gets the most lenient cutoff.
 *
 * @param {Array[]} allData - Full getValues() of the Yellow Sheets sheet (row 0 = headers).
 * @param {Object} headerMap - Column index map with at least: fullName, section, conflictDays, endTime, status.
 * @param {string} name
 * @param {string} section
 * @param {Date} arrivalDate
 * @param {string} approvedStatus
 * @returns {Date|null}
 */
function findApprovedClassEndTime(allData, headerMap, name, section, arrivalDate, approvedStatus) {
  var jsDay = arrivalDate.getDay();
  var latestEnd = null;

  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][headerMap.fullName] || '').trim() !== name) continue;
    if (String(allData[i][headerMap.section] || '').trim() !== section) continue;
    if (String(allData[i][headerMap.status] || '').trim() !== approvedStatus) continue;

    var conflictDays = String(allData[i][headerMap.conflictDays] || '').trim();
    if (!conflictDaysIncludesDay(conflictDays, jsDay)) continue;

    var endRaw = allData[i][headerMap.endTime];
    if (!isValidDateLike(endRaw)) continue;

    var endOnDay = applyTimeToDate(arrivalDate, endRaw);
    if (!latestEnd || endOnDay.getTime() > latestEnd.getTime()) {
      latestEnd = endOnDay;
    }
  }

  return latestEnd;
}

/**
 * Computes the tardy cutoff for a member with an approved yellow sheet.
 *
 * mode 'after_class_end'      → classEndTime + thresholdMinutes
 * mode 'after_rehearsal_start' → rehearsalStart + thresholdMinutes
 *
 * Falls back to rehearsal-start mode when classEndTime is null (no matching
 * yellow sheet row was found for this day).
 *
 * @param {Date} rehearsalStart
 * @param {Date|null} classEndTime
 * @param {string} mode
 * @param {number} thresholdMinutes
 * @returns {Date}
 */
function computeYellowSheetTardyCutoff(rehearsalStart, classEndTime, mode, thresholdMinutes) {
  var ms = thresholdMinutes * 60 * 1000;
  if (mode === 'after_class_end' && classEndTime) {
    return new Date(classEndTime.getTime() + ms);
  }
  return new Date(rehearsalStart.getTime() + ms);
}
