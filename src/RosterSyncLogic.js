/**
 * Returns whether a Database Active value should be treated as active.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isRosterMemberActive(value) {
  if (value === true) return true;
  var normalized = String(value || '').trim().toLowerCase();
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
