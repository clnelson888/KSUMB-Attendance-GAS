/**
 * Separator line that divides Yellow Sheet content (above) from roster
 * contact info (below) inside a section-tab name-cell note. Must be unique
 * enough that it never appears naturally in Yellow Sheet note text.
 * @type {string}
 */
const ROSTER_NOTE_SEPARATOR = '--- Roster Info ---';

/**
 * Builds the roster contact info block for a member's name-cell note.
 * Only columns listed in noteColumns and present in memberRowData are included.
 * Returns an empty string when noteColumns is empty or no values exist.
 *
 * @param {{ [header: string]: * }} memberRowData
 * @param {string[]} noteColumns
 * @returns {string}
 */
function buildRosterContactNote(memberRowData, noteColumns) {
  var lines = [];
  for (var i = 0; i < noteColumns.length; i++) {
    var col = noteColumns[i];
    if (!Object.prototype.hasOwnProperty.call(memberRowData, col)) continue;
    var value = String(memberRowData[col] || '').trim();
    if (value) lines.push(col + ': ' + value);
  }
  return lines.join('\n');
}

/**
 * Splits a name-cell note at ROSTER_NOTE_SEPARATOR.
 * Everything before the separator is Yellow Sheet content; everything after
 * is roster contact info. If no separator is found the entire text is treated
 * as Yellow Sheet content and contactPart is empty.
 *
 * @param {string} note
 * @returns {{ yellowSheetPart: string, contactPart: string }}
 */
function splitNoteAtRosterSeparator(note) {
  var text = String(note || '');
  var sep = '\n' + ROSTER_NOTE_SEPARATOR + '\n';
  var idx = text.indexOf(sep);
  if (idx === -1) {
    return { yellowSheetPart: text, contactPart: '' };
  }
  return {
    yellowSheetPart: text.substring(0, idx),
    contactPart: text.substring(idx + sep.length),
  };
}

/**
 * Combines a Yellow Sheet note block and a roster contact info block into a
 * single note string. Yellow Sheet content always appears above the separator;
 * contact info below. Returns only the non-empty part when one side is blank.
 *
 * @param {string} yellowSheetPart
 * @param {string} contactPart
 * @returns {string}
 */
function buildCombinedMemberNote(yellowSheetPart, contactPart) {
  var ys = String(yellowSheetPart || '').trim();
  var contact = String(contactPart || '').trim();
  if (!ys && !contact) return '';
  if (!ys) return contact;
  if (!contact) return ys;
  return ys + '\n' + ROSTER_NOTE_SEPARATOR + '\n' + contact;
}

/**
 * Returns whether a Database Active value should be treated as active.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isRosterMemberActive(value) {
  if (value === true) return true;
  var normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === 'active';
}

/**
 * Groups active roster members by section and sorts names alphabetically.
 *
 * @param {{fullName: string, section: string, active: *}[]} members
 * @returns {Object.<string, string[]>}
 */
function groupActiveRosterMembersBySection(members) {
  var grouped = {};

  for (var i = 0; i < members.length; i++) {
    if (!isRosterMemberActive(members[i].active)) continue;

    var fullName = String(members[i].fullName || '').trim();
    var section = String(members[i].section || '').trim();
    if (!fullName || !section) continue;

    if (!grouped[section]) grouped[section] = [];
    if (grouped[section].indexOf(fullName) === -1) {
      grouped[section].push(fullName);
    }
  }

  var sections = Object.keys(grouped);
  for (var j = 0; j < sections.length; j++) {
    grouped[sections[j]].sort();
  }

  return grouped;
}
