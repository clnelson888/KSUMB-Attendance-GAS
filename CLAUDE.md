# CLAUDE.md — KSUMB Attendance GAS

This file is the AI onboarding guide for this repository. Read it first, every session.

---

## What This System Does

A container-bound Google Apps Script attached to the KSUMB (Kansas State University Marching Band) Attendance Spreadsheet. It automates:

- **Roster sync** — pulls active members from the `Database` tab into 15 per-section attendance tabs and into three Google Forms.
- **Rehearsal dates** — inserts and deletes rehearsal date columns across all section tabs in chronological order.
- **Three approval queues** — Pink Sheets (excused absences), Yellow Sheets (recurring class conflicts), Late Check-Ins (day-of arrivals).
- **Batch attendance application** — staff approve/deny queue rows; the script writes Excused/Tardy/etc. into the correct section-tab cell and adds a dated note.
- **Yellow Sheet-aware Late Check-In** — students with an approved Yellow Sheet for that day's class conflict get a separate, configurable grace period (class end time + threshold) rather than the default rehearsal-start threshold.
- **Concern List** — maintained with pure sheet formulas on the `Concern List` tab. The only GAS surface is `GET_SHEETS()` in `src/code.js` (returns sheet names + GIDs for formula use).

Scale target: up to ~400 submissions in a narrow window when the whole band checks in at once.

This is **not** a web app or standalone application. Everything lives inside a Google Spreadsheet and three linked Google Forms.

---

## Source of Truth

**Start here:** `.claude/MD/CURRENT STATE.md`

That file is the canonical architecture reference — verified against the actual `src/` code. When it conflicts with anything else in this repo (README, older MD files), trust `CURRENT STATE.md` or the code.

Older `.claude/MD/` files (`Sheets Structure.md`, `Part 2–4` series, etc.) are **historical design documents**. Some decisions made it in, some were superseded. Do not trust them without cross-checking against `CURRENT STATE.md`.

---

## Commands

```bash
npm run build     # Copy src/ to dist/ (no transpilation)
npm run deploy    # build + clasp push to Google Apps Script
npm run lint      # ESLint on src/
npm run format    # Prettier on src/
npm run test      # Jest unit tests
```

`scriptId` in `.clasp.json` must point at an actual GAS project for deploy to work.

---

## Architecture

```
src/  →  scripts/build.js (file copy)  →  dist/  →  clasp push  →  GAS project
```

**Runtime:** V8 (modern JS engine, ES6+ supported). No transpilation — what's in `src/` runs as-is in GAS. No `import`/`export`. No `npm` packages at runtime. All files share a single global scope.

**GAS execution limit:** 6 minutes per run (30 min for Workspace Business/Enterprise).

---

## File Map

### Entry point
- `src/code.js` — `onOpen` (custom menu), `onEdit` (Yellow/Pink Status cell triggers), `GET_SHEETS()` custom function.

### Feature files (GAS-aware layer)
- `src/Feature_Admin.js` — `initializeSystem`, `validateEnvironment`, `SYSTEM_SHEET_HEADERS`, `normalizeLegacyStatusValues`, `logSystemEvent`.
- `src/Feature_DateAdd.js` — `addRehearsalDate`, `insertRehearsalDate`, `openDeleteDateDialog`, `deleteRehearsalDate`, `parseDateHeader`, `resetQueuesForDeletedDate`.
- `src/Feature_FormBuilder.js` — `buildAllForms`, `deleteAllForms`, `getFormPublishedUrls`, `logFormUrls`, `inspectDatabase`, `_getRosterData`.
- `src/Feature_FormSync.js` — `syncRosterToForms`, `installFormSubmitTriggers`, `onPinkSubmit`, `onLateSubmit`, `onYellowSubmit`, `inspectFormQuestions`.
- `src/Feature_LateCheckIn.js` — `processSingleLateCheckIn`, `processPendingLateCheckInsForDate`, `appendLateCheckInQueueRow`, `loadYellowSheetContext`.
- `src/Feature_Maintenance.js` — `clearAttendanceHistory`, `systemReset`, `clearManagedSheetData`, `clearSectionRoster`, `clearYellowSheetNotesFromSections`.
- `src/Feature_PinkSheets.js` — `processSinglePinkSheet`, `processPinkSheetActions`, `processPinkSheetsForDate`, `getPinkSheetHeaderMap`, `writePinkSheetOutcome`.
- `src/Feature_QueueProcessor.js` — `processApprovedRequests` (menu), `matchDateColumn`, `applyAttendanceUpdates`, `formatTimeValue`, `processApprovedPinkSheets`, `processApprovedYellowSheets`.
- `src/Feature_RosterSync.js` — `syncRosterFromDatabase`, `getDatabaseRosterBySection`, `collectExistingSectionRecords`, `buildSectionSyncRows`, `countRemovedFromSection`.
- `src/Feature_Settings.js` — `openSettingsDialog`, `saveSettings`, `resetSettingsToDefaults`, `ensureConfiguredSectionTabsExist`, `getSettingsDialogModel`.
- `src/Feature_YellowSheets.js` — `processYellowSheetActions`, `upsertYellowSheetSubmission`, `rebuildYellowSheetNameCellNote`, `getYellowSheetHeaderMap`.

