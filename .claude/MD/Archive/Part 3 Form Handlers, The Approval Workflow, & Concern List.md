\## Part 3: Form Handlers, The Approval Workflow, \& Concern List



\### Assumptions \& Clarifications

\* \*\*Attendance Enums:\*\* Valid attendance states are exactly: `"Present"`, `"Absent"`, `"Tardy"`, `"Excused"`. Late Check-ins forcefully overwrite existing states with `"Tardy"`.

\* \*\*Exact Matching:\*\* Because forms utilize dropdowns driven by the Database tab, student names will match the `Name` column in the section tabs exactly (e.g., `Smith, John`). 

\* \*\*The Approval Queue Pivot:\*\* We will completely eliminate the high-risk concurrency issue of `onFormSubmit` roster updates.

&#x20; \* \*\*Phase 1 (Native):\*\* Forms submit natively to their respective tabs (`Pink Sheets`, `Yellow Sheets`, `Late Check-Ins`).

&#x20; \* \*\*Phase 2 (Defaulting):\*\* The sheet will use a default status of `"Pending"`.

&#x20; \* \*\*Phase 3 (Human Review):\*\* Staff manually reviews and updates the dropdown to `"Approved"` or `"Denied"`.

&#x20; \* \*\*Phase 4 (Batch Process):\*\* A staff member clicks a Custom Menu button (e.g., `Attendance > Process Approved Requests`). The script batches all `"Approved"` rows, updates the Section tabs, and marks the rows `"Completed"`.

\* \*\*Header Names:\*\* The code below uses the column headers as defined in the Sheets Structure doc (e.g., `Full Name`, `Section`, `Arrival Time`). If the form response tabs use the raw form question text as headers instead (e.g., `Your Name`, `What is your section?`), update the header constants accordingly.



\### Architectural Plan



\#### 1. The Queue Processor (Batch Updating)

Triggering roster updates via `onEdit` every time a staff member approves a request is slow and consumes daily quotas. Instead, build a \*\*Batch Queue Processor\*\*.

\* \*\*Read Phase:\*\* Load the `Pink Sheets`, `Yellow Sheets`, and `Late Check-Ins` tabs into memory (`getValues()`).

\* \*\*Filter Phase:\*\* Identify all rows where the status column equals `"Approved"`. Track original row indices so we can write `"Completed"` back to the correct rows.

\* \*\*Map Phase:\*\* Group these approved requests by Section to minimize sheet reads/writes.

\* \*\*Update Phase:\*\* For each Section, load its roster into memory. Iterate through the grouped requests, locate the exact `Name` row and `Date` column (using `parseDateHeader()` from Part 2 for reliable date comparison), and apply the appropriate mutation (`"Tardy"`, `"Excused"`, or cell notes for Yellow Sheets).

\* \*\*Write Phase:\*\* Write the modified Section arrays back to the sheet, and update the Queue sheets' status columns to `"Completed"`.

\* \*\*Flush:\*\* Call `SpreadsheetApp.flush()` once at the end to commit all pending writes atomically.



\#### 2. Concern List Generation

The Concern List is a real-time snapshot of students who are not present.

\* Iterate through `SECTION_TABS` (defined in Config.js).

\* Locate the column corresponding to the current rehearsal date using `parseDateHeader()`.

\* Filter rows where the attendance value is not `"Present"`, not `"Excused"`, and not empty (empty = no roster entry or date not yet processed). Note: Excused students have approved absences and should not appear on the concern list.

\* Aggregate a 2D array of `[Section, Name, Status, Date]` and write it to the `Concern List` tab using a single `.setValues()` call.



\### Implementation Code (Core Utility Functions to Generate)



Implement the Queue and Concern modules as plain ES6+ JavaScript (all functions are global in GAS):



