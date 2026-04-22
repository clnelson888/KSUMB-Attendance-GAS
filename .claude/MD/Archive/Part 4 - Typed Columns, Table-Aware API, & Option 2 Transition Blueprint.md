# Part 4: Typed Columns, Table-Aware API, & Option 2 Transition Blueprint

This document records the research and decisions made around the "typed columns" runtime error, compares the two resolution approaches, and provides a complete implementation blueprint for a future chat to transition the codebase to the Advanced Sheets API (Option 2) if desired.

---

## 1. The Problem: "This operation is not allowed on cells in typed columns"

### What happened

Running **Initialize System**, **Validate Environment**, or opening **Settings** threw:

```
Exception: This operation is not allowed on cells in typed columns.
```

### Root cause

Google Sheets introduced a **Tables** feature (2024) where columns can be assigned a type: `Dropdown`, `Date`, `Number`, `Checkbox`, etc. When any column in a sheet has a typed column assigned, the GAS `SpreadsheetApp` API **blocks all writes to that column** via:

- `Range.setValues()`
- `Range.setValue()`
- `Range.setDataValidation()`
- `Sheet.appendRow()`

This is enforced at the Sheets engine level. There is no way to bypass it from within the `SpreadsheetApp` service. It is not a permissions issue.

### Affected functions (at time of discovery)

| Function | File | Operation blocked |
|---|---|---|
| `ensureHeaders()` | `Feature_Admin.js:99` | `setValues([headers])` on header row |
| `normalizeLegacyStatusValues()` | `Feature_Admin.js:146` | `setValues()` on Status column |
| `applyQueueStatusValidation()` | `Feature_Admin.js:178` | `setDataValidation()` on Status column |
| `logSystemEvent()` | `Feature_Admin.js:195` | `appendRow()` on System Log |

