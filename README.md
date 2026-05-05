# KSUMB Attendance System

A Google Apps Script system that automates attendance tracking for the Kansas State University Marching Band. It runs entirely inside Google Workspace — no external servers, no separate login, no subscription cost.

---

## Table of Contents

**Usage**
1. [Who Uses What](#1-who-uses-what)
2. [Initial Setup](#2-initial-setup)
3. [Day-to-Day Staff Workflow](#3-day-to-day-staff-workflow)
4. [Late Check-In Workflow](#4-late-check-in-workflow)
5. [Pink Sheet Workflow](#5-pink-sheet-workflow)
6. [Yellow Sheet Workflow](#6-yellow-sheet-workflow)
7. [Concern List](#7-concern-list)
8. [Settings](#8-settings)
9. [Maintenance](#9-maintenance)
10. [Manual Testing Checklist](#10-manual-testing-checklist)

**Technical**

11. [Architecture Overview](#11-architecture-overview)
12. [Repository Layout](#12-repository-layout)
13. [Build & Deploy with clasp](#13-build--deploy-with-clasp)
14. [Configuration Reference](#14-configuration-reference)
15. [Development Workflow with AI](#15-development-workflow-with-ai)
16. [Automated Tests](#16-automated-tests)
17. [Known Loose Ends](#17-known-loose-ends)

---

# Usage

---

## 1. Who Uses What

| Role | Where they work | What they do |
|---|---|---|
| **Staff / Admin** | Google Sheet + Attendance menu | Everything administrative — setup, roster, dates, approvals, maintenance |
| **Section Leaders** | Google Sheet — their section tab | Record day-of attendance directly in the spreadsheet |
| **Members** | Google Forms (links provided by staff) | Submit Late Check-In, Pink Sheet, or Yellow Sheet requests |

This is not a web app or a standalone application. The spreadsheet is the operational hub. Staff open it to do their work; members never see it.

---

## 2. Initial Setup

These steps apply when setting up the system for the first time, or after a System Reset.

**Before you begin:** Create a copy of the sheet using the link below. The script must be bound to the copy you create.
#### (KSUMB Attendance - Template Sheet)[https://docs.google.com/spreadsheets/d/1xf6SFTbT07B-jT9GmIpB4Mx9aloD3HCNa7FunTqQuUQ/edit?usp=sharing]

**Steps:**

1. Open the Google Sheet bound to the script.
2. Go to **Attendance → Admin → Initialize System**.
   - This seeds all default settings into the spreadsheet's Document Properties.
   - It automatically builds the three Google Forms (Pink Sheet, Late Check-In, Yellow Sheet) and installs their submit triggers.
   - Form URLs are shown in the result dialog — copy and distribute them to members.
3. Go to **Attendance → Admin → Validate Environment** to confirm all tabs and headers are in place. Resolve any errors it reports before proceeding.
4. Make sure the **Database** tab has your full roster with at least these columns: `Last Name`, `First Name`, `Full Name`, `Section`, `Status`. Additional columns (Email, Phone, etc.) are allowed and can be surfaced in name-cell notes via Settings.
5. Go to **Attendance → Roster & Forms → Sync Roster from Database**. This populates every section tab with your member list and pushes names into all three forms.
6. Verify a few section tabs look correct — members should appear in the right tabs with no attendance columns yet.

**You're ready.** Add your first rehearsal date before the first practice.

> **First-time Google authorization:** On the very first menu click, Google will ask you to authorize the script. You'll need to approve it from an account that has edit access to the spreadsheet. If you see "This app isn't verified," click **Advanced → Go to [script name] (unsafe)** — this is expected for internal organizational scripts that haven't gone through Google's formal verification process.

---

## 3. Day-to-Day Staff Workflow

### Before each rehearsal

1. **Update the roster if needed** — add, remove, or change sections in the **Database** tab, then run **Attendance → Roster & Forms → Sync Roster from Database**.
2. **Add the rehearsal date** — go to **Attendance → Add rehearsal date**, enter the date and start time. The date column will appear across all section tabs in chronological order.

### During rehearsal

- **Section Leaders** open their section tab and mark attendance directly in the cells using the dropdown (Present, Tardy, Absent, Excused).
- **Members arriving late** submit the Late Check-In form. The script processes it automatically and updates the section tab within seconds.

### After rehearsal

1. **Review the Pink Sheets log** — open the `Pink Sheets` tab. Each submission row has a `Status` column.
2. **Review the Yellow Sheets log** — open the `Yellow Sheets` tab similarly.
3. **Approve or deny** — change the `Status` cell to `Approved` or `Denied` for each row you're ready to act on. The script processes Yellow Sheet rows immediately when you change the status. For Pink Sheets, you can either let the `onEdit` trigger process them automatically or run the batch:
4. **Run Process Approved Requests** — go to **Attendance → Process approved requests** as a catch-all to ensure all approved Pink and Yellow rows have been applied to section tabs.
5. **Check the Concern List tab** — select a rehearsal date in the selector cell to see which members were not marked Present for that rehearsal.

---

## 4. Late Check-In Workflow

Members submit this form in real time when they arrive late to rehearsal. **They should submit it immediately upon arrival** — the submission timestamp is used as their arrival time.

**What happens:**

1. Member submits the Late Check-In form.
2. The script logs the submission in the `Late Check-Ins` tab with status `Pending`.
3. The script immediately checks whether the rehearsal date column already exists in the member's section tab:
   - **Date exists** → the script calculates Present or Tardy based on the arrival time and the configured threshold, writes the value to the cell, and marks the row `Completed`.
   - **Date doesn't exist yet** → the row stays `Pending`. When the date is added later, all matching pending rows are automatically reprocessed.

**Present vs. Tardy threshold:**

By default, members arriving within **10 minutes** of rehearsal start are marked **Present**; beyond that, **Tardy**.

Members with an approved Yellow Sheet for a class that overlaps that day get a separate, more lenient threshold:
- The script finds the latest class end time among their approved conflicts for that day.
- It then gives them **15 minutes** after class ends (default) to arrive before marking them Tardy.

Both thresholds are configurable in Settings.

**Staff do not approve Late Check-Ins** — they are fully automated. There is no manual approval step.

---

## 5. Pink Sheet Workflow

Members submit this form to request an **excused absence** from a rehearsal or event. This is for individual absences, not recurring conflicts (use Yellow Sheet for those).

**What happens:**

1. Member submits the Pink Sheet form.
2. The submission is logged to `Pink Sheets` with status `Pending`. A "pending" note is written to the student's attendance cell if the rehearsal date column already exists.
3. Staff review the row and change `Status` to `Approved` or `Denied`.
4. The script responds immediately when status changes (via `onEdit`), or you can run **Attendance → Process approved requests** as a batch:
   - **Approved** → the attendance cell becomes `Excused` and a FERPA-safe note is written (submission and approval timestamps only — the reason text is never included in the note).
   - **Denied** → the attendance cell becomes `Absent` with a dated note.
5. If the rehearsal date column didn't exist yet when the row was approved, the row stays actionable and will be applied when the date is added.

**Staff never need to manually update section tab cells** — the script handles it.

---

## 6. Yellow Sheet Workflow

Members submit this form to report a **recurring class conflict** with KSUMB rehearsals (e.g., a Tuesday/Thursday class that ends 10 minutes after practice starts). This is a semester-long commitment, not a single-date request.

**What happens:**

1. Member submits the Yellow Sheet form with their conflict days and class times.
2. The submission is logged to `Yellow Sheets` with status `Pending`. A "Pending Yellow Sheet" note appears on the student's name cell in their section tab.
3. Staff review and change `Status` to `Approved` or `Denied`.
4. When approved, the student's name-cell note is updated to show their class conflict schedule (days + times). This note travels with the student's name cell and is visible to section leaders.
5. The system uses the approved class end time to give the student a more lenient Late Check-In threshold on conflict days (see [Late Check-In Workflow](#4-late-check-in-workflow)).

**If a member edits their Yellow Sheet response:**
- Their row automatically reverts to `Pending`.
- The name-cell note updates to "Pending Yellow Sheet."
- Staff must re-approve the updated submission.

**A student can have multiple Yellow Sheet rows** — one per distinct class conflict. All approved conflicts for a student are combined into a single name-cell note.

---

## 7. Concern List

The **Concern List** tab shows which members were not marked Present for a selected rehearsal. It's maintained entirely with spreadsheet formulas — there's nothing to run.

**To use it:**
1. Open the `Concern List` tab.
2. In the selector cell (top of the tab), choose the rehearsal date you want to review.
3. The list updates immediately.

The list includes everyone not marked Present (Absent, Tardy, Excused, or blank). Section leaders and staff can use it to identify members who need follow-up.

---

## 8. Settings

Go to **Attendance → Admin → System Settings** to view and change all configurable values.

| Setting | Default | What it controls |
|---|---|---|
| Section Tabs | 15 sections | Which tabs the system manages. Changing this and saving will auto-create any missing tabs. |
| Timezone | America/Chicago | Used for all date/time formatting in notes and logs. |
| Rehearsal Start Time | 3:30 PM (15:30) | Used to calculate Present vs. Tardy for Late Check-Ins. |
| Late Threshold (minutes) | 10 | Arrivals within this many minutes of start are marked Present. |
| Yellow Sheet Threshold (minutes) | 15 | Grace period after class ends for members with an approved Yellow Sheet conflict. |
| Yellow Sheet Threshold Mode | After class end | `After class end`: cutoff = class end + threshold. `After rehearsal start`: same threshold as everyone else but measured from rehearsal start. |
| Status labels | Pending, Approved, Denied, Completed | The exact strings written to Status cells. Don't change unless you know what you're doing — these must match existing data. |
| Attendance labels | Present, Tardy, Absent, Excused | The exact strings written to attendance cells. Same caution applies. |
| Late Reasons | 5 default options | Populates the Late Check-In form's reason dropdown. |
| Roster Note Columns | (empty) | Database column names (e.g., `Email`, `Phone Number`) to append as contact info in name-cell notes during roster sync. Leave empty to skip. |

The Settings dialog also shows the current published URLs for all three forms.

---

## 9. Maintenance

### Clear Attendance History

**Attendance → Admin → Clear Attendance History**

Removes all rehearsal date columns from every section tab. Leaves the roster intact, leaves queue logs (Pink/Yellow/Late) intact, and leaves a placeholder date column so data validation rules on the cells survive.

Use this if you need to wipe rehearsal history without resetting anything else.

### System Reset

**Attendance → Admin → System Reset**

A full, destructive reset. Prompts for confirmation before running. This:

- Moves all three Google Forms to Drive trash and removes their submit triggers
- Wipes all member names from every section tab (leaves a placeholder row to preserve data validation)
- Removes all rehearsal date columns
- Clears all queue logs (Pink Sheets, Yellow Sheets, Late Check-Ins)
- Clears all Yellow Sheet notes from name cells

**The Database tab is not touched.**

After System Reset, run **Initialize System** to rebuild forms and triggers, then **Sync Roster from Database** to repopulate section tabs.

Use this at the start of a new academic year or whenever a full clean slate is needed.

---

## 10. Manual Testing Checklist

Because this system runs inside Google Sheets and Google Forms, some behaviors can only be verified in the live environment. Run these checks after any significant change.

### Environment
- [ ] Run **Initialize System** — no errors in the result dialog
- [ ] Run **Validate Environment** — 0 errors, 0 warnings

### Roster Sync
- [ ] Add a test student to `Database`
- [ ] Run **Sync Roster from Database**
- [ ] Confirm student appears in the correct section tab
- [ ] Change the student's section in `Database`, re-sync, confirm they moved and attendance history followed

### Rehearsal Dates
- [ ] Run **Add rehearsal date** — confirm date column appears in all section tabs in chronological order
- [ ] Run **Delete rehearsal date** — confirm column is removed and matching Pink/Late rows reset to Pending

### Late Check-In
- [ ] Submit the Late Check-In form as a test user (with a rehearsal date existing for today)
- [ ] Confirm a row appears in `Late Check-Ins` and the section tab cell updates automatically
- [ ] Confirm attendance value is Present or Tardy based on submission time vs. rehearsal start
- [ ] Confirm the note is written to the attendance cell
- [ ] Confirm the queue row reaches `Completed`

### Pink Sheet
- [ ] Submit a test Pink Sheet form
- [ ] Confirm row appears in `Pink Sheets`
- [ ] Change status to `Approved`, confirm the attendance cell becomes `Excused` and note contains no reason text
- [ ] Change a different row to `Denied`, confirm cell becomes `Absent`

### Yellow Sheet
- [ ] Submit a test Yellow Sheet form
- [ ] Confirm row appears in `Yellow Sheets`
- [ ] Confirm name-cell note shows "Pending Yellow Sheet"
- [ ] Change status to `Approved`, confirm name-cell note updates to show conflict schedule
- [ ] Edit the original form response, confirm row reverts to Pending and note reflects this

### Concern List
- [ ] Open `Concern List` tab, change the selector cell, confirm the list recalculates immediately

---

# Technical

---

## 11. Architecture Overview

The system is a **container-bound Google Apps Script** project — the script lives inside the Google Spreadsheet and has direct access to it without any OAuth dance.

```
Google Spreadsheet (operational hub)
  ├─ Section tabs (one per instrument/group)
  ├─ Pink Sheets, Yellow Sheets, Late Check-Ins (queue logs)
  ├─ Database (roster source of truth)
  ├─ Concern List (formula-driven)
  └─ System Log

Google Forms (three separate forms, linked to the spreadsheet)
  ├─ Pink Sheet Request
  ├─ Late Check-In
  └─ Yellow Sheet (Class Conflict)

Google Apps Script (src/ → dist/ → GAS runtime)
  ├─ Custom menu (Attendance)
  ├─ onEdit trigger (instant approvals)
  ├─ onFormSubmit triggers (one per form)
  └─ Custom function GET_SHEETS() (used by Concern List formulas)
```

**No external dependencies at runtime.** The script uses only GAS built-in services and the Google Forms/Sheets APIs. No npm packages run in production.

**Build pipeline:**
```
src/  →  scripts/build.js (file copy, no transpile)  →  dist/  →  clasp push  →  GAS
```

---

## 12. Repository Layout

```
KSUMB-Attendance-GAS/
├─ src/                        Source files (edit these)
│   ├─ code.js                 Entry point: onOpen, onEdit, GET_SHEETS()
│   ├─ Config.js               Settings model, Document Properties bridge
│   ├─ SheetManager.js         Sheet/table read-write helpers
│   ├─ Feature_Admin.js        initializeSystem, validateEnvironment
│   ├─ Feature_DateAdd.js      Add/delete rehearsal dates
│   ├─ Feature_FormBuilder.js  Build/delete all three forms
│   ├─ Feature_FormSync.js     Form submit triggers, roster→forms sync
│   ├─ Feature_LateCheckIn.js  Late Check-In queue processing
│   ├─ Feature_Maintenance.js  clearAttendanceHistory, systemReset
│   ├─ Feature_PinkSheets.js   Pink Sheet queue processing
│   ├─ Feature_QueueProcessor.js  Batch approval orchestrator
│   ├─ Feature_RosterSync.js   Database→section tabs sync
│   ├─ Feature_Settings.js     Settings dialog backend
│   ├─ Feature_YellowSheets.js Yellow Sheet queue processing
│   ├─ FormNameLogic.js        Form title constants, name normalization
│   ├─ LateCheckInLogic.js     Threshold logic, Yellow Sheet-aware cutoffs
│   ├─ PinkSheetLogic.js       Pink Sheet action/note logic
│   ├─ RosterSyncLogic.js      Active member filtering, contact note helpers
│   ├─ SettingsLogic.js        Settings validation
│   ├─ YellowSheetLogic.js     Yellow Sheet note building
│   ├─ DateQueueLogic.js       Queue reset logic for deleted dates
│   ├─ QueueStatusLogic.js     onEdit guard logic
│   └─ html/                   Dialog HTML files
│       ├─ SettingsDialog.html
│       ├─ DateAddDialog.html
│       ├─ DateDeleteDialog.html
│       └─ DefaultAttendanceDialog.html
│
├─ dist/                       Build output — pushed to GAS (do not edit)
├─ tests/                      Jest unit tests
│   └─ helpers/gasHarness.js   Lightweight GAS mock for Node.js testing
├─ scripts/build.js            Build script (file copy src → dist)
├─ .claude/MD/                 AI context documents
│   ├─ CURRENT STATE.md        Canonical architecture reference (start here)
│   └─ AGENT - GAS Project Development Process.md  GAS coding rules and process
├─ CLAUDE.md                   AI onboarding guide (loaded automatically by Claude)
├─ README.md                   This file
├─ .clasp.json                 clasp config (scriptId must be set to deploy)
├─ appsscript.json             GAS manifest (OAuth scopes, runtime, timezone)
├─ package.json                npm scripts and dev dependencies
├─ jsconfig.json               IDE type support for GAS globals
└─ eslint.config.js / .prettierrc  Lint and format config
```

For a complete, up-to-date description of every function in every file, see `.claude/MD/CURRENT STATE.md`.

---

## 13. Build & Deploy with clasp

[clasp](https://github.com/google/clasp) is Google's command-line tool for pushing local code to a Google Apps Script project.

### One-time setup

**1. Install clasp globally:**
```bash
npm install -g @google/clasp
```

**2. Log in to clasp:**
```bash
clasp login
```
This opens a browser window to authorize clasp with your Google account.

**3. Link to the GAS project:**

Open `.clasp.json` and set the `scriptId` to the ID of your GAS project. Find the script ID in the Apps Script editor URL:
```
https://script.google.com/home/projects/YOUR_SCRIPT_ID_HERE/edit
```

`.clasp.json` should look like:
```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "rootDir": "dist"
}
```

**4. Install npm dependencies** (for tests, lint, and format):
```bash
npm install
```

### Daily commands

```bash
npm run build     # Copy src/ → dist/ (no transpilation)
npm run deploy    # build + clasp push (use this to deploy)
npm run test      # Run Jest unit tests
npm run lint      # ESLint on src/
npm run format    # Prettier on src/
```

> **On Windows**, use `npm.cmd` instead of `npm` if running from PowerShell directly.

### What gets pushed

`clasp push` uploads everything in `dist/`. The build step (`scripts/build.js`) is a straight file copy — there is no bundling, transpilation, or TypeScript compilation. What you write in `src/` is exactly what runs in GAS.

### After pushing

Reload the spreadsheet to pick up menu changes. Form trigger functions (`onPinkSubmit`, etc.) must be registered as installable triggers in the GAS editor or via `installFormSubmitTriggers()` — they are not time-based triggers that clasp can manage directly.

---

## 14. Configuration Reference

All configurable values are stored in the spreadsheet's **Document Properties** under the `CFG__` prefix. Manage them through the Settings dialog (**Attendance → Admin → System Settings**), not by editing properties directly.

| Key | Default | Notes |
|---|---|---|
| `SECTION_TABS` | 15 marching sections | Newline-delimited list. Saving creates any missing tabs. |
| `TIMEZONE` | `America/Chicago` | TZ database name. Used in all `Utilities.formatDate()` calls. |
| `REHEARSAL_START_TIME` | `15:30` | HH:MM 24-hour. Used for Late Check-In Present/Tardy threshold. |
| `LATE_THRESHOLD_MINUTES` | `10` | Minutes after rehearsal start → still Present (for members without a Yellow Sheet). |
| `YELLOW_SHEET_THRESHOLD_MINUTES` | `15` | Grace period after class ends for members with an approved Yellow Sheet conflict. |
| `YELLOW_SHEET_THRESHOLD_MODE` | `after_class_end` | `after_class_end` or `after_rehearsal_start`. |
| `STATUS_PENDING/APPROVED/DENIED/COMPLETE` | `Pending/Approved/Denied/Completed` | Exact strings used in Status cells. |
| `ATTENDANCE_PRESENT/TARDY/ABSENT/EXCUSED` | `Present/Tardy/Absent/Excused` | Exact strings used in attendance cells. |
| `LATE_REASONS` | 5 defaults | Newline-delimited. Populates the Late Check-In form reason question. |
| `ROSTER_NOTE_COLUMNS` | (empty) | Newline-delimited Database column names to include as contact info in name-cell notes. |

**Script Properties** (set by the script, not the Settings dialog):

| Key | Set by | Notes |
|---|---|---|
| `PINK_FORM_ID` | `buildAllForms` | Google Form ID for the Pink Sheet form. |
| `LATE_FORM_ID` | `buildAllForms` | Google Form ID for the Late Check-In form. |
| `YELLOW_FORM_ID` | `buildAllForms` | Google Form ID for the Yellow Sheet form. |
| `DEFAULT_ATTENDANCE_VALUE` | DefaultAttendanceDialog | Stored but not currently read — incomplete code path. |

---

## 15. Development Workflow with AI

This codebase is set up to work well with AI coding assistants. The key files for context are:

- **`CLAUDE.md`** — loaded automatically by Claude when you open the repo. Contains the full function map, behavioral rules, and development constraints.
- **`.claude/MD/CURRENT STATE.md`** — the authoritative architecture reference. Always verify claims against this file and the actual `src/` code.
- **`.claude/MD/AGENT - GAS Project Development Process.md`** — detailed GAS-specific coding rules, common pitfalls, and an API verification checklist. Read this before writing any new GAS code.

### Recommended AI workflow for changes

1. Open a new chat session in your AI tool of choice (Claude, Cursor, etc.).
2. The AI will load `CLAUDE.md` automatically if you're working in this directory.
3. Describe what you want to change. The AI will reference `CURRENT STATE.md` for function names, tab names, and behavioral rules.
4. Review generated code against the GAS checklist in `AGENT - GAS Project Development Process.md` before deploying.
5. Run `npm test` — all tests must pass.
6. Run `npm run deploy` to push to GAS.
7. Test the affected workflow manually in the live spreadsheet.

### Setting up the Google Apps Script MCP (optional but recommended)

The [Google Apps Script MCP](https://github.com/google/google-apps-script-mcp) gives an AI assistant direct access to your live GAS project — it can execute functions, read deployed code, and inspect execution logs without you needing to copy-paste manually.

**To set it up:**

1. Install the MCP server following the instructions in the repo above.
2. In your AI tool's MCP config, add the server with your credentials.
3. Once connected, the AI can use these tools during a session:
   - `mcp__google-apps-script__script_run` — execute a named function in your deployed project (useful for smoke-testing after a push)
   - `mcp__google-apps-script__update_script_content` — push a file directly without going through clasp (quick iteration)
   - `mcp__google-apps-script__script_projects_get_content` — read what's currently deployed (useful for spotting drift between `src/` and live)
   - `mcp__google-apps-script__get_script_metrics` / `list_script_processes` — inspect execution history and error logs

The MCP is especially useful for catching deployment drift and for running quick smoke tests against the live project without leaving the AI chat.

### What the AI cannot do automatically

Some things still require manual steps in the GAS environment:

- Installing form submit triggers — run `installFormSubmitTriggers()` from the GAS editor, or use the Apps Script MCP's `script_run` to call it remotely.
- Authorizing new OAuth scopes — if you add a GAS service that requires a new permission (e.g., `DriveApp`), the script will ask for re-authorization the next time someone opens the spreadsheet.
- Live spreadsheet testing — the automated tests run in Node.js with a lightweight GAS mock. They do not hit real Sheets or Forms. Always test new workflows in the actual bound spreadsheet before considering them done.

---

## 16. Automated Tests

Run the test suite locally with:

```bash
npm test
```

**What's covered:**

- Late Check-In threshold logic (Present vs. Tardy)
- Yellow Sheet-aware cutoff computation
- Pink Sheet action decisions (Approved/Denied/Pending behavior)
- Yellow Sheet note building and pending/approved state handling
- Queue reset logic for deleted rehearsal dates
- Roster member filtering and grouping
- Form name normalization
- Settings validation
- Workflow interaction tests using a lightweight GAS spreadsheet harness

**What's not covered** (requires manual testing in the live Google environment):

- Real form submissions and trigger firing
- Live spreadsheet read/write behavior
- Permission/protection enforcement
- Multi-user concurrency edge cases

All 45 tests should pass before any deploy. If any test fails after a change, fix it before pushing — the test suite is your regression guard.

---

## 17. Known Loose Ends

These are known issues as of the last code review. They don't affect core workflows but should be addressed before treating the system as fully production-ready.

| Issue | Impact | Priority |
|---|---|---|
| **System is under a personal Google account**, not `ksumb@ksu.edu`. If the owner's account is deactivated, the script stops working. | High — blocks true institutional ownership | **Resolve before going live.** Transfer the spreadsheet and script to the `ksumb@ksu.edu` Google Workspace account. |
| **Tab protection (NFR-05) not validated in a live environment.** The architecture is in place, but whether section leaders are actually restricted to their own tab has not been confirmed with real accounts. | Medium — data integrity risk | Validate with a real section leader account before the season. |
| **`DEFAULT_ATTENDANCE_VALUE` is stored but never read.** The DefaultAttendance dialog and `setDefaultAttendanceValue()` exist and work, but the value is never applied when inserting new date columns. | Low — cosmetic; the dialog appears to work but has no effect | Complete the code path in `Feature_DateAdd.js` to read and apply the value. |

**Suggested future enhancements** for a follow-on team:

- A unified admin approval dashboard (rather than editing Status cells directly in log tabs)
- Batch DateAdd (add multiple rehearsal dates at once)
- CSV export of attendance data for a date range
- Email notification when a Pink or Yellow Sheet is submitted
