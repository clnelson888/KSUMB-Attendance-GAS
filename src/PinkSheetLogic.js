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
      clearAttendance: false,
      writeNote: hasMatchingDate,
      nextStatus: hasMatchingDate ? statuses.complete : statuses.approved,
    };
  }

  if (normalized === statuses.denied) {
    return {
      writeAttendance: hasMatchingDate,
      clearAttendance: true,
      writeNote: hasMatchingDate,
      nextStatus: hasMatchingDate ? statuses.complete : statuses.denied,
    };
  }

  if (normalized === statuses.pending) {
    return {
      writeAttendance: false,
      clearAttendance: false,
      writeNote: hasMatchingDate,
      nextStatus: statuses.pending,
    };
  }

  return {
    writeAttendance: false,
    clearAttendance: false,
    writeNote: false,
    nextStatus: normalized,
  };
}

/**
 * Builds the FERPA-safe Pink Sheet note text. Callers pre-format the
 * timestamp labels (PinkSheetLogic stays free of GAS globals).
 *
 * @param {{submittedAtLabel: string, statusValue: string, approvedAtLabel?: string, deniedAtLabel?: string}} parts
 * @returns {string}
 */
function buildPinkSheetNoteText(parts) {
  var p = parts || {};
  var status = String(p.statusValue || '').trim();
  var lower = status.toLowerCase();
  var submittedLine = 'Submitted: ' + String(p.submittedAtLabel || '').trim();

  if (lower === 'pending') {
    return ['Pink Sheet pending (not yet approved)', submittedLine].join('\n');
  }
  if (lower === 'approved' || lower === 'completed' || lower === 'complete') {
    return [
      'Pink Sheet approved',
      submittedLine,
      'Approved: ' + String(p.approvedAtLabel || '').trim(),
    ].join('\n');
  }
  if (lower === 'denied') {
    return [
      'Pink Sheet denied',
      submittedLine,
      'Denied: ' + String(p.deniedAtLabel || '').trim(),
    ].join('\n');
  }
  return ['Pink Sheet ' + status, submittedLine].join('\n');
}