The error also surfaces during normal processing (any time a queue row's Status is written back) if the Status column remains typed.

---

## 2. Resolution Applied (Option 1)

**In the Google Sheets UI:** For each of `Pink Sheets`, `Late Check-Ins`, `Yellow Sheets`, `Concern List`, and `System Log` — the column type on all columns was changed to **None** (`COLUMN_TYPE_UNSPECIFIED`).

This removes the write restriction entirely. The sheets retain their Table formatting (banded rows, header styling, filters) but no column type enforcement is active. GAS `setValues`, `setDataValidation`, and `appendRow` all work normally again.

**This is the current state of the codebase. No code changes were required.**

---

## 3. Option 2: Advanced Sheets API (Table-Aware)

Option 2 was researched but **not implemented**. It is documented here as a complete blueprint.

### What it is

Use the **Advanced Sheets Service** (`Sheets` global, available as an advanced service in GAS) to interact with table column properties directly via the Sheets REST API v4 `batchUpdate` endpoint, instead of using `SpreadsheetApp.setDataValidation()`.

This would allow keeping the `DROPDOWN` column type (chip-style dropdowns) while still updating the dropdown options programmatically.

### MCP-Verified API Facts (Sheets API v4)

All of the following were confirmed against Google's official documentation via the `google-dev-knowledge` MCP.

#### ColumnType enum

```
COLUMN_TYPE_UNSPECIFIED   — No type (plain cell, no restrictions)
DOUBLE                    — Number
CURRENCY                  — Currency
PERCENT                   — Percent
DATE                      — Date
TIME                      — Time
DATE_TIME                 — Date + Time
TEXT                      — Text
BOOLEAN                   — Checkbox
DROPDOWN                  — Chip-style dropdown (requires dataValidationRule)
FILES_CHIP                — File smart chip
PEOPLE_CHIP               — People smart chip
FINANCE_CHIP              — Finance smart chip
PLACE_CHIP                — Place smart chip
RATINGS_CHIP              — Ratings smart chip
```

#### TableColumnProperties schema

```json
{
  "columnIndex": 0,
  "columnName": "Status",
  "columnType": "DROPDOWN",
  "dataValidationRule": {
    "condition": {
      "type": "ONE_OF_LIST",
      "values": [
        { "userEnteredValue": "Pending" },
        { "userEnteredValue": "Approved" }
      ]
    }
  }
}
```

- `dataValidationRule` is **only valid for `DROPDOWN` type**. Other column types must not set it.
- The `condition.type` must be `ONE_OF_LIST` for dropdowns.

#### Rate limits and cost

| Metric | Value |
|---|---|
| Cost | **Free** — no charges at any usage level |
| Write quota | 300 requests/minute per project |
| Write quota | 60 requests/minute per user per project |
| Overage behavior | `429: Too Many Requests` (no billing) |
| Quota increase | Requestable via Google Cloud Console |

`initializeSystem` would make ~3 `batchUpdate` calls (one per queue sheet). This is nowhere near any limit.

#### Scope change required

The Advanced Sheets Service requires the broader OAuth scope:

```
FROM: https://www.googleapis.com/auth/spreadsheets.currentonly
TO:   https://www.googleapis.com/auth/spreadsheets
```

This change:
- Allows read/write access to **all** spreadsheets the user can access (not just the bound one)
- Will **force all existing users to re-authorize** on next open
- Conflicts with the project's stated least-privilege policy

> **Architectural note**: The existing guideline in `KSUMB Attendance System GAS Architecture & Coding Guidelines.md` explicitly states: *"Never use the generic `spreadsheets` scope unless absolute cross-spreadsheet access is definitively required."* This is the primary non-trivial downside of Option 2.

---

## 4. Implementation Blueprint (Option 2)

If a future session decides to implement Option 2, the following is the complete pattern.

### 4.1 Enable the Advanced Service

In `dist/appsscript.json`:

```json
{
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Sheets",
        "serviceId": "sheets",
        "version": "v4"
      }
    ]
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.container.ui"
  ]
}
```

The `Sheets` global is already listed as enabled in the current manifest for the Advanced Sheets API. **Only the scope needs to change.**

### 4.2 Discovering the Table ID

There is no GAS method like `sheet.getTables()`. Table IDs must be discovered via an API call. The table ID is a stable string that does not change once the table is created.

```js
/**
 * Returns a map of { sheetId -> { tableId, columnProperties[] } }
 * for all sheets that have exactly one table.
 *
 * @returns {Object}
 */
function getSpreadsheetTableSchema() {
  var ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
  var ssData = Sheets.Spreadsheets.get(ssId, {
    fields: 'sheets(properties.sheetId,properties.title,tables)',
  });

  var schema = {};
  var sheets = ssData.sheets || [];
  for (var i = 0; i < sheets.length; i++) {
    var sheetMeta = sheets[i];
    if (!sheetMeta.tables || !sheetMeta.tables.length) continue;
    var table = sheetMeta.tables[0];
    schema[sheetMeta.properties.title] = {
      sheetId: sheetMeta.properties.sheetId,
      tableId: table.tableId,
      columnProperties: table.columnProperties || [],
    };
  }
  return schema;
}
```

**Caching recommendation**: Store the result in `PropertiesService.getDocumentProperties()` as JSON so `initializeSystem` only discovers IDs once, and subsequent calls read from cache:

```js
var PROP_KEY_TABLE_SCHEMA = 'TABLE_SCHEMA_CACHE';

function getCachedTableSchema() {
  var props = PropertiesService.getDocumentProperties();
  var cached = props.getProperty(PROP_KEY_TABLE_SCHEMA);
  if (cached) return JSON.parse(cached);

  var schema = getSpreadsheetTableSchema();
  props.setProperty(PROP_KEY_TABLE_SCHEMA, JSON.stringify(schema));
  return schema;
}

function clearTableSchemaCache() {
  PropertiesService.getDocumentProperties().deleteProperty(PROP_KEY_TABLE_SCHEMA);
}
```

Call `clearTableSchemaCache()` at the start of `initializeSystem` to force a fresh discovery after any structural changes.

### 4.3 Replacing `applyQueueStatusValidation`

**Current implementation** (`Feature_Admin.js:159`):

```js
function applyQueueStatusValidation(sheet) {
  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var statusIndex = headerRow.indexOf('Status');
  if (statusIndex === -1) return;

  var statuses = /* ... */;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statuses, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, statusIndex + 1, Math.max(sheet.getMaxRows() - 1, 1), 1)
    .setDataValidation(rule);
}
```

**Option 2 replacement**:

```js
/**
 * Updates the Status column dropdown on a queue sheet using the Advanced
 * Sheets API so the DROPDOWN column type (chip style) is preserved.
 * Falls back to setDataValidation if no table is found on the sheet.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} statuses
 */
function applyQueueStatusValidationViaTable(sheet, statuses) {
  var schema = getCachedTableSchema();
  var sheetSchema = schema[sheet.getName()];

  if (!sheetSchema) {
    // No table on this sheet — use plain data validation.
    applyQueueStatusValidation(sheet);
    return;
  }

  // Find the Status column's table-relative index.
  var statusColIndex = null;
  var cols = sheetSchema.columnProperties;
  for (var c = 0; c < cols.length; c++) {
    if (cols[c].columnName === 'Status') {
      statusColIndex = cols[c].columnIndex;
      break;
    }
  }

  if (statusColIndex === null) {
    applyQueueStatusValidation(sheet);
    return;
  }

  var dropdownValues = statuses.map(function (s) {
    return { userEnteredValue: s };
  });

  var ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
  Sheets.Spreadsheets.batchUpdate(
    {
      requests: [
        {
          updateTable: {
            table: {
              tableId: sheetSchema.tableId,
              columnProperties: [
                {
                  columnIndex: statusColIndex,
                  columnType: 'DROPDOWN',
                  dataValidationRule: {
                    condition: {
                      type: 'ONE_OF_LIST',
                      values: dropdownValues,
                    },
                  },
                },
              ],
            },
            fields: 'columnProperties',
          },
        },
      ],
    },
    ssId
  );
}
```

### 4.4 Replacing `normalizeLegacyStatusValues` (Status column writes)

The `normalizeLegacyStatusValues` function writes directly to Status column cells, which would still be blocked even under Option 2 (writing *values* into a typed cell still fails). For this function, **no table API is needed** — the fix is the same as Option 1: the Status column must be `COLUMN_TYPE_UNSPECIFIED` (None) if values are written programmatically, even when using Option 2.

> **Key insight**: Option 2 solves the `setDataValidation` restriction only. `setValues` on a DROPDOWN-typed cell is **still blocked** regardless of API path. If rows need to be written to a DROPDOWN column, the column type must be None.

### 4.5 Summary of functions that would change

| Function | File | Change Required |
|---|---|---|
| `applyQueueStatusValidation` | `Feature_Admin.js` | Replace with `applyQueueStatusValidationViaTable` |
| `initializeSystem` | `Feature_Admin.js` | Add `clearTableSchemaCache()` at start; add `getSpreadsheetTableSchema()` helper |
| `appsscript.json` | `dist/` | Scope: `spreadsheets.currentonly` → `spreadsheets` |
| `normalizeLegacyStatusValues` | `Feature_Admin.js` | **No change** — Status column must still be None for value writes |
| `ensureHeaders` | `Feature_Admin.js` | **No change** — header row writes require None-typed columns regardless |
| `logSystemEvent` / `appendRow` | `Feature_Admin.js` | **No change** — `appendRow` is still blocked on typed columns even with Advanced API |

---

## 5. Decision Summary

| | Option 1 (current) | Option 2 (blueprint) |
|---|---|---|
| **Status** | Implemented | Not implemented |
| **Scope change** | None | `spreadsheets.currentonly` → `spreadsheets` |
| **Extra API calls** | 0 | 1 per `initializeSystem` run (cacheable) |
| **Cost / rate limits** | None | None (free, well within quota) |
| **Chip-style dropdowns** | No (plain dropdown) | Yes (DROPDOWN column type) |
| **Fixes `setValues` on typed rows** | Yes (column is None) | No (value writes still blocked on typed columns) |
| **Fixes `setDataValidation`** | Yes (column is None) | Yes (via `updateTable`) |
| **Fixes `appendRow`** | Yes (column is None) | No (still blocked on typed columns) |
| **Code complexity** | Zero additional code | ~60 lines + schema caching |
| **Recommended** | **Yes** | Only if chip dropdowns are required |

### Bottom line for a new session

The codebase is currently on **Option 1**. All system-managed queue sheets (`Pink Sheets`, `Late Check-Ins`, `Yellow Sheets`, `Concern List`, `System Log`) have all columns set to **None** type in the Sheets UI. The code requires no changes.

Option 2 is viable but only gains chip-style dropdown aesthetics in exchange for a wider OAuth scope and extra code. The architectural guideline against using the broad `spreadsheets` scope is a real constraint. **Do not implement Option 2 unless chip dropdowns are explicitly requested.**

---

## 6. Verified Sheets API v4 Table Operations Reference

The following operations are confirmed available in `Sheets.Spreadsheets.batchUpdate` requests. These are the complete table-related request types:

| Request type | Purpose |
|---|---|
| `addTable` | Create a new table on a sheet range |
| `updateTable` | Modify table properties, range, or column properties |
| `deleteTable` | Delete the table and its contents |
| `appendCellsRequest` (with `tableId`) | Append rows to a table, aware of footers |
| `insertRangeRequest` | Insert rows/columns within a table (must span full row/col) |
| `deleteRangeRequest` | Delete rows/columns from a table (must span full row/col) |

Tables also support filters, filter views, and protected ranges via their standard API equivalents.

**There is no `getTables()` method in `SpreadsheetApp`.** Table discovery always requires `Sheets.Spreadsheets.get()` with `fields` including `sheets.tables`.
