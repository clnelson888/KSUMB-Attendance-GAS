/**
 * Returns the status a Yellow Sheet row should take after a new or edited
 * submission is received.
 *
 * @param {string} previousStatus
 * @param {{pending: string, complete: string}} statuses
 * @returns {string}
 */
function getYellowSubmissionStatus(previousStatus, statuses) {
  if (isCompleteStatusValue(previousStatus)) {
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
 * @param {string} [submittedAtLabel]
 * @param {string} [approvedAtLabel]
 * @returns {string}
 */
function buildYellowSheetApprovedNote(days, startLabel, endLabel, submittedAtLabel, approvedAtLabel) {
  var header = 'Class conflict: ' + String(days || '').trim();
  var start = String(startLabel || '').trim();
  var end = String(endLabel || '').trim();
  if (start && end) {
    header += ' ' + start + '-' + end;
  }

  var lines = [header];
  var submitted = String(submittedAtLabel || '').trim();
  var approved = String(approvedAtLabel || '').trim();
  if (submitted) lines.push('Submitted: ' + submitted);
  if (approved) lines.push('Approved: ' + approved);
  return lines.join('\n');
}

/**
 * Returns the note text for a pending / previously approved Yellow Sheet
 * whose submission has not yet been re-approved.
 *
 * @param {string} [submittedAtLabel]
 * @returns {string}
 */
function getPendingYellowSheetNoteText(submittedAtLabel) {
  var submitted = String(submittedAtLabel || '').trim();
  if (!submitted) return 'Pending Yellow Sheet';
  return 'Pending Yellow Sheet\nSubmitted: ' + submitted;
}
