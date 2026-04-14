\## Part 2: Configuration Caching \& The `DateAdd` Feature



\### Assumptions \& Clarifications

\* \*\*Concurrency Pivot:\*\* Based on your guidance, we are dropping `LockService`. We will allow the native Apps Script event queue to handle `onFormSubmit` executions concurrently. If the 400+ load results in dropped executions later, we will pivot to a PropertiesService queue. 

\* \*\*Form Events:\*\* Since Forms are natively linked to tabs in the same sheet, we rely on the Sheets `onFormSubmit` event object. Prefer `e.namedValues` for readable key-based access to form responses (resilient to column reordering). Use `e.range` when you need the physical row/cell reference. Avoid `e.values` with hardcoded indexes — it breaks if form questions are reordered.

\* \*\*Configuration Caching:\*\* The `Data` tab is relatively static. It will be read and cached in memory at the beginning of the script execution lifecycle to minimize API calls.



\### Architectural Plan



\#### 1. Global Configuration \& Caching

Implement a memoization pattern to fetch and store the `Data` tab key-value pairs. Since Apps Script is stateless between executions, "caching" here means reading once per script run, not using `CacheService` (which persists across triggers but is overkill for a single tab read).



\#### 2. DateAdd Feature Logic

The `DateAdd` function is a heavy operation. It must iterate through \~15 section tabs, insert a column in the correct chronological order, and format it. 

\* \*\*Chronological Sorting:\*\* Apps Script cannot natively "sort" columns by Date headers. Pull Row 1 values (`sheet.getRange(1, 2, 1, sheet.getLastColumn() - 1).getValues()[0]`), parse the string dates (`M/D h:mm a`) into JavaScript `Date` objects with an assumed current year, and determine the correct insertion index.

\* \*\*Formatting:\*\* Use `sheet.insertColumnBefore(index)` (or `insertColumnAfter` when appending to end), then copy formatting and data validation from an adjacent column using `Range.copyTo()` with `SpreadsheetApp.CopyPasteType` enum values. Note: `copyDataValidationsToRange` does NOT exist in the GAS API — always use `copyTo()` with `CopyPasteType.PASTE_DATA_VALIDATION`.

\* \*\*Cross-Triggering:\*\* After adding the column, `DateAdd` must trigger a sweep of the `Pink Sheets` tab to apply any pending excused absences for that specific date.



\### Implementation Code (Core Utility Functions to Generate)



Generate the configuration and DateAdd modules as plain ES6+ JavaScript (no TypeScript, no namespaces — all functions are global in GAS):



```javascript

/**
 * Config.js
 * Memoized configuration to prevent multiple reads of the Data tab per execution.
 */

var _cachedConfig = null;

/**
 * Returns the value for a given key from the Data tab.
 * Reads the Data tab once per execution and caches the result in memory.
 * @param {string} key - The key to look up (e.g., 'YELLOW_FORM_ID').
 * @returns {*} The corresponding value, or undefined if not found.
 */
function getConfig(key) {
  if (!_cachedConfig) {
    _cachedConfig = {};
    var dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Data');
    if (!dataSheet) throw new Error('Data sheet not found.');
    var values = dataSheet.getDataRange().getValues();
    // Data tab layout: Key (Col A) | Value (Col B)
    for (var i = 0; i < values.length; i++) {
      if (values[i][0]) {
        _cachedConfig[values[i][0].toString()] = values[i][1];
      }
    }
  }
  return _cachedConfig[key];
}

var SECTION_TABS = [
  'Piccolo', 'Clarinet', 'Alto Sax', 'Tenor Sax', 'Trumpet',
  'Horn', 'Trombone', 'Baritone', 'Tuba', 'Percussion',
  'Classy Cats', 'Color Guard', 'Twirlers', 'Drum Majors', 'Student Staff',
];

```



