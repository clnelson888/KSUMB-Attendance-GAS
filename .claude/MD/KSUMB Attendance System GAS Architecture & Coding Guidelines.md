\# KSUMB Attendance System: GAS Architecture \& Coding Guidelines

\*\*Target Environment:\*\* VSCode, Clasp, ES6+ JavaScript (`.js`)

\*\*Deployment Context:\*\* Container-bound script to the KSUMB Attendance Google Sheet.



\## Part 1: Global Architecture, Data Access, and Concurrency



\### Assumptions \& Clarifications

\* \*\*Execution Context:\*\* The script is bound to the KSUMB Attendance Spreadsheet (`/\*\* @OnlyCurrentDoc \*/`).

\* \*\*Trigger Scale:\*\* The system must endure high-throughput concurrency (up to 400+ form submissions in a narrow time window).

\* \*\*Language:\*\* ES6+ JavaScript. The build pipeline is a simple file copy (`src/` → `dist/`), with no transpilation. All files share a single global scope in the GAS runtime — `import`/`export` and TypeScript `namespace` syntax are not supported at runtime.

\* \*\*No DOM Manipulation:\*\* This codebase executes in the Google V8 runtime. Browser objects (`window`, `document`) do not exist here.



\### Architectural Plan



\#### 1. Security and Least Privilege

We will strictly limit OAuth scopes. In the `appsscript.json` manifest, explicitly declare:



```json

{

&#x20; "oauthScopes": \[

&#x20;   "\[https://www.googleapis.com/auth/spreadsheets.currentonly](https://www.googleapis.com/auth/spreadsheets.currentonly)",

&#x20;   "\[https://www.googleapis.com/auth/script.container.ui](https://www.googleapis.com/auth/script.container.ui)"

&#x20; ]

}

```



\*Never\* use the generic `https://www.googleapis.com/auth/spreadsheets` scope unless absolute cross-spreadsheet access is definitively required later.



\#### 2. The "Batch Only" Data Access Mandate

Absolutely never iterate over spreadsheet cells using `.getValue()` or `.setValue()` inside a loop. The Apps Script API is agonizingly slow for single-cell operations. 

\* \*\*Reading Data:\*\* Identify the data range, call `sheet.getDataRange().getValues()`, and store the 2D array in memory.

\* \*\*Processing:\*\* Use native JavaScript array methods (`.map()`, `.filter()`, `.reduce()`) to manipulate the data.

\* \*\*Writing Data:\*\* Define the target range dimensions and write back the entire 2D array in a single call using `sheet.getRange(row, col, numRows, numCols).setValues(data)`.



\#### 3. Concurrency \& Lock Service (Critical)

When multiple students submit forms simultaneously (Late Check-in, Pink Sheet, Yellow Sheet), multiple instances of the `onFormSubmit` trigger will fire concurrently. If these scripts attempt to read/write to the same Section tabs simultaneously, data collision and overwrites will occur.

\* Wrap all sheet modification logic inside `LockService.getScriptLock()`.

\* Implement a robust wait/catch block:



```javascript

const lock = LockService.getScriptLock();

try {

&#x20; // Wait up to 30 seconds for other executions to finish

&#x20; lock.waitLock(30000); 

&#x20; 

&#x20; // Proceed with batch read/write operations

&#x20; // ...

} catch (e) {

&#x20; console.error('Lock timeout. Concurrency limit reached.', e);

&#x20; // Implementation note: For 400+ simultaneous requests, if 30s is exceeded,

&#x20; // store the failed payload in PropertiesService.getScriptProperties() (persists

&#x20; // indefinitely) and use a time-driven trigger to sweep and process the backlog.

&#x20; // Avoid CacheService for this — its entries expire after max 6 hours and could

&#x20; // silently drop unprocessed submissions.

} finally {

&#x20; // CRITICAL: flush() commits all pending spreadsheet writes while we still hold

&#x20; // exclusive access. Without it, batched changes may not be written before the

&#x20; // next concurrent execution reads the same sheet.

&#x20; // See: https://developers.google.com/apps-script/reference/lock/lock#releaseLock()

&#x20; SpreadsheetApp.flush();

&#x20; lock.releaseLock();

}

```



\### Implementation Code (Core Utility Classes to Generate)



Abstract the spreadsheet interactions into dedicated utility functions. Since all `.js` files in `dist/` share a single global scope in GAS, every function is globally accessible — no namespaces, classes, or exports needed. Prefix utility functions to avoid naming collisions (e.g., `sheetManager_getTableData`), or place them in a clearly named file like `SheetManager.js`:



```javascript

/**

&#x20;* Reads all data from a named sheet tab as a 2D array.

&#x20;* @param {string} sheetName - The tab name to read from.

&#x20;* @returns {Array[]} 2D array of cell values (row-major).

&#x20;*/

function getTableData(sheetName) {

&#x20; const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

&#x20; if (!sheet) throw new Error('Sheet ' + sheetName + ' not found.');

&#x20; return sheet.getDataRange().getValues();

}

/**

&#x20;* Writes a 2D array to a named sheet tab in a single batch call.

&#x20;* @param {string} sheetName - The tab name to write to.

&#x20;* @param {Array[]} data - 2D array of values to write.

&#x20;* @param {number} [startRow=1] - 1-based row to begin writing.

&#x20;* @param {number} [startCol=1] - 1-based column to begin writing.

&#x20;*/

function writeTableData(sheetName, data, startRow, startCol) {

&#x20; startRow = startRow || 1;

&#x20; startCol = startCol || 1;

&#x20; if (!data || data.length === 0) return;

&#x20; const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

&#x20; if (!sheet) throw new Error('Sheet ' + sheetName + ' not found.');

&#x20; sheet.getRange(startRow, startCol, data.length, data[0].length).setValues(data);

}

```



\### Setup and Deployment Considerations

1\. \*\*Local Development:\*\* Ensure `clasp login` and `clasp clone <SCRIPT\_ID>` are executed.

2\. \*\*IDE Intellisense:\*\* `@types/google-apps-script` is installed as a dev dependency and `jsconfig.json` is configured so VSCode provides autocompletion for all GAS globals (`SpreadsheetApp`, `FormApp`, `LockService`, etc.) even though the code is plain JS.

3\. \*\*File Structure:\*\* Avoid a single monolithic `.js` file. Organize code into:

&#x20;  \* `Config.js` (Constants for tab names, column indexes, configuration keys)

&#x20;  \* `SheetManager.js` (Batch data I/O utilities)

&#x20;  \* `Triggers.js` (Form submission handlers, Menu UI hooks)

&#x20;  \* `DateAdd.js`

&#x20;  \* `\_ConcernList.js`



\### onFormSubmit Event Object Reference

When a Google Form linked to this spreadsheet receives a submission, the Sheets `onFormSubmit` trigger passes an event object with these properties:

\* \*\*`e.namedValues`\*\* — Object mapping question titles to arrays of answers: `{ 'Your Full Name': ['Doe, Jane'], 'Ensemble': ['Marching Band'] }`. Use this for readable, key-based access.

\* \*\*`e.values`\*\* — Flat array of values in the same column order as the response sheet: `['6/7/2025 20:54:13', 'jane@ksu.edu', 'Doe, Jane', ...]`. Fragile if columns are reordered.

\* \*\*`e.range`\*\* — The `Range` object of the newly appended row in the linked response sheet.

\* \*\*`e.triggerUid`\*\* — ID of the installable trigger that produced this event.

Prefer `e.namedValues` over `e.values` for form submission handlers to avoid breakage when form questions are reordered.

