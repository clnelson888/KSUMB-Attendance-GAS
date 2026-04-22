# Refinement Plan — Statuses, Notes, Roster Sync, Data Source

Author: Cameron | Date: 2026-04-15
Scope: Yellow Sheet, Pink Sheet, Database, `syncRosterToForms`, Data tab.

This plan breaks the change list into five independent chunks. Each chunk is sized so it can be handed to a single agent or tackled in one sitting. Each chunk names the files in play, the concrete deliverables, and the verification steps. **Before coding any API that is not already used elsewhere in the repo, verify against `@types/google-apps-script` or official docs (see `SUMMARY - Verified GAS API Reference & Project Context.md` and `AGENT - GAS Project Development Process`)** — we've already been burned once by a hallucinated API (`copyDataValidationsToRange`).

---

## Chunk 1 — Unified Status Data Validation ("chips" + colors)

**Goal:** Yellow Sheet and Pink Sheet `Status` columns share one data-validation definition, driven by `CONFIG_KEYS.STATUS_*`, rendered as **chip-style dropdowns** with per-value background colors that are configurable from the Settings dialog.

### What's wrong today

- `Feature_YellowSheets.js` and `Feature_PinkSheets.js` write status strings to the Status column but never _apply_ a DataValidation object. Staff can type anything.
- No color semantics exist. Pending/Approved/Denied/Completed look identical.
- Settings dialog has no UI for chip colors.

### Deliverables

1. **New helper** in a new file `src/StatusValidationLogic.js` (pure logic, no GAS globals except `SpreadsheetApp` when building the rule):
   - `buildStatusDataValidation()` → returns a `DataValidation` built with `SpreadsheetApp.newDataValidation().requireValueInList([PENDING, APPROVED, DENIED, COMPLETED], true).setAllowInvalid(false).build()`. Using `requireValueInList` with `showDropdown=true` is what renders Google Sheets' chip UI by default.
   - `getStatusColorMap()` → `{ [status]: hexColor }` pulled from settings, defaulting to:
     - Pending `#ffe5a0` (light yellow 2-ish)
     - Approved `#bfe1f6` (light cornflower blue 3-ish)
     - Denied `#ffcfc9` (light red 3-ish)
     - Completed `#d4edbc` (light green 3-ish)
   - `applyStatusValidationToColumn(sheet, headerMap, statusKey)` → finds the Status column, extends validation + conditional-format rules only across the **used data range** (rows 2..lastRow), not the whole column. Mirror the "expanding range" pattern used by the roster sync — i.e., re-apply after rows are added.
2. **New config keys** in `src/Config.js`:
   - `STATUS_COLOR_PENDING`, `STATUS_COLOR_APPROVED`, `STATUS_COLOR_DENIED`, `STATUS_COLOR_COMPLETE` with the hex defaults above.
3. **Settings dialog** (`src/Feature_Settings.js` + its HTML): add four color pickers (`<input type="color">`) bound to the new keys. Use the same save path (`setConfigValues`).
4. **Wire-up points** — call `applyStatusValidationToColumn` after every write that could introduce a new row:
   - `upsertYellowSheetSubmission` in `Feature_YellowSheets.js:82`
   - `onPinkSubmit` in `Feature_FormSync.js:82` (after `appendRow`)
   - The manual "process" paths so re-runs don't drop validation.
