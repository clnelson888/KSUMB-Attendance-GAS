/**
 * Returns the status a Yellow Sheet row should take after a new or edited
 * submission is received.
 *
 * @param {string} previousStatus
 * @param {{pending: string, complete: string}} statuses
 * @returns {string}
 */
function getYellowSubmissionStatus(previousStatus, statuses) {
  var normalized = String(previousStatus || '').trim();
  if (normalized === statuses.complete) {
    return statuses.pending;
  }
  return statuses.pending;
}

/**
 * Builds the approved Yellow Sheet note text.
 *
 * @param {string} days
 * @param {string} startLabel
 * @param {string} endLabel
 * @returns {string}
 */
function buildYellowSheetApprovedNote(days, startLabel, endLabel) {
  var note = 'Class conflict: ' + String(days || '').trim();
  var start = String(startLabel || '').trim();
  var end = String(endLabel || '').trim();
  if (start && end) {
    note += ' ' + start + '-' + end;
  }
  return note;
}

/**
 * Returns the note text for a previously approved Yellow Sheet that has been
 * edited and must be re-approved.
 *
 * @returns {string}
 */
function getPendingYellowSheetNoteText() {
  return 'Pending Yellow Sheet';
}
