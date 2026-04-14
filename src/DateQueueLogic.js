/**
 * Returns whether a queue row date should be reset when a rehearsal date is
 * deleted.
 *
 * @param {Date} rowDate
 * @param {Date} deletedDate
 * @returns {boolean}
 */
function shouldResetQueueRowForDeletedDate(rowDate, deletedDate) {
  return isSameCalendarDate(rowDate, deletedDate);
}
