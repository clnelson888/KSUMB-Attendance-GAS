/**
 * Escapes a sheet name for use in a Google Sheets formula.
 *
 * @param {string} sheetName
 * @returns {string}
 */
function quoteSheetNameForFormula(sheetName) {
  return "'" + String(sheetName || '').replace(/'/g, "''") + "'";
}

/**
 * Builds the per-section array fragment used by the Concern List formula.
 *
 * @param {string} sheetName
 * @returns {string}
 */
function buildConcernListSectionFormula(sheetName) {
  var quotedSheet = quoteSheetNameForFormula(sheetName);
  return (
    'FILTER({' +
    quotedSheet +
    '!A2:A,IF(LEN(' +
    quotedSheet +
    '!A2:A),"' +
    sheetName +
    '",""),OFFSET(' +
    quotedSheet +
    '!A1,1,MATCH($B$1,' +
    quotedSheet +
    '!1:1,0)-1,ROWS(' +
    quotedSheet +
    '!A2:A),1)},LEN(' +
    quotedSheet +
    '!A2:A))'
  );
}

/**
 * Builds the final Concern List formula.
 *
 * @param {string[]} sectionTabs
 * @param {string} presentValue
 * @returns {string}
 */
function buildConcernListFormula(sectionTabs, presentValue) {
  var sections = [];
  for (var i = 0; i < sectionTabs.length; i++) {
    sections.push(buildConcernListSectionFormula(sectionTabs[i]));
  }

  return (
    '=IF($B$1="","",QUERY(VSTACK(' +
    sections.join(',') +
    '),"select Col1, Col2, Col3 where Col1 is not null and (Col3 <> "' +
    presentValue +
    '" or Col3 is null)",0))'
  );
}
