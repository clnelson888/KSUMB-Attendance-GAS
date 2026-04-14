/**
 * Returns true when an edit event represents a user changing the Yellow Sheet
 * status cell to an actionable value.
 *
 * @param {string} sheetName
 * @param {number} row
 * @param {number} column
 * @param {number} statusColumn
 * @param {string} newValue
 * @param {string} approvedStatus
 * @param {string} deniedStatus
 * @returns {boolean}
 */
function shouldProcessYellowStatusEdit(sheetName, row, column, statusColumn, newValue, approvedStatus, deniedStatus) {
  if (String(sheetName || '').trim() !== 'Yellow Sheets') return false;
  if (row <= 1) return false;
  if (column !== statusColumn) return false;

  var normalized = String(newValue || '').trim();
  return normalized === approvedStatus || normalized === deniedStatus;
}
