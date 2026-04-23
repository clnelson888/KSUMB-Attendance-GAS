/**
 * Returns the status a Yellow Sheet row should take after a new or edited
 * form response is received. Every fresh submission (and every edit of an
 * existing response) is treated as Pending so staff can re-verify.
 *
 * @param {string} previousStatus
 * @param {{pending: string}} statuses
 * @returns {string}
 */
function getYellowSubmissionStatus(previousStatus, statuses) {
  return statuses.pending;
}

/**
 * Builds the approved Yellow Sheet note text. Approved notes intentionally
 * omit submission/approval timestamps — once approved, the conflict line is
 * the only information worth carrying forward on the student's name cell.
 *
 * @param {string} days
 * @param {string} startLabel
 * @param {string} endLabel
 * @returns {string}
 */
function buildYellowSheetApprovedNote(days, startLabel, endLabel) {
  var header = 'Class conflict: ' + String(days || '').trim();
  var start = String(startLabel || '').trim();
  var end = String(endLabel || '').trim();
  if (start && end) {
    header += ' ' + start + '-' + end;
  }
  return header;
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

/**
 * Composes the section-tab name-cell note from the student's currently
 * approved Yellow Sheet conflict lines and whether any submissions are still
 * pending. Empty approved list + no pending => empty note (caller clears).
 *
 * @param {string[]} approvedConflictLines - Lines produced by buildYellowSheetApprovedNote.
 * @param {boolean} hasPending - True if the student has any Pending Yellow Sheet rows.
 * @param {string} [pendingSubmittedAtLabel] - Formatted label for the most recent pending submission.
 * @returns {string}
 */
function buildYellowSheetCombinedNote(approvedConflictLines, hasPending, pendingSubmittedAtLabel) {
  var lines = [];
  if (Array.isArray(approvedConflictLines)) {
    for (var i = 0; i < approvedConflictLines.length; i++) {
      var line = String(approvedConflictLines[i] || '').trim();
      if (line) lines.push(line);
    }
  }
  if (hasPending) {
    lines.push(getPendingYellowSheetNoteText(pendingSubmittedAtLabel));
  }
  return lines.join('\n');
}
