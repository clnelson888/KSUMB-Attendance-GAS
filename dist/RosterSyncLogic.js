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
 * The separator may appear at any position, including the very start of the
 * note (when no Yellow Sheet content exists yet), so we search for the
 * separator string directly rather than requiring a newline before it.
 *
 * @param {string} note
 * @returns {{ yellowSheetPart: string, contactPart: string }}
 */
function splitNoteAtRosterSeparator(note) {
  var text = String(note || '');
  var sep = ROSTER_NOTE_SEPARATOR;
  var idx = text.indexOf(sep);
  if (idx === -1) {
    return { yellowSheetPart: text, contactPart: '' };
  }
  var ys = text.substring(0, idx).replace(/\n$/, '');
  var contact = text.substring(idx + sep.length).replace(/^\n/, '');
  return { yellowSheetPart: ys, contactPart: contact };
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
  if (!contact) return ys;
  // Always include the separator when contact info is present so that
  // splitNoteAtRosterSeparator can reliably recover it even when ys is empty.
  if (!ys) return ROSTER_NOTE_SEPARATOR + '\n' + contact;
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
