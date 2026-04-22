# KSUMB Attendance GAS — Current State

**Last verified:** 2026-04-21 against `src/` on branch `roofy-patch-1`.

This is the canonical reference for the project's present-day architecture. The other files in `.claude/MD/` are historical design documents — some of their decisions made it in, some were superseded, and some (notably `Sheets Structure.md`) describe a schema that no longer matches the code. **When they disagree with this file or with the code, trust this file or the code.**

---

## 1. What the system does

A container-bound Google Apps Script attached to the KSUMB (Kansas State University Marching Band) Attendance Spreadsheet. It automates:

- **Roster sync** — pulls active members from the `Database` tab into per-section attendance tabs and into the three Google Forms.
- **Rehearsal dates** — adds and deletes rehearsal date columns across all section tabs in chronological order.
- **Three approval queues** — Pink Sheets (excused absences), Yellow Sheets (recurring class conflicts), Late Check-Ins (day-of arrivals).
- **Batch attendance application** — staff approve/deny queue rows; the script writes Excused/Tardy/etc. into the right section-tab cell and drops a dated note.
- **Concern List** — maintained with pure sheet formulas on the `Concern List` tab. The custom function `GET_SHEETS()` in `src/code.js` (returns each sheet's name + GID) is the only GAS surface the formula depends on; the prior `generateConcernList` menu command and its supporting files have been removed.

Scale target: up to ~400 submissions in a narrow window when the whole band checks in at once.

---

## 2. Build & deploy

```
src/  →  scripts/build.js (file copy)  →  dist/  →  clasp push  →  GAS project
```

Commands: `npm run build | deploy | lint | format | test` (see `package.json`).
`scriptId` in `.clasp.json` must point at a real GAS project for deploys to work.

---

## 3. Directory map (source of truth)

### Entry point
- `src/code.js` — `onOpen` (custom menus), `onEdit` (Yellow/Pink Sheets Status cell), custom function `GET_SHEETS()`.

### Features (thin GAS-aware layer)
- `src/Feature_Admin.js` — `initializeSystem`, `validateEnvironment`, managed sheet headers (`SYSTEM_SHEET_HEADERS`), `logSystemEvent`, legacy status normalization.
- `src/Feature_Maintenance.js` — `clearAttendanceHistory`, `newYearSetup`.
- `src/Feature_Settings.js` — `openSettingsDialog`, `saveSettings`, `resetSettingsToDefaults`.
- `src/Feature_DateAdd.js` — `addRehearsalDate` (dialog), `insertRehearsalDate`, `openDeleteDateDialog`, `deleteRehearsalDate`, `parseDateHeader`, default-attendance dialog.
- `src/Feature_RosterSync.js` — `syncRosterFromDatabase` (preserves per-member values + notes).
- `src/Feature_FormBuilder.js` — `buildAllForms` (builds Pink/Late/Yellow from scratch), `logFormUrls`, `inspectDatabase`, `_getRosterData`.
- `src/Feature_FormSync.js` — `syncRosterToForms`, `installFormSubmitTriggers`, `onPinkSubmit`, `onLateSubmit`, `onYellowSubmit`, `inspectFormQuestions`.
- `src/Feature_QueueProcessor.js` — `processApprovedRequests` (menu), `matchDateColumn` (date+closest-time match), `applyAttendanceUpdates`, `formatTimeValue`. Note: two `processApprovedYellowSheets` definitions exist (line 158 and 379) — the second overrides the first at load and simply delegates to `processYellowSheetActions`. The first is dead code.
- `src/Feature_PinkSheets.js` — queue-row processing for Pink Sheets (`processPinkSheetActions`, `processPinkSheetsForDate`, `processSinglePinkSheet`, `writePinkSheetOutcome`).
- `src/Feature_YellowSheets.js` — queue-row processing for Yellow Sheets (`processYellowSheetActions`, `upsertYellowSheetSubmission`).
- `src/Feature_LateCheckIn.js` — queue-row processing for Late Check-Ins (`processSingleLateCheckIn`, `processPendingLateCheckInsForDate`).

### Pure logic (GAS-free, unit-tested)
- `src/Config.js` — settings keys, defaults, Document Properties bridge (`getConfig`, `getConfigValue`, `requireConfigValue`, `getStatusValue`, `getAttendanceValue`, `isCompleteStatusValue`, `getConfiguredSectionTabs`, `getConfiguredLateReasons`, `parseConfigList`, `setConfigValues`, `resetConfigPropertiesToDefaults`, `importLegacyDataConfigToProperties`, `ensureDefaultConfigProperties`, `hasLegacyDataSheet`, `DATETIME_NOTE_FORMAT`, `EXAMPLE_DATE_HEADER`).
- `src/SheetManager.js` — `getSheet`, `getTableData`/`getTableDataWithHeaders` (named range + header-detection resolution), `writeTableData`, `_detectTableRange`, `auditDataSheetRanges`.
- `src/FormNameLogic.js` — form title constants, `normalizeSubmittedName` ("First Last" → "Last, First"), `resolveSubmittedName`, `requireResolvedSubmittedName`, `buildSectionPageTitle`, `extractSectionFromPageTitle`.
- `src/RosterSyncLogic.js` — `isRosterMemberActive`, `groupActiveRosterMembersBySection`.
- `src/LateCheckInLogic.js` — `isValidDateLike`, `parseLateThresholdMinutes`, `determineLateAttendanceStatus`, `canLateCheckInOverwriteAttendance`, `isSameCalendarDate`, `buildLateCheckInNoteText`.
- `src/PinkSheetLogic.js` — `determinePinkSheetAction`, `buildPinkSheetNoteText`.
- `src/YellowSheetLogic.js` — `getYellowSubmissionStatus`, `buildYellowSheetApprovedNote`, `getPendingYellowSheetNoteText`.
- `src/QueueStatusLogic.js` — `shouldProcessQueueStatusEdit` (+ deprecated Yellow-only wrapper).
- `src/DateQueueLogic.js` — `shouldResetQueueRowForDeletedDate`.
- `src/SettingsLogic.js` — `normalizeSettingsPayload`, `validateSettingsPayload`.
- `src/ConcernListLogic.js` — formula builders. **Scheduled for removal with Feature_ConcernList.js.**

### HTML dialogs
- `src/html/SettingsDialog.html` — Settings editor.
- `src/html/DateAddDialog.html`, `DateDeleteDialog.html` — rehearsal-date add/delete.
- `src/html/DefaultAttendanceDialog.html` — default-attendance-value config.
- `src/html/ConcernListDialog.html` — **orphaned.** No code path calls `HtmlService.createTemplateFromFile('ConcernListDialog')` anymore — the Concern List is formula-driven now. The file still calls `google.script.run.buildConcernList(dateVal)` (which exists as a back-compat wrapper). Delete when removing the Concern List feature.

### Tests (Jest)
- `tests/` — unit tests for every `*Logic.js` file plus `formBuilder.test.js` and `workflowInteractions.test.js`. `tests/helpers/gasHarness.js` is the shared GAS mock.

---

## 4. Menu structure (current)

From `src/code.js:onOpen`:

```
🥁 Attendance
├─ ➕ Add rehearsal date
├─ 🗑️ Delete rehearsal date
├─ ─────────────────
├─ ✅ Process approved requests
├─ ⚡ Generate concern list          ← to be removed
├─ ─────────────────
├─ 📋 Roster & Forms ▸
│   ├─ Sync roster from database
│   ├─ Sync roster names to forms
│   └─ Build / rebuild forms
└─ ⚠️ Admin ▸
    ├─ Settings
    ├─ Validate environment
    ├─ Initialize system
    ├─ ─────────────────
    ├─ New year setup
    └─ Clear attendance history
```

---

## 5. Spreadsheet tabs (actual, as managed by code)

From `SYSTEM_SHEET_HEADERS` in `Feature_Admin.js` and `DEFAULT_SECTION_TABS` in `Config.js`.

| Tab | Managed by | Header row |
|---|---|---|
| **Database** | User-maintained (not auto-created) | `Full Name`, `Section`, `Active` (other columns allowed; `_getRosterData` also tolerates missing `Active`) |
| **Pink Sheets** | `initializeSystem` | `Submission ID`, `Submitted At`, `Full Name`, `Section`, `Date`, `Reason`, `Status`, `Approved At`, `Denied At`, `Processed At`, `Error` |
| **Late Check-Ins** | `initializeSystem` | `Submission ID`, `Submitted At`, `Full Name`, `Section`, `Arrival Time`, `Reason`, `Other Explanation`, `Status`, `Processed At`, `Error` |
| **Yellow Sheets** | `initializeSystem` | `Submission ID`, `Response ID`, `Submitted At`, `Last Updated At`, `Full Name`, `Section`, `Conflict Days`, `Start Time`, `End Time`, `Notes`, `Status`, `Processed At`, `Error` |
| **Concern List** | `initializeSystem` | `Section`, `Name`, `Status`, `Date` *(legacy header; the formula-driven implementation overwrites the layout at runtime)* |
| **System Log** | `initializeSystem` | `Timestamp`, `Feature`, `Action`, `Severity`, `Reference ID`, `Message` |
| **Section tabs** (default 15) | `initializeSystem` creates them; `syncRosterFromDatabase` populates column A with `Last, First`; date columns live in columns 2+ | `Name`, then rehearsal date headers like `"3/30 3:30 PM"` |
| **Data** | **Legacy**, optional. `getLegacyDataConfig` still reads it; `importLegacyDataConfigToProperties` migrates values to Document Properties. `validateEnvironment` warns if it still exists. | `Key`, `Value` |

Default section tabs (from `DEFAULT_SECTION_TABS`): Piccolo, Clarinet, Alto Sax, Tenor Sax, Trumpet, Horn, Trombone, Baritone, Tuba, Percussion, Classy Cats, Color Guard, Twirlers, Drum Majors, Student Staff.

**Note on `Sheets Structure.md`:** that document is **out of date**. It lists an `Ensemble` column on the queue tabs and an `Ensembles` range in `Data` — neither exists in the code today. The section router is the "What is your section?" form question and the `Section` column across all queue tabs.

---

## 6. Configuration model

Settings live in **Document Properties** under the `CFG__` prefix (`getConfigPropertyKey`). The legacy `Data` tab is still read as a fallback/import source, but Document Properties win on conflict.

**Keys** (from `CONFIG_KEYS` in `Config.js`):
- `SECTION_TABS` — newline-delimited list of section tab names.
- `TIMEZONE` — default `America/Chicago`.
- `REHEARSAL_START_TIME` — `HH:MM` 24-hour, default `15:30`.
- `LATE_THRESHOLD_MINUTES` — integer, default `15`. Late Check-Ins submitted within this window of the rehearsal start are recorded as Present; beyond it, as Tardy.
- `STATUS_PENDING | STATUS_APPROVED | STATUS_DENIED | STATUS_COMPLETE` — defaults `Pending / Approved / Denied / Completed`.
- `ATTENDANCE_PRESENT | ATTENDANCE_TARDY | ATTENDANCE_ABSENT | ATTENDANCE_EXCUSED` — defaults `Present / Tardy / Absent / Excused`.
- `LATE_REASONS` — newline-delimited list used to populate the Late Check-In form's reason question.

Additional Script Properties (not under `CFG__`):
- `PINK_FORM_ID`, `LATE_FORM_ID`, `YELLOW_FORM_ID` — set by `buildAllForms`.
- `DEFAULT_ATTENDANCE_VALUE` — set by `setDefaultAttendanceValue`; used as the default fill for new date columns (currently the dialog exists but no code path reads this value).

Legacy-status normalization: `normalizeLegacyStatusValues` rewrites any `"Complete"` status values to `"Completed"` on load.

---

## 7. Forms architecture

`buildAllForms` (`Feature_FormBuilder.js`) creates three standalone forms (Pink, Late, Yellow), each with the same section-routing structure:

```
Page 1: "What is your section?"  (MULTIPLE_CHOICE, section choices route to per-section pages)
Per section:
  Page break — "Section — Student Information"
  Your Name                         (LIST — roster for this section)
  "If you cannot find your name in the list, enter it here as Last, First"  (TEXT)
  …form-specific questions…         (Pink: Date+Reason; Late: reason+explain; Yellow: days+times+notes)
  Submit
```

Form submit triggers (`onPinkSubmit`, `onLateSubmit`, `onYellowSubmit`):
1. Extract fields (`_responseToFields` → namedValues-style map).
2. Resolve the student name (`requireResolvedSubmittedName` — manual field wins if provided).
3. Append a Pending row to the matching queue tab.
4. Immediately run the per-row processor (`processSinglePinkSheet` / `processSingleLateCheckIn`) under a `LockService` lock. Yellow Sheet rows stay Pending until staff approves.
5. On error, write the error message to the row and log to `System Log`.

**Pink Sheet date parsing (current):** `onPinkSubmit` parses the Google Forms date string (`YYYY-MM-DD`) as local midnight rather than UTC midnight. This is the fix in the current uncommitted diff on `src/Feature_FormSync.js`.

**Late Check-In arrival time:** `submittedAt` itself is used as the arrival time — there is no separate "arrival time" question in the form.

**Late Check-In date matching:** `matchDateColumn` first matches the calendar date (`M/d`), and when multiple rehearsals share the same day picks the column whose time-of-day is closest to the arrival's time.

---

## 8. Edit-time approvals

`onEdit` in `src/code.js` responds to staff edits on `Yellow Sheets` or `Pink Sheets`:
- Guarded by `shouldProcessQueueStatusEdit` (must be a non-header row, must be the Status column, value must equal the configured Approved or Denied string).
- Yellow → `processYellowSheetActions` (writes the approved note onto the student's name cell, marks the row Completed).
- Pink → `processPinkSheetActions` (writes Excused into the matching date cell + dated note, marks the row Completed). If the rehearsal date column doesn't exist yet, the row stays Approved/Denied and gets applied later via `processPinkSheetsForDate` when the date is added.

`processApprovedRequests` (menu item) is a batch fallback for the same work.

---

## 9. Rehearsal-date lifecycle

`addRehearsalDate` (menu) → dialog → `insertRehearsalDate(dateString, timeString)`:
1. Formats header as `"M/d h:mm a"` (e.g., `3/30 3:30 PM`).
2. For each section tab: if an "example" placeholder column exists (header `EXAMPLE_DATE_HEADER = '1/1 12:00 AM'`), rename it in place (preserves data validation rules attached to that column). Otherwise insert a new column in chronological position, copying formatting + data validation from the adjacent column.
3. After all tabs update: `processPinkSheetsForDate(newDate)` and `processPendingLateCheckInsForDate(newDate)` — catches up any rows that were waiting for this rehearsal to exist.

`deleteRehearsalDate` (menu → dialog) removes the column from every section tab and resets matching Pink/Late queue rows back to Pending (`resetQueuesForDeletedDate`) so they'll be re-applied if the date is re-added.

`clearAttendanceHistory` (Admin menu) removes all date columns but leaves one placeholder column with `EXAMPLE_DATE_HEADER` so the per-row data validation rules survive.

---

## 10. Known loose ends

- `Feature_QueueProcessor.js` defines `processApprovedYellowSheets` twice. The second definition (line 379) wins at runtime. First copy is dead code.
- `Feature_DateAdd.js:openDefaultAttendanceDialog` / `setDefaultAttendanceValue` stores `DEFAULT_ATTENDANCE_VALUE` in Script Properties, but nothing currently reads it.
- `Feature_ConcernList.js`, `ConcernListLogic.js`, `html/ConcernListDialog.html`, `tests/concernListLogic.test.js`, the Concern List row in `SYSTEM_SHEET_HEADERS`, and the `generateConcernList` menu item are all part of a feature the user is replacing with a pure sheet formula — **remove together.**
- `auditDataSheetRanges` in `SheetManager.js` is a diagnostic helper that isn't wired to any menu; run it from the Apps Script editor if the Data/Database tabs behave oddly.
- `@OnlyCurrentDoc` is declared across feature files; the `appsscript.json` manifest should list only `spreadsheets.currentonly`, `forms.currentonly`, plus whatever `ScriptApp`/`DriveApp`/`UrlFetchApp` scopes GAS auto-adds from actual API usage. Check `dist/appsscript.json` before deploying.

---

## 11. Status of the other `.claude/MD/` docs

| File | Status |
|---|---|
| `CURRENT STATE.md` (this file) | **Canonical.** Start here. |
| `SUMMARY - Verified GAS API Reference & Project Context.md` | Partially stale — API patterns still useful, but the "Spreadsheet Structure" table lists `Ensemble` columns that don't exist. |
| `Sheets Structure.md` | **Stale.** Describes an earlier schema (Ensemble columns, Data tab as primary config). Do not trust without cross-checking against `SYSTEM_SHEET_HEADERS`. |
| `KSUMB Attendance System GAS Architecture & Coding Guidelines.md` | Historical design doc (batch-only data access, OAuth least privilege — principles still hold). |
| `Part 2 Configuration Caching & The DateAdd Feature.md` | Historical — DateAdd is implemented and has diverged from the blueprint. |
| `Part 3 Form Handlers, The Approval Workflow, & Concern List.md` | Historical — approval workflow is implemented. Concern List section is obsolete. |
| `Part 4 - Typed Columns, Table-Aware API, & Option 2 Transition Blueprint.md` | Incident record + Option 2 plan. Option 1 (removing column types in the UI) is what was actually applied. |
| `Refinement Plan - Statuses, Notes, Roster, Data.md` | Chunks 1 (chip-style status dropdowns + colors) are landed (see commit `e02b754`). Other chunks — check commit history before assuming status. |
| `AGENT - GAS Project Development Process.md` | Process / working-style notes. Still applies. |
