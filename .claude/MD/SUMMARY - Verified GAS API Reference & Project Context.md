# KSUMB Attendance GAS - Verified API Reference & Project Context

This document consolidates everything verified against Google's official documentation during the review of Parts 1-3. It serves as the single source of context for any new chat session working on this codebase.

---

## 1. What This Project Is

A **container-bound Google Apps Script** attached to the KSUMB (Kansas State University Marching Band) Attendance Spreadsheet. It automates:

- **DateAdd**: Inserting new rehearsal date columns across ~15 section tabs in chronological order
- **Form processing**: Handling Late Check-In, Pink Sheet (excused absence), and Yellow Sheet (class conflict) form submissions via an approval queue
- **Concern List**: Generating a real-time snapshot of students who are not present at rehearsal

**Scale**: Up to 400+ form submissions in a narrow window (entire marching band checking in simultaneously).

**Users**: Band staff who review/approve requests and trigger batch processing via custom menus.

---

## 2. Environment & Constraints

| Item | Value |
|---|---|
| Language | ES6+ JavaScript (plain `.js`, **not TypeScript**) |
| Build | Simple file copy: `src/` -> `dist/` (no transpilation, no bundler) |
| Runtime | Google Apps Script V8 engine |
| Timezone | `America/Chicago` (set in `appsscript.json`) |
| Module system | **None at runtime** — all `.js` files share a single global scope |
| Execution limit | 6 min per run (30 min for Workspace Business/Enterprise) |
| OAuth scopes | `spreadsheets.currentonly`, `script.container.ui` (least privilege) |
| IDE support | `@types/google-apps-script` + `jsconfig.json` for VSCode IntelliSense |
| Code style | Prettier: single quotes, 120-char width, 2-space indent, ES5 trailing commas |

**Things that do NOT work in GAS runtime:**
- `import` / `export` (no module system)
- TypeScript `namespace` / `export` syntax (no transpilation)
- `npm` packages (only GAS built-in services)
- Browser objects (`window`, `document`, DOM)

---

## 3. Spreadsheet Structure (Quick Reference)

| Tab | Purpose | Key Columns |
|---|---|---|
| **Database** | Source of truth for all members | Last Name, First Name, Full Name `[Last, First]`, Section, Instrument, Email, Phone, Active |
| **Data** | Config key-value pairs + dropdown lists | Key, Value, Ensembles (range), Sections (range) |
| **Yellow Sheets** | Class conflict requests (recurring) | Full Name, Ensemble, Section, Conflict Days, Start/End Time, Status, Notes |
| **Pink Sheets** | Excused absence requests (single) | Full Name, Ensemble, Section, Date, Reason |
| **Late Check-Ins** | Late arrival logs | Full Name, Section, Arrival Time, Reason |
| **Section tabs** (x15) | Per-section attendance grids | Name `[Last, First]`, then date columns (`3/30 3:30 PM`) |
| **Concern List** | Generated snapshot of non-present students | Section, Name, Status, Date |

**15 Section tabs**: Piccolo, Clarinet, Alto Sax, Tenor Sax, Trumpet, Horn, Trombone, Baritone, Tuba, Percussion, Classy Cats, Color Guard, Twirlers, Drum Majors, Student Staff

**Primary lookup key**: `Full Name [Last, First]` (exact match via form dropdowns)

**Attendance states**: `"Present"`, `"Absent"`, `"Tardy"`, `"Excused"`

---

## 4. Verified GAS API Patterns

All code examples below have been verified against Google's official documentation via the Google Developer Knowledge MCP.

### 4.1 Batch Read/Write (Mandatory)

Never use `.getValue()` / `.setValue()` in a loop. Google's own benchmarks: loop = ~70 seconds, batch = ~1 second for 10,000 cells.

```javascript
// READ: one call, store in memory
var data = sheet.getDataRange().getValues(); // returns 2D array

// PROCESS: native JS array methods
var filtered = data.filter(function(row) { return row[0] === 'Smith, John'; });

// WRITE: one call back to sheet
sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
```

### 4.2 LockService (When Needed)

Use when multiple concurrent triggers write to the same sheet. **Critical: call `flush()` before releasing.**

```javascript
var lock = LockService.getScriptLock();
try {
  lock.waitLock(30000);
  // ... batch read/write operations ...
} catch (e) {
  console.error('Lock timeout', e);
} finally {
  SpreadsheetApp.flush(); // MUST come before releaseLock()
  lock.releaseLock();
}
```

- `getScriptLock()` — prevents ALL concurrent execution (any user, any context)
- `getDocumentLock()` — prevents concurrent execution within the same document (returns `null` for standalone scripts)
- `waitLock()` throws on timeout; `tryLock()` returns false
- `flush()` commits pending batched writes while you still hold exclusive access

**Current project decision**: LockService is NOT used for form submissions (the approval queue eliminates concurrent writes). It may be needed if the DateAdd feature ever runs concurrently with other operations.

### 4.3 SpreadsheetApp.flush()