5. **Colors** — conditional formatting is the right mechanism (data validation itself can't color chips across custom hex values reliably via GAS). Build one `ConditionalFormatRule` per status using `SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(statusString).setBackground(hex).setRanges([statusRange])`, replacing prior rules for the Status column only.

### Verification

- Re-open the Yellow Sheets and Pink Sheets tabs — the Status cell should show a chip dropdown with the four values and correct colors.
- Edit a settings color → re-run status sync → chip color updates on next refresh.

### Flag for verification before coding

- Confirm that `requireValueInList(..., true)` still produces chip UI in the current Sheets runtime (as of 2026). If not, document the fallback (arrow dropdown) instead of inventing an API.

---

## Chunk 2 — Yellow Sheet Workflow & Notes

**Goal:** Submission-time notes, approved-note timestamps, richer form descriptions.

### What's wrong today

- `getPendingYellowSheetNoteText` (`YellowSheetLogic.js:40`) returns a hardcoded `'Pending Yellow Sheet'` with no submitted date/time.
- `buildYellowSheetApprovedNote` does not include submission date. Time formatting is inconsistent across the codebase.
- The Yellow Sheet form has no description under "Notes" or the optional time fields, so students often omit context (class number, professor).

### Deliverables

1. **Note text updates** in `src/YellowSheetLogic.js`:
   - `getPendingYellowSheetNoteText(submittedAt, tz)` → `"Pending Yellow Sheet\nSubmitted: {M/d/yyyy H:MM AM/PM}"`.
   - `buildYellowSheetApprovedNote(days, startLabel, endLabel, submittedAt, approvedAt, tz)` → includes `Submitted:` and `Approved:` lines with the same `H:MM AM/PM` format (note: the format token for Apps Script is `h:mm a`; document the exact format token used so Pink and Yellow match).
2. **Call-site updates**:
   - `Feature_YellowSheets.js:121` pass `payload.submittedAt` and `getAppTimezone()` into the pending note.
   - `Feature_YellowSheets.js:160` pass submitted + processed timestamps into the approved note. Source the submitted timestamp from the row (`allData[i][headerMap.submittedAt]`).
3. **Form description additions** in `src/Feature_FormBuilder.js::_buildYellowForm` (around line 233):
   - Notes item → `setHelpText('Include the class number and professor (e.g., "MUSIC 285 — Dr. Smith").')`.
   - Optional time questions (if "additional times" fields exist or are being added) → add `setHelpText('Use this if the conflict happens on a second time block different from the primary above.')`. If those fields don't exist yet, scope this to _adding_ them — call that out explicitly in the PR.
4. **Consistent timestamp format constant** — add `const DATETIME_NOTE_FORMAT = 'M/d/yyyy h:mm a';` in `Config.js` and reuse it in both Yellow and Pink note builders.

### Verification

- Submit a test yellow sheet → check the note on the section tab cell contains the submitted timestamp in `M/d/yyyy h:mm a`.
- Approve it → the approved note shows both submitted and approved timestamps.

---

## Chunk 3 — Pink Sheet Workflow, Notes & Date Format

**Goal:** Pink Sheet attendance only fills `Excused` when Approved; notes carry timestamps through the full pending → approved/denied lifecycle; the date displayed matches the rest of the system (`M/d/yyyy`).

### What's wrong today (file references)

- `determinePinkSheetAction` (`PinkSheetLogic.js:29-35`) treats **Pending** the same as Approved — both write `Excused` when a matching date column exists. This is wrong per the new rule: **pending must never mark Excused**.
- `processSinglePinkSheet` (`Feature_PinkSheets.js:125-128`) always writes `EXCUSED` whenever `action.writeAttendance` is true.
- `processSinglePinkSheet:122` formats `payload.submittedAt` as `'M/d/yyyy h:mm a'`, but the date column itself (written by `onPinkSubmit` in `Feature_FormSync.js:101`) is raw from Forms (`_field(...)`, a string like `2026-04-15`). There's no normalization to `M/d/yyyy`.
- The note only carries submitted time + current status. It does not retain _status transitions_ (submitted + denied dates when denied; submitted + approved dates when approved).
- After approval the queue processor flips status to `Completed` and re-processes — but if the row was originally Pending with a pre-filled note, that Pending note may be overwritten or lost.

### Deliverables

1. **Logic change** in `src/PinkSheetLogic.js::determinePinkSheetAction`:
   - Pending → `writeAttendance: false`, `writeNote: hasMatchingDate`, `nextStatus: pending` (stays pending until staff acts).
   - Approved → unchanged (writes `Excused`, completes).
   - Denied → unchanged (no attendance write, notes denied).
2. **Note builder** in `PinkSheetLogic.js::buildPinkSheetNoteText` — rewrite signature to:
   ```
   buildPinkSheetNoteText({ submittedAt, statusValue, approvedAt, deniedAt }, tz)
   ```

   - Pending → `"Pink Sheet pending\nSubmitted: {ts}"`. Tell section leaders this pink sheet is **un-approved**.
   - Approved → `"Pink Sheet approved\nSubmitted: {ts}\nApproved: {ts}"`.
   - Denied → `"Pink Sheet denied\nSubmitted: {ts}\nDenied: {ts}"`.
3. **Date normalization**:
   - When writing to `Pink Sheets.Date` (`Feature_FormSync.js:101`), parse the raw string with `new Date(value)` (Forms DATE items return `yyyy-MM-dd`; this is safe in America/Chicago). Store it as a real `Date`. Format for display using `Utilities.formatDate(date, tz, 'M/d/yyyy')` wherever the cell is shown, matching the other queue sheets.
   - `processSinglePinkSheet` already coerces to Date — keep that. Add an explicit display-formatter pass when writing back to notes.
4. **Re-process on approval**: `processPinkSheetActions` already handles status transitions, but ensure that when a row flips from Pending → Approved, the approved-timestamp is captured. Store `Approved At` / `Denied At` either as new columns on the Pink Sheets tab (preferred, explicit) or synthesize from `Processed At` + the prior status (fragile). **Recommend new columns.**

### Verification

- Submit a Pink Sheet for a matching future date → section tab cell gets a **note only** (no `Excused`).
- Staff flips Status to `Approved` → section cell becomes `Excused`, note updates to include Approved timestamp.
- Staff flips Status to `Denied` → section cell attendance remains blank, note shows Denied timestamp.

---

## Chunk 4 — Database / Roster Sync Hardening

**Goal:** Handle duplicate names, produce accurate counts in toasts/logs, and repair the "Database tab must contain Full Name, Section, and Active columns" error.

### What's wrong today (file references)

- `getDatabaseRosterBySection` (`Feature_RosterSync.js:8`) throws when any of `Full Name`, `Section`, or `Active` is missing. The error we hit most likely means the script read a non-table range (see Chunk 5 below). Fix the root cause in the Data chunk, but **also** make this check surface the actual headers seen: `throw new Error('Database tab missing columns. Expected: Full Name, Section, Active. Got: ' + JSON.stringify(headers));` — match the helpful error already used in `_getRosterData`.
- `_getRosterData` (`Feature_FormBuilder.js:315-318`) de-dupes on full-name alone, silently dropping the second person. Real incident: two `Thompson, Emma` (Color Guard + Trumpet) → Color Guard got dropped.
- `syncRosterToForms` (`Feature_FormSync.js:34`) toasts member and question counts but doesn't report added/updated/deleted/ignored. Logging is similarly thin.

### Deliverables

1. **Dedup by (name, section)** in `_getRosterData`:
   - Key: `section + '||' + fullName`. Only warn/skip when the _exact same_ (section, name) pair repeats.
   - When the same name appears in two sections, keep both entries. Each section's form page gets its own copy.
   - Maintain `allNames` with unique names (section-agnostic) for any places that still need a flat list. Document whether we still need `allNames` — I suspect it's vestigial now that every form uses `namesBySection`.
2. **Header-map validation**: update `getDatabaseRosterBySection` error to include observed headers (as in `_getRosterData`). Same for any sibling readers.
3. **Sync counts**: extend `syncRosterToForms` (`Feature_FormSync.js:12`) and `syncRosterFromDatabase` (`Feature_RosterSync.js:113`) to return and log `{ added, updated, deleted, ignored }`:
   - _added_ = names in DB but not on section tab before this run.
   - _deleted_ = names on section tab not in DB this run.
   - _updated_ = existing names kept (attendance preserved).
   - _ignored_ = rows skipped because they were inactive, blank, or duplicate.
   - Toast format: `"Roster sync: +3 added, -1 removed, 412 kept, 2 ignored."` Log the same.
4. **Status-change policy** (the "Figure out how this should be handled" item):
   - Proposal: Database `Active` is the single source of truth. If `Active=false/0/"No"`, the member is **excluded** from section tabs and form name lists. If a member has attendance history, that history stays on the section tab _only_ until the next sync, which removes their row. Surface removals in the sync toast so staff notice.
   - Decision needed from Cameron before implementing: do we want a "soft delete" column (`Archived At`) on section tabs instead of hard row removal?

### Verification

- Create two `Thompson, Emma` rows in the test Database (different sections) → both appear on their respective section tabs and in each section's form page list.
- Toggle one to `Active=false` → next sync removes that row and reports `-1 removed`.

---

## Chunk 5 — Data Tab: read from the named table, not the fallback range

**Goal:** `getLegacyDataConfig` (and any other Data-tab reader) pulls from the actual structured table range, not the stale key/value block sitting below it.

### What's wrong today

- `Config.js::getLegacyDataConfig` (line 149) does `dataSheet.getDataRange().getValues()` — which reads **everything** on the tab. If there's a second, un-formatted key/value block below the table, it silently overrides real values. Also likely cause of the `Database tab must contain Full Name, Section, and Active columns` error if `getTableData('Database')` is colliding with stray rows.
- `SheetManager.js::getTableData` (line 20) also uses `getDataRange()`. Same vulnerability.

### Deliverables

1. **Range by named range or explicit header row**:
   - Preferred: use a **named range** called `DATA_CONFIG` for the Data tab's key/value table and `DATABASE_ROSTER` for the Database table. Read via `ss.getRangeByName(name).getValues()`.
   - Fallback if named ranges aren't set: detect the header row by searching the first N rows for `Full Name` / `Key` and scope the read to `header..lastContiguousRow`.
2. **Refactor `getTableData`** to accept an optional range spec or named range; leave the old signature working (defaulting to `getDataRange`) to avoid breaking every caller in one PR.
3. **`getLegacyDataConfig`** — switch to reading from `DATA_CONFIG` only; stop reading the whole tab.
4. **One-time migration helper** (optional): `auditDataSheetRanges()` — logs every sheet's detected header row and warns on orphan blocks. Useful for future debugging.

### Verification

- Add a stray `Foo | Bar` row three lines below the real Data table → `getLegacyDataConfig` no longer returns `Foo: Bar`.
- Roster sync no longer throws on a clean Database table with a stray footer row.

---

## Suggested Order & Agent Assignment

| Order | Chunk                           | Why this order                                                                  |
| ----- | ------------------------------- | ------------------------------------------------------------------------------- |
| 1     | **Chunk 5** (Data tab)          | Fixes the root cause of the Database column error; unblocks any manual testing. |
| 2     | **Chunk 4** (Roster sync)       | Depends on Chunk 5 reading headers correctly. Small, independent.               |
| 3     | **Chunk 1** (Status validation) | Infrastructure for Chunks 2 & 3 notes/status UI.                                |
| 4     | **Chunk 3** (Pink sheet)        | Biggest behavior change; test thoroughly on its own.                            |
| 5     | **Chunk 2** (Yellow sheet)      | Small polish once Chunk 1's note/format constants exist.                        |

Each chunk is small enough for one agent pass. Keep changes on feature branches off `roofy-patch-1` and open one PR per chunk so reviews stay focused.

## Open Questions for Cameron

1. Chunk 1: Do chip colors need to match _exactly_ the named Google palette colors you listed, or are the close hex values above good enough? (The named palette isn't queryable from GAS.)
2. Chunk 2: Do the "additional times" fields already exist on the Yellow Sheet form, or do they still need to be added?
3. Chunk 3: Should `Approved At` / `Denied At` be new columns on the Pink Sheets tab? (Recommended.)
4. Chunk 4: Soft-delete vs hard-remove for members flipped to `Active=false`?

---

## API Verification Log (2026-04-15, `google-dev-knowledge` MCP)

Every GAS method cited above was re-checked against `developers.google.com/apps-script/reference` via the Google developer docs MCP. Results:

| API                                                                                                                   | Status            | Notes                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SpreadsheetApp.newDataValidation().requireValueInList(values, showDropdown)`                                         | ✅ exists         | Signature confirmed. `showDropdown=true` is the documented way to get a dropdown UI; **docs do not explicitly name the chip style** — flagged in Chunk 1. |
| `SpreadsheetApp.newConditionalFormatRule()` → `whenTextEqualTo(text)` / `setBackground(color)` / `setRanges(Range[])` | ✅ exists         | All three builder methods confirmed, return `ConditionalFormatRuleBuilder` for chaining. Color param is CSS hex.                                          |
| `Utilities.formatDate(date, tz, format)` with `M/d/yyyy` and `h:mm a` tokens                                          | ✅ valid          | Tokens follow Java `SimpleDateFormat`. `h` = 12-hour, `mm` = zero-padded minutes, `a` = AM/PM.                                                            |
| `Spreadsheet.getRangeByName(name)`                                                                                    | ✅ exists         | Returns `Range`, or `null` if not found. Requires `spreadsheets` or `spreadsheets.currentonly` scope.                                                     |
| `ParagraphTextItem.setHelpText(text)`                                                                                 | ✅ exists         | Documented method on Paragraph Text Item; returns the item for chaining.                                                                                  |
| `TimeItem.setHelpText(text)`                                                                                          | ✅ exists         | Documented method on Time Item.                                                                                                                           |
| `DateItem` response via `ItemResponse.getResponse()`                                                                  | ✅ returns String | Returned as `yyyy-MM-dd` string (not a `Date` object). Chunk 3's `new Date(value)` conversion is required.                                                |

No hallucinated APIs remain in the plan. One nuance worth remembering during implementation: Google Sheets' "chip" dropdown rendering vs legacy arrow dropdown is a UI-layer detail not exposed via GAS; as of recent Sheets versions, new `requireValueInList` rules render as chips by default, but this should be visually confirmed in the target spreadsheet before we treat it as guaranteed.
