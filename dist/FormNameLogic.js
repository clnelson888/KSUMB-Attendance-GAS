var FORM_SECTION_QUESTION_TITLE = 'What is your section?';
var FORM_NAME_LIST_TITLE = 'Your Name';
var FORM_NAME_LIST_HELP_TEXT = 'Select your name here. If it is missing, leave this blank and use the manual name field below.';
var FORM_MANUAL_NAME_TITLE = 'If you cannot find your name in the list, enter it here as Last, First';
var FORM_MANUAL_NAME_HELP_TEXT = 'Use Last, First. Example: Doe, Jane';
var FORM_SECTION_PAGE_DELIMITER = ' \u2014 ';

function normalizeSubmittedName(value) {
  var raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  if (raw.indexOf(',') !== -1) {
    var parts = raw.split(',');
    var lastName = String(parts.shift() || '').trim();
    var firstNames = String(parts.join(' ') || '').replace(/\s+/g, ' ').trim();
    if (!lastName) return firstNames;
    if (!firstNames) return lastName;
    return lastName + ', ' + firstNames;
  }

  var words = raw.split(' ');
  if (words.length === 1) return words[0];

  var surname = words.pop();
  var givenNames = words.join(' ').trim();
  return surname + ', ' + givenNames;
}

function resolveSubmittedName(selectedName, manualName) {
  var manual = normalizeSubmittedName(manualName);
  if (manual) return manual;
  return normalizeSubmittedName(selectedName);
}

function requireResolvedSubmittedName(selectedName, manualName) {
  var resolved = resolveSubmittedName(selectedName, manualName);
  if (!resolved) {
    throw new Error('Submission is missing a student name. Select your name or enter it manually as Last, First.');
  }
  return resolved;
}

function buildSectionPageTitle(section) {
  return String(section || '').trim() + FORM_SECTION_PAGE_DELIMITER + 'Student Information';
}

function extractSectionFromPageTitle(title) {
  var normalized = String(title || '').trim();
  if (!normalized) return '';

  var match = normalized.match(/^(.+?)\s+[\u2014\u2013-]\s+/);
  return match ? match[1].trim() : '';
}