Forces all pending spreadsheet operations to execute immediately. Use:
- Before `releaseLock()` (required by Google's docs)
- After bulk operations across multiple tabs (e.g., DateAdd inserting columns in 15 tabs)
- When you need writes visible to other concurrent executions

### 4.4 Column Insertion & Format Copying

```javascript
// Insert column
sheet.insertColumnBefore(colIndex); // inserts before the given 1-based position
sheet.insertColumnAfter(colIndex);  // inserts after the given 1-based position

// Copy formatting and data validation to the new column
var source = sheet.getRange(2, sourceCol, lastRow - 1, 1);
var target = sheet.getRange(2, targetCol, lastRow - 1, 1);
source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
```

**CopyPasteType enum values** (verified):
- `PASTE_NORMAL` — values, formulas, formats, merges
- `PASTE_FORMAT` — cell formatting only
- `PASTE_DATA_VALIDATION` — dropdowns, value constraints only
- `PASTE_CONDITIONAL_FORMATTING` — color rules only
- `PASTE_VALUES` — values only, no formats/formulas
- `PASTE_FORMULA` — formulas only
- `PASTE_COLUMN_WIDTHS` — column widths only
- `PASTE_NO_BORDERS` — values, formulas, formats, merges, minus borders

**IMPORTANT**: `Range.copyDataValidationsToRange()` does **NOT exist**. This was a Gemini hallucination. Always use `copyTo()` with `CopyPasteType`.

### 4.5 Cell Notes

```javascript
// Single cell
sheet.getRange(row, col).setNote('Note text'); // null removes the note

// Batch (2D array matching range dimensions)
sheet.getRange(2, 3, 3, 2).setNotes([['a', 'b'], ['c', 'd'], ['e', 'f']]);

// IMPORTANT: setValues() overwrites notes. Apply notes AFTER setValues().
```

### 4.6 onFormSubmit Event Object (Sheets Trigger)

When a form linked to this spreadsheet is submitted:

```javascript
function onFormSubmit(e) {
  e.namedValues  // { 'Full Name': ['Doe, Jane'], 'Section': ['Tuba'] }  <-- PREFERRED
  e.values       // ['6/7/2025 20:54:13', 'jane@ksu.edu', 'Doe, Jane', ...]  <-- fragile
  e.range        // Range object of the newly appended row
  e.triggerUid   // ID of the installable trigger
}
```

**Always prefer `e.namedValues`** — resilient to column reordering. Avoid `e.values` with hardcoded indexes.

**Caution**: Must use `SpreadsheetTriggerBuilder.onFormSubmit()` (not `FormTriggerBuilder`) for Sheets-side form submit triggers.

### 4.7 Custom Menus

```javascript
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu('Attendance')
    .addItem('Add rehearsal date', 'addRehearsalDate')
    .addItem('Process approved requests', 'processApprovedLateCheckIns')
    .addItem('Generate concern list', 'generateConcernList')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Advanced')
      .addItem('Reprocess pink sheets', 'processPendingPinkSheets'))
    .addToUi();
}
```

- `onOpen` is a simple trigger — runs automatically when the sheet is opened by an editor
- Menu item `functionName` must be a global function name (string)
- Menu labels: sentence case for items, headline case for top-level menu

### 4.8 Timezone-Safe Date Formatting

The spreadsheet timezone is `America/Chicago` but GAS `Date` objects default to `America/Los_Angeles` for string methods like `toLocaleDateString()`. **Always use `Utilities.formatDate()`**:

```javascript
var date = new Date();
var formatted = Utilities.formatDate(date, 'America/Chicago', 'M/d h:mm a');
// e.g., "3/30 3:30 PM"

// For date-only comparison:
var dateOnly = Utilities.formatDate(date, 'America/Chicago', 'M/d');
```

Format patterns follow [Java SimpleDateFormat](http://docs.oracle.com/javase/7/docs/api/java/text/SimpleDateFormat.html).

### 4.9 PropertiesService (Persistent Key-Value Storage)

Use for data that must persist across executions (e.g., retry queues for failed form submissions):

```javascript
var props = PropertiesService.getScriptProperties();
props.setProperty('key', 'value');       // strings only
props.getProperty('key');                // returns string or null
props.setProperties({a: '1', b: '2'});  // bulk set
props.getProperties();                   // returns {key: value} object
```

- **Script Properties**: shared by all users of the script
- **Document Properties**: shared by all users of the current document
- **User Properties**: private to the current user
- All values are stored as strings (auto-converted)
- Persists indefinitely (unlike CacheService which expires after max 6 hours)

### 4.10 Installable Trigger Registration

```javascript
// Create a form-submit trigger (Sheets-side)
ScriptApp.newTrigger('onFormSubmit')
  .forSpreadsheet(SpreadsheetApp.getActive())
  .onFormSubmit()
  .create();

// Create a time-driven trigger (e.g., for retry queue sweep)
ScriptApp.newTrigger('sweepRetryQueue')
  .timeBased()
  .everyMinutes(5)
  .create();
```

- Installable triggers run with the authorization of the creator
- Must be created manually or via script — not automatic from code deployment
- Subject to [quota limits](https://developers.google.com/apps-script/guides/services/quotas)

---

## 5. File Structure (Target)

```
src/
  code.js              # onOpen menu, trigger registration
  Config.js            # SECTION_TABS constant, getConfig() memoized reader
  SheetManager.js      # getTableData(), writeTableData() batch utilities
  Feature_DateAdd.js   # parseDateHeader(), addRehearsalDate()
  Feature_QueueProcessor.js  # processApprovedLateCheckIns(), processApprovedPinkSheets()
  Feature_ConcernList.js     # generateConcernList()
  html/                # UI dialogs/sidebars (if needed)
dist/
  appsscript.json      # GAS manifest (scopes, runtime, services)
  *.js                 # Build output (copies of src/)
```

All functions are **global** (no modules, no namespaces). Name functions descriptively to avoid collisions.

---

## 6. Approval Workflow (Eliminates Concurrency Risk)

Instead of `onFormSubmit` triggers writing directly to section tabs (which would require LockService for 400+ concurrent submissions), the system uses a 4-phase queue:

1. **Native submit**: Forms append rows to their response tabs (`Pink Sheets`, `Yellow Sheets`, `Late Check-Ins`)
2. **Default status**: New rows have Status = `"Pending"`
3. **Human review**: Staff changes Status dropdown to `"Approved"` or `"Denied"`
4. **Batch process**: Staff clicks `Attendance > Process approved requests` menu item, which:
   - Reads all `"Approved"` rows into memory
   - Groups by Section to minimize sheet reads
   - Updates the section tab attendance cells in batch
   - Marks processed rows as `"Completed"`
   - Calls `SpreadsheetApp.flush()` once at the end

This eliminates concurrent write conflicts entirely.

---

## 7. Known Pitfalls & Gotchas

### Date Parsing
- Section tab date headers use format `M/D h:mm a` (e.g., `3/30 3:30 PM`) **without a year**
- `new Date('3/30 3:30 PM')` fails — must append the current year
- Sheets may store headers as actual `Date` objects or as strings — check `instanceof Date` before calling `toString()`
- Always compare dates via `getTime()` equality, never string comparison

### Timezone
- `appsscript.json` sets timezone to `America/Chicago`
- But `new Date().toLocaleDateString()` uses `America/Los_Angeles` in GAS
- Always use `Utilities.formatDate(date, 'America/Chicago', pattern)` for display strings
- For date-only comparison, strip the time component: `new Date(d.getFullYear(), d.getMonth(), d.getDate())`

### setValues Overwrites Notes
- `Range.setValues()` clears any existing cell notes in the target range
- Apply notes with `setNote()` / `setNotes()` **after** the `setValues()` call

### Conditional Formatting Auto-Expands
- When columns are inserted via `insertColumnBefore()`, sheet-level conditional formatting rules auto-expand their ranges
- You do NOT need to manually copy conditional formatting rules for new columns
- `CopyPasteType.PASTE_FORMAT` copies **cell-level** formatting only (colors, borders, number format)
- `CopyPasteType.PASTE_CONDITIONAL_FORMATTING` copies **sheet-level** color rules

### Header Name Ambiguity
- The Sheets Structure doc defines tab headers (e.g., `Full Name`, `Section`)
- Form response tabs may use the raw form question text (e.g., `Your Name`, `What is your section?`)
- Always use `headers.indexOf('...')` with the **actual** header text, never hardcoded column indexes
- Verify by reading row 1 of each tab

### getMaxRows() vs getLastRow()
- `getMaxRows()` returns ALL rows in the sheet (including empty ones, could be 1000+)
- `getLastRow()` returns the last row with content
- Use `getLastRow()` for data operations; `getMaxRows()` only when you need the entire grid

---

## 8. Functions Not Yet Implemented

The following are referenced in the guidelines but not yet built:

| Function | Referenced In | Purpose |
|---|---|---|
| `processPendingPinkSheets(dateString)` | Part 2 (DateAdd cross-trigger) | Sweep Pink Sheets tab for approved absences matching the new date |
| `processApprovedPinkSheets()` | Part 3 (Queue Processor) | Batch process approved Pink Sheet requests -> set "Excused" in section tabs |
| `processApprovedYellowSheets()` | Part 3 (Queue Processor) | Batch process approved Yellow Sheet requests -> apply recurring conflict markers |
| `onOpen(e)` | Part 3 (Custom Menu) | Register the Attendance custom menu on spreadsheet open |

---

## 9. OAuth Scopes Reference

Current scopes in `dist/appsscript.json`:

| Scope | Grants |
|---|---|
| `spreadsheets.currentonly` | Read/write only the bound spreadsheet |
| `script.container.ui` | Custom menus, dialogs, sidebars |

If form manipulation is needed later (e.g., updating form dropdowns from the Database tab), add `forms.currentonly`.

**Never** use the generic `spreadsheets` scope (full access to all spreadsheets) unless cross-spreadsheet access is required.