### Pure logic (GAS-free, unit-tested)
- `src/Config.js` — all settings keys, defaults, Document Properties bridge. Key functions: `getConfig`, `getConfigValue`, `requireConfigValue`, `getStatusValue`, `getAttendanceValue`, `getConfiguredSectionTabs`, `getConfiguredLateReasons`, `getConfiguredRosterNoteColumns`, `setConfigValues`, `resetConfigPropertiesToDefaults`, `ensureDefaultConfigProperties`.
- `src/SheetManager.js` — `getSheet`, `getTableData`, `getTableDataWithHeaders`, `writeTableData`, `_detectTableRange`, `auditDataSheetRanges`.
- `src/FormNameLogic.js` — form title constants, `normalizeSubmittedName`, `resolveSubmittedName`, `requireResolvedSubmittedName`, `buildSectionPageTitle`, `extractSectionFromPageTitle`.
- `src/RosterSyncLogic.js` — `isRosterMemberActive`, `groupActiveRosterMembersBySection`, `buildRosterContactNote`, `splitNoteAtRosterSeparator`, `buildCombinedMemberNote`, `ROSTER_NOTE_SEPARATOR`.
- `src/LateCheckInLogic.js` — `determineLateAttendanceStatus`, `canLateCheckInOverwriteAttendance`, `isSameCalendarDate`, `buildLateCheckInNoteText`, `findApprovedClassEndTime`, `computeYellowSheetTardyCutoff`, `conflictDaysIncludesDay`, `applyTimeToDate`, `parseLateThresholdMinutes`, `isValidDateLike`.
- `src/PinkSheetLogic.js` — `determinePinkSheetAction`, `buildPinkSheetNoteText`.
- `src/YellowSheetLogic.js` — `getYellowSubmissionStatus`, `buildYellowSheetApprovedNote`, `getPendingYellowSheetNoteText`, `buildYellowSheetCombinedNote`.
- `src/QueueStatusLogic.js` — `shouldProcessQueueStatusEdit`.
- `src/DateQueueLogic.js` — `shouldResetQueueRowForDeletedDate`.
- `src/SettingsLogic.js` — `normalizeSettingsPayload`, `validateSettingsPayload`.

### HTML dialogs
- `src/html/SettingsDialog.html` — Settings editor (shows form URLs, all config keys including Yellow Sheet threshold and Roster Note Columns).
- `src/html/DateAddDialog.html` — Rehearsal date add.
- `src/html/DateDeleteDialog.html` — Rehearsal date delete.
- `src/html/DefaultAttendanceDialog.html` — Default attendance value config (incomplete code path — dialog exists, `setDefaultAttendanceValue` stores to Script Properties, but nothing reads the stored value).

### Tests
- `tests/` — Jest unit tests for all `*Logic.js` files plus `formBuilder.test.js` and `workflowInteractions.test.js`. `tests/helpers/gasHarness.js` is the shared GAS mock.

---

## Menu Structure (current)

```
🥁 Attendance
├─ ➕ Add rehearsal date
├─ 🗑️ Delete rehearsal date
├─ ─────────────────
├─ ✅ Process approved requests
├─ ─────────────────
├─ 📋 Roster & Forms ▸
│   ├─ 🔄 Sync Roster from Database
│   ├─ 📤 Push Names to Google Forms
│   └─ 🛠️ Build / Rebuild All Forms
└─ ⚠️ Admin ▸
    ├─ 🔧 System Settings
    ├─ 🔍 Validate Environment
    ├─ 🚀 Initialize System
    ├─ ─────────────────
    ├─ ⚠️ System Reset
    └─ 🧹 Clear Attendance History
```

> **Note:** "Process approved requests" applies Pink + Yellow Sheets only. Late Check-Ins are processed automatically on submission and on date-add; there is no manual batch menu item for them.

---

## Configuration Model

Settings live in **Document Properties** under `CFG__` prefix. The legacy `Data` tab is read as a fallback/import source, but Document Properties win on conflict.

| Config Key | Default | Notes |
|---|---|---|
| `SECTION_TABS` | 15 marching sections | Newline-delimited |
| `TIMEZONE` | `America/Chicago` | Used in all date formatting |
| `REHEARSAL_START_TIME` | `15:30` | HH:MM 24-hour |
| `LATE_THRESHOLD_MINUTES` | `10` | Minutes after start → still Present |
| `YELLOW_SHEET_THRESHOLD_MINUTES` | `15` | Grace period for YS members |
| `YELLOW_SHEET_THRESHOLD_MODE` | `after_class_end` | `after_class_end` or `after_rehearsal_start` |
| `STATUS_PENDING/APPROVED/DENIED/COMPLETE` | `Pending/Approved/Denied/Completed` | — |
| `ATTENDANCE_PRESENT/TARDY/ABSENT/EXCUSED` | `Present/Tardy/Absent/Excused` | — |
| `LATE_REASONS` | 5 default reasons | Newline-delimited |
| `ROSTER_NOTE_COLUMNS` | `` (empty) | DB columns to append as contact info in name-cell notes |