```javascript

/**
 * Feature_QueueProcessor.js
 * Processes all "Approved" requests in the form response tabs and updates
 * the corresponding Section attendance tabs in batch.
 *
 * Called from a custom menu: Attendance > Process Approved Requests
 */

/**
 * Processes all approved Late Check-In requests.
 * Reads the Late Check-Ins tab, filters for "Approved" rows,
 * groups by section, updates the section tabs with "Tardy", and
 * marks processed rows as "Completed".
 */
function processApprovedLateCheckIns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var lateSheet = ss.getSheetByName('Late Check-Ins');
  if (!lateSheet) return;

  var allData = lateSheet.getDataRange().getValues();
  var headers = allData[0];

  // Map header names to column indexes.
  // These must match the actual column headers in the Late Check-Ins tab.
  // Per Sheets Structure: Full Name | Section | Arrival Time | Reason
  // The approval workflow adds a "Status" column.
  var NAME_COL = headers.indexOf('Full Name');
  var SECTION_COL = headers.indexOf('Section');
  var TIME_COL = headers.indexOf('Arrival Time');
  var REASON_COL = headers.indexOf('Reason');
  var STATUS_COL = headers.indexOf('Status');

  if (NAME_COL === -1 || SECTION_COL === -1 || STATUS_COL === -1) {
    throw new Error('Late Check-Ins tab is missing required columns. Expected: Full Name, Section, Status.');
  }

  // Collect approved rows WITH their original spreadsheet row index (1-based).
  // allData[0] = headers (row 1), allData[1] = first data row (row 2), etc.
  var approved = [];
  for (var i = 1; i < allData.length; i++) {
    if (allData[i][STATUS_COL] === 'Approved') {
      approved.push({
        row: allData[i],
        sheetRow: i + 1, // 1-based spreadsheet row number
      });
    }
  }

  if (approved.length === 0) return;

  // Group approved requests by section to minimize sheet reads/writes
  var bySection = {};
  for (var j = 0; j < approved.length; j++) {
    var section = approved[j].row[SECTION_COL];
    if (!bySection[section]) bySection[section] = [];
    bySection[section].push(approved[j]);
  }

  // Track notes to apply after batch writes (setNote is cell-level, not batch-array)
  var notesToApply = []; // { sheet, row, col, note }

  // Process each section in batch
  var sections = Object.keys(bySection);
  for (var s = 0; s < sections.length; s++) {
    var sectionName = sections[s];
    var requests = bySection[sectionName];
    var sectionSheet = ss.getSheetByName(sectionName);
    if (!sectionSheet) continue;

    var sectionData = sectionSheet.getDataRange().getValues();
    var sectionHeaders = sectionData[0];

    for (var r = 0; r < requests.length; r++) {
      var studentName = requests[r].row[NAME_COL];
      var arrivalTime = requests[r].row[TIME_COL];
      var reason = requests[r].row[REASON_COL];

      // Find the student's row in the section tab (Col A = Name)
      var rowIdx = -1;
      for (var ri = 1; ri < sectionData.length; ri++) {
        if (sectionData[ri][0] === studentName) {
          rowIdx = ri;
          break;
        }
      }

      // Find the date column that matches today's rehearsal date.
      // Section tab headers (Col B onward) are date strings like '3/30 3:30 PM'.
      // Compare date portion only (ignore time) using parseDateHeader() from Part 2.
      var today = new Date();
      var todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      var colIdx = -1;
      for (var ci = 1; ci < sectionHeaders.length; ci++) {
        var headerDate = parseDateHeader(sectionHeaders[ci]);
        if (headerDate) {
          var headerDateOnly = new Date(headerDate.getFullYear(), headerDate.getMonth(), headerDate.getDate());
          if (headerDateOnly.getTime() === todayDate.getTime()) {
            colIdx = ci;
            break;
          }
        }
      }

      if (rowIdx > -1 && colIdx > -1) {
        sectionData[rowIdx][colIdx] = 'Tardy';
        // Queue a cell note with the reason (applied after batch write)
        if (reason) {
          notesToApply.push({
            sheetName: sectionName,
            row: rowIdx + 1, // 1-based
            col: colIdx + 1, // 1-based
            note: 'Late: ' + reason + ' (Arrival: ' + arrivalTime + ')',
          });
        }
      }
    }

    // Write the modified section data back in one batch call
    sectionSheet.getRange(1, 1, sectionData.length, sectionData[0].length).setValues(sectionData);
  }

  // Apply cell notes after batch writes (setValues overwrites notes, so notes must come after)
  for (var n = 0; n < notesToApply.length; n++) {
    var noteInfo = notesToApply[n];
    var noteSheet = ss.getSheetByName(noteInfo.sheetName);
    if (noteSheet) {
      noteSheet.getRange(noteInfo.row, noteInfo.col).setNote(noteInfo.note);
    }
  }

  // Mark processed rows as "Completed" in the Late Check-Ins sheet.
  // Build a 2D array of status updates and write in one batch call per the
  // "Batch Only" mandate from Part 1. Individual setValue() calls in a loop
  // would be slow and wasteful for large approval batches.
  var statusUpdates = allData.map(function(row, idx) {
    return [idx === 0 ? row[STATUS_COL] : (row[STATUS_COL] === 'Approved' ? 'Completed' : row[STATUS_COL])];
  });
  lateSheet.getRange(1, STATUS_COL + 1, statusUpdates.length, 1).setValues(statusUpdates);

  // Commit all pending changes
  SpreadsheetApp.flush();
}

```



```javascript

/**
 * Feature_ConcernList.js
 * Generates a snapshot of students who are not present at the current rehearsal.
 */

/**
 * Builds the Concern List for the current rehearsal date.
 * Iterates all section tabs, finds today's date column, and collects
 * students whose status is not "Present", not "Excused", and not empty.
 */
function generateConcernList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var today = new Date();
  var todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  var concernData = [['Section', 'Name', 'Status', 'Date']];

  for (var t = 0; t < SECTION_TABS.length; t++) {
    var section = SECTION_TABS[t];
    var sheet = ss.getSheetByName(section);
    if (!sheet) continue;

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    // Find the column for today's date using parseDateHeader() from Part 2
    var todayColIdx = -1;
    for (var ci = 1; ci < headers.length; ci++) {
      var headerDate = parseDateHeader(headers[ci]);
      if (headerDate) {
        var headerDateOnly = new Date(headerDate.getFullYear(), headerDate.getMonth(), headerDate.getDate());
        if (headerDateOnly.getTime() === todayDate.getTime()) {
          todayColIdx = ci;
          break;
        }
      }
    }
    if (todayColIdx === -1) continue; // Date not added to this section yet

    for (var i = 1; i < data.length; i++) {
      var studentName = data[i][0];
      var status = data[i][todayColIdx];

      // Include only students with a concerning status:
      // Absent, Tardy, or any non-standard value.
      // Exclude: empty (not yet processed), "Present", and "Excused".
      if (studentName && status && status !== 'Present' && status !== 'Excused') {
        concernData.push([section, studentName, status, headers[todayColIdx]]);
      }
    }
  }

  var concernSheet = ss.getSheetByName('Concern List');
  if (!concernSheet) return;

  // Clear previous data, preserving formatting
  var lastRow = concernSheet.getLastRow();
  if (lastRow > 0) {
    concernSheet.getRange(1, 1, lastRow, 4).clearContent();
  }

  // Write the new concern list in one batch
  if (concernData.length > 0) {
    concernSheet.getRange(1, 1, concernData.length, concernData[0].length).setValues(concernData);
  }

  SpreadsheetApp.flush();
}

```
