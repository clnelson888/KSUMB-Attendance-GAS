/**
 * Returns true when an edit event represents a user changing a queue sheet's
 * Status cell to an actionable value (Approved or Denied) on a data row.
 *
 * @param {string} sheetName
 * @param {string} targetSheetName - The queue sheet this check applies to.
 * @param {number} row
 * @param {number} column
 * @param {number} statusColumn
 * @param {string} newValue
 * @param {string} approvedStatus
 * @param {string} deniedStatus
 * @returns {boolean}
 */
function shouldProcessQueueStatusEdit(
  sheetName,
  targetSheetName,
  row,
  column,
  statusColumn,
  newValue,
  approvedStatus,
  deniedStatus
) {
  if (String(sheetName || '').trim() !== targetSheetName) return false;
  if (row <= 1) return false;
  if (column !== statusColumn) return false;

  var normalized = String(newValue || '').trim();
  return normalized === approvedStatus || normalized === deniedStatus;
}

/**
 * Back-compat wrapper for the Yellow-Sheet-only check.
 *
 * @deprecated Prefer shouldProcessQueueStatusEdit.
 */
function shouldProcessYellowStatusEdit(sheetName, row, column, statusColumn, newValue, approvedStatus, deniedStatus) {
  return shouldProcessQueueStatusEdit(
    sheetName,
    'Yellow Sheets',
    row,
    column,
    statusColumn,
    newValue,
    approvedStatus,
    deniedStatus
  );
}
