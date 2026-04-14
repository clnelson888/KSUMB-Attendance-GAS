/**
 * Returns the Pink Sheet processing action for a row based on status and
 * whether the matching rehearsal date currently exists.
 *
 * @param {string} statusValue
 * @param {boolean} hasMatchingDate
 * @param {{pending: string, approved: string, denied: string, complete: string}} statuses
 * @returns {{writeAttendance: boolean, writeNote: boolean, nextStatus: string}}
 */
function determinePinkSheetAction(statusValue, hasMatchingDate, statuses) {
  var normalized = String(statusValue || '').trim();

  if (normalized === statuses.approved) {
    return {
      writeAttendance: hasMatchingDate,
      writeNote: hasMatchingDate,
      nextStatus: hasMatchingDate ? statuses.complete : statuses.approved,
    };
  }

  if (normalized === statuses.denied) {
    return {
      writeAttendance: false,
      writeNote: hasMatchingDate,
      nextStatus: hasMatchingDate ? statuses.complete : statuses.denied,
    };
  }

  if (normalized === statuses.pending) {
    return {
      writeAttendance: false,
      writeNote: hasMatchingDate,
      nextStatus: statuses.pending,
    };
  }

  return {
    writeAttendance: false,
    writeNote: false,
    nextStatus: normalized,
  };
}

/**
 * Builds the FERPA-safe Pink Sheet note text.
 *
 * @param {string} submittedAtLabel
 * @param {string} statusValue
 * @returns {string}
 */
function buildPinkSheetNoteText(submittedAtLabel, statusValue) {
  return ['Pink Sheet submitted: ' + String(submittedAtLabel || '').trim(), 'Status: ' + String(statusValue || '').trim()].join('\n');
}