```javascript

/**
 * Feature_DateAdd.js
 */

/**
 * Parses a section-tab date header string (e.g., '3/30 3:30 PM') into a Date object.
 * Assumes the current year since headers omit the year.
 * @param {string} headerStr - The header string to parse.
 * @returns {Date|null} A Date object, or null if parsing fails.
 */
function parseDateHeader(headerStr) {
  if (!headerStr) return null;
  // If Sheets stored the header as an actual Date object, use it directly
  if (headerStr instanceof Date) return headerStr;
  var str = headerStr.toString().trim();
  if (!str) return null;
  // Expected format: 'M/D h:mm AM/PM' — append the current year for parsing
  var year = new Date().getFullYear();
  var parsed = new Date(str + ' ' + year);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Adds a new rehearsal date column to all section tabs in chronological order,
 * copies formatting and data validation from the adjacent column, then
 * triggers a Pink Sheet sweep for the new date.
 * @param {string} dateString - The date header to insert (e.g., '3/30 3:30 PM').
 */
function addRehearsalDate(dateString) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var newDate = parseDateHeader(dateString);
  if (!newDate) throw new Error('Could not parse date: ' + dateString);

  for (var t = 0; t < SECTION_TABS.length; t++) {
    var section = SECTION_TABS[t];
    var sheet = ss.getSheetByName(section);
    if (!sheet) continue; // Skip if tab doesn't exist

    var lastCol = sheet.getLastColumn();
    // Read date headers (Col B onward — Col A is the Name column)
    var headers = lastCol > 1
      ? sheet.getRange(1, 2, 1, lastCol - 1).getValues()[0]
      : [];

    // Determine insertion index (1-based column) via chronological comparison
    var insertCol = -1;
    for (var i = 0; i < headers.length; i++) {
      var colDate = parseDateHeader(headers[i]);
      if (colDate && newDate < colDate) {
        insertCol = i + 2; // +2: offset for 0-based array + Col A being Name
        break;
      }
    }

    // Insert the new column
    if (insertCol === -1) {
      // Append after the last column
      sheet.insertColumnAfter(lastCol);
      insertCol = lastCol + 1;
    } else {
      sheet.insertColumnBefore(insertCol);
    }

    // Write the date header into row 1 of the new column
    sheet.getRange(1, insertCol).setValue(dateString);

    // Copy formatting and data validation from an adjacent column (prefer left neighbor)
    var sourceCol = insertCol > 2 ? insertCol - 1 : insertCol + 1;
    if (sourceCol >= 2 && sourceCol <= sheet.getLastColumn()) {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var sourceRange = sheet.getRange(2, sourceCol, lastRow - 1, 1);
        var targetRange = sheet.getRange(2, insertCol, lastRow - 1, 1);
        // copyTo with CopyPasteType copies to a same-size or anchor-cell target range.
        // PASTE_FORMAT: cell formatting (colors, borders, number format, etc.)
        sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        // PASTE_DATA_VALIDATION: dropdown lists, value constraints, etc.
        sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      }
    }
  }

  // Commit all pending writes at once across all 15 tabs
  SpreadsheetApp.flush();

  // Invoke Pink Sheet processor for the newly added date
  processPendingPinkSheets(dateString);
}

```



\### Setup and Deployment Considerations

1\. \*\*Local Development:\*\* Ensure `clasp login` and `clasp clone <SCRIPT_ID>` are executed.

2\. \*\*IDE Intellisense:\*\* `@types/google-apps-script` is installed as a dev dependency and `jsconfig.json` is configured so VSCode provides autocompletion for all GAS globals (`SpreadsheetApp`, `FormApp`, `LockService`, etc.) even though the code is plain JS.

3\. \*\*File Structure:\*\* Avoid a single monolithic `.js` file. Organize code into:

&#x20;  \* `Config.js` (Constants for tab names, column indexes, configuration keys)

&#x20;  \* `SheetManager.js` (Batch data I/O utilities)

&#x20;  \* `Triggers.js` (Form submission handlers, Menu UI hooks)

&#x20;  \* `Feature_DateAdd.js` (Rehearsal date column insertion)

&#x20;  \* `Feature_ConcernList.js`