Script Properties (not under `CFG__`):
- `PINK_FORM_ID`, `LATE_FORM_ID`, `YELLOW_FORM_ID` — set by `buildAllForms`.
- `DEFAULT_ATTENDANCE_VALUE` — stored by the DefaultAttendance dialog but **never read** anywhere (incomplete code path).

---

## Name-Cell Note Architecture

Section-tab column A cells (member name cells) can carry two types of notes, stacked with a separator:

```
Class conflict: Mon/Wed 3:00 PM-3:50 PM   ← Yellow Sheet content (above separator)
Pending Yellow Sheet
Submitted: 1/15/2026 2:30 PM
--- Contact Info ---                        ← separator line (ROSTER_NOTE_SEPARATOR)
Email: student@ksu.edu                      ← roster contact info (below separator)
Phone: 555-1234
```

- Yellow Sheet content is rebuilt by `rebuildYellowSheetNameCellNote` every time a Yellow Sheet is processed.
- Contact info is written by roster sync when `ROSTER_NOTE_COLUMNS` is configured.
- `splitNoteAtRosterSeparator` / `buildCombinedMemberNote` manage the split/merge.
- If `ROSTER_NOTE_COLUMNS` is empty (default), no separator or contact block is written.

---

## Key Behavioral Rules

**Late Check-In with Yellow Sheet:**
If the student has an approved Yellow Sheet whose conflict days include the arrival day, the attendance threshold is computed differently:
- `after_class_end` mode: cutoff = classEndTime + `YELLOW_SHEET_THRESHOLD_MINUTES`
- `after_rehearsal_start` mode: cutoff = rehearsalStart + `YELLOW_SHEET_THRESHOLD_MINUTES`
- Multiple conflicts on same day → latest end time wins (most lenient)

**Pink Sheet status lifecycle:**
- `Pending` → attendance cell gets a "pending" note only (no attendance value yet)
- `Approved` → cell gets `Excused` + note with submitted/approved timestamps
- `Denied` → cell gets `Absent` + note with submitted/denied timestamps
- Status is NOT overwritten by automation after staff sets it — staff decision is final

**Yellow Sheet status lifecycle:**
- Every new form submission, and every edit to an existing response, reverts the row to `Pending`
- `Approved At` / `Denied At` timestamps are stamped first-set-wins (not overwritten on re-runs)
- `processApprovedRequests` (menu) reprocesses all Approved/Denied rows and rebuilds name-cell notes

**System Reset vs Clear Attendance History:**
- `clearAttendanceHistory` — removes date columns only; leaves roster and queue logs intact
- `systemReset` — full destructive reset: deletes forms (to Drive trash), removes form triggers, wipes roster rows from section tabs, clears all queue logs, clears Yellow Sheet notes. After running, you must re-run `Initialize System` and `Sync Roster from Database`.

---

## Known Loose Ends

| Issue | File | Impact |
|---|---|---|
| `DEFAULT_ATTENDANCE_VALUE` stored but never read | `Feature_DateAdd.js`, `Feature_Settings.js` | Code quality only — dialog works but setting has no effect |
| NFR-05: Tab protection architecture in place but not validated live | — | Pre-production risk |
| NFR-13/14: System under personal Google account, not `ksumb@ksu.edu` | — | Must resolve before production handoff |

---

## Development Workflow

1. Edit files in `src/`.
2. Run `npm run test` — all 45 tests must pass before pushing.
3. Run `npm run lint` and `npm run format` to clean up.
4. Run `npm run deploy` to push to GAS (`npm run build` + `clasp push`).
5. Do any workflow requiring live GAS context (form triggers, sheet reads) in the actual bound spreadsheet.

See `.claude/MD/AGENT - GAS Project Development Process.md` for detailed GAS-specific coding rules, API verification protocol, and the GAS-specific pre-push checklist.

---

## AI Coding Resources

**Local type definitions (use first):**
`node_modules/@types/google-apps-script/` contains authoritative `.d.ts` files for every GAS service. Key files:
- `google-apps-script.spreadsheet.d.ts` — SpreadsheetApp, Sheet, Range
- `google-apps-script.forms.d.ts` — FormApp, Form, Item types
- `google-apps-script.script.d.ts` — ScriptApp, triggers, PropertiesService
- `google-apps-script-events.d.ts` — event object shapes for all trigger types

**Official Google docs:** `developers.google.com/apps-script/reference`

**MCP tools (when available in session):**
- `mcp__google-apps-script__script_run` — execute a GAS function in the deployed project
- `mcp__google-apps-script__update_script_content` — push file content without clasp
- `mcp__google-apps-script__script_projects_get_content` — read what's currently deployed

**Critical GAS constraints:**
- No `import`/`export` — all files share a single global scope
- No `npm` packages at runtime
- No `async`/`await` — GAS is synchronous
- All `Date` formatting must use `Utilities.formatDate(date, timezone, format)` — JS Date string methods use LA timezone, not the configured timezone
- `SpreadsheetApp.flush()` must be called before `lock.releaseLock()`
- `setNote()` / `setNotes()` must be called after `setValues()`, not before
