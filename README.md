# KSUMB Attendance System

This repository contains the Google Apps Script implementation and planning documents for the KSUMB Attendance System.

The system is designed to run inside Google Workspace:

- Google Sheets is the operational dashboard and data store.
- Google Forms are the member-facing submission tools.
- Google Apps Script automates attendance updates, queue processing, setup, and maintenance actions.

## What This Is

This is not a standalone web app and it is not an Excel application.

The primary user interface is:

- the bound Google Sheet
- the top-level `Attendance` custom menu in that sheet
- a few HTML dialogs opened from that menu
- the Google Forms used by students

So, to answer the practical usage question:

- Staff use the Google Sheet and the `Attendance` menu.
- Section Leaders use their section tab directly in the Google Sheet.
- Members use the Google Forms.
- Approval decisions are still made by editing status cells in the log sheets.

## Repository Layout

- [KSUMB-Attendance-GAS](./KSUMB-Attendance-GAS): Apps Script source project
- [DOCS](./DOCS): planning, requirements, and design notes
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md): implementation roadmap
- [REPO_ANALYSIS_FINDINGS.md](./REPO_ANALYSIS_FINDINGS.md): analysis of gaps and risks

## Main Usage Model

## 1. Staff / Admin Usage

Staff primarily interact through the Google Sheet.

Current admin actions are exposed through the `Attendance` menu in the sheet:

- `Validate environment`
- `Initialize system`
- `Add rehearsal date`
- `Delete rehearsal date`
- `Build / rebuild forms`
- `Roster sync`
- `Sync roster names to forms`
- `Clear attendance history`
- `System Reset`
- `Process approved requests`

### What staff still do manually in the sheet

Staff are still expected to:

- review the `Pink Sheets` log
- review the `Yellow Sheets` log
- change `Status` cells to `Approved` or `Denied`
- inspect section tabs and log tabs as part of operations

That is currently part of the intended workflow. There is not yet a unified admin dashboard for approvals.

## 2. Section Leader Usage

Section Leaders use the Google Sheet directly:

- open their section tab
- record day-of attendance using the attendance cells
- review their section roster and attendance history

They do not use the Forms for this operational task.

## 3. Member Usage

Members do not use the spreadsheet directly.

They interact through Google Forms:

- Late Check-In form
- Pink Sheet form
- Yellow Sheet form

## How You Are Supposed to Use It

## Initial Setup

If the spreadsheet is new or incomplete:

1. Open the Google Sheet that is bound to the script.
2. Use `Attendance -> Initialize system`.
3. Use `Attendance -> Validate environment`.
4. Make sure the `Database` tab has the expected roster columns.
5. Confirm the `Data` tab contains the expected configuration keys.
6. Use `Attendance -> Build / rebuild forms` if forms have not been created yet.
7. Use `Attendance -> Sync roster names to forms`.

## Day-to-Day Staff Use

Typical staff workflow:

1. Keep the `Database` tab current.
2. Run `Attendance -> Roster sync` after roster changes.
3. Run `Attendance -> Add rehearsal date` before a rehearsal.
4. Let members submit Late Check-In / Pink / Yellow forms as needed.
5. Review `Pink Sheets` and `Yellow Sheets` logs.
6. Change statuses to `Approved` or `Denied` where needed.
7. Run `Attendance -> Process approved requests`.
8. Open the `Concern List` tab to review non-present students (the tab is maintained with sheet formulas).

## Late Check-In Workflow

Current intended usage:

1. Member submits the Late Check-In form.
2. The script logs the submission in `Late Check-Ins`.
3. If the rehearsal date column already exists, the script attempts to update the section tab immediately.
4. If the date column does not exist yet, the row stays `Pending`.
5. When the rehearsal date is later added, matching pending Late Check-Ins are reprocessed.

You do not normally process Late Check-In through manual approval.

## Pink Sheet Workflow

Current intended usage:

1. Member submits the Pink Sheet form.
2. The submission is logged to `Pink Sheets`.
3. Staff review the row in the sheet.
4. Staff change `Status` to `Approved` or `Denied`.
5. Staff run `Attendance -> Process approved requests`.
6. If approved and the matching date exists, the student is marked `Excused` and a FERPA-safe note is written.
7. If approved but the date does not exist yet, the row stays actionable until the date is added.

## Yellow Sheet Workflow

Current intended usage:

1. Member submits the Yellow Sheet form.
2. The submission is logged to `Yellow Sheets`.
3. Staff review the row in the sheet.
4. Staff change `Status` to `Approved` or `Denied`.
5. Staff run `Attendance -> Process approved requests`.
6. Approved rows add a note to the student's name cell in the section tab.

If a student edits a previously completed Yellow response:

- the row should revert to `Pending`
- the old name-cell note should be replaced with `Pending Yellow Sheet`
- staff must re-approve it

## Concern List Workflow

The `Concern List` tab is maintained in the spreadsheet itself with sheet formulas (backed by the `GET_SHEETS()` custom function in `src/code.js`). There is no Apps Script feature to generate or refresh it — pick the rehearsal in the selector cell and the list recalculates automatically.

## Maintenance Actions

### Clear Attendance History

Use when you want to keep the roster but remove all rehearsal date columns.

Menu:

- `Attendance -> Clear attendance history`

### System Reset

Use when you want to fully reset the sheet for a new year or term.

Menu:

- `Attendance -> Admin -> System Reset`

Prompts for confirmation before running. This:

- clears all member names from every section tab (leaves a placeholder row to preserve data validation)
- clears all rehearsal date columns from every section tab
- clears all queue logs (Pink Sheets, Yellow Sheets, Late Check-Ins)
- clears Yellow Sheet notes from section name cells

The Database tab is not affected. Run Roster Sync after to repopulate section tabs.

## Manual Testing Guide

Yes, a meaningful part of testing is manual right now, because this is a Google Sheets + Forms + Apps Script system and some behavior depends on the live Google environment.

You should test in the actual bound Google Sheet.

## What to test manually in the sheet

### Environment / Setup

1. Run `Initialize system`.
2. Run `Validate environment`.
3. Confirm support tabs exist.
4. Confirm the `Data` keys exist.

### Roster Sync

1. Add a student to `Database`.
2. Run `Roster sync`.
3. Confirm the student appears in the correct section tab.
4. Change the student's section in `Database`.
5. Run `Roster sync` again.
6. Confirm the student moved sections and retained attendance history if present.

### DateAdd / Delete Date

1. Run `Add rehearsal date`.
2. Confirm the date column appears in every section tab.
3. Confirm the new column is in chronological order.
4. Confirm the new cells are blank.
5. Run `Delete rehearsal date`.
6. Confirm the date column is removed from all section tabs.
7. Confirm matching Pink/Late rows reset to `Pending`.

### Late Check-In

1. Make sure a rehearsal date exists for today.
2. Submit the Late Check-In form as a test user.
3. Confirm a queue row appears in `Late Check-Ins`.
4. Confirm the section tab updates automatically.
5. Confirm the attendance value is `Present` or `Tardy` based on the threshold.
6. Confirm the note is added.
7. Confirm the queue row becomes `Complete`.

### Pink Sheet

1. Submit a Pink Sheet test form.
2. Confirm the row appears in `Pink Sheets`.
3. Change status to `Approved`.
4. Run `Process approved requests`.
5. Confirm the attendance cell becomes `Excused` if the date exists.
6. Confirm the note does not include the reason text.

### Yellow Sheet

1. Submit a Yellow Sheet test form.
2. Confirm the row appears in `Yellow Sheets`.
3. Change status to `Approved`.
4. Run `Process approved requests`.
5. Confirm the name cell gets a class-conflict note.
6. Edit the original form response.
7. Confirm the row goes back to `Pending`.
8. Confirm the name-cell note becomes `Pending Yellow Sheet`.

### Concern List

1. Open the `Concern List` tab.
2. Change the selected rehearsal in the selector cell.
3. Confirm the formula output updates immediately. (The list is now pure sheet formulas — no Apps Script involvement.)

## Automated Tests

There is now local automated test coverage for logic and interaction paths.

Run from [KSUMB-Attendance-GAS](./KSUMB-Attendance-GAS):

```powershell
npm.cmd test
```

What is covered so far:

- late threshold logic
- late note text
- Pink Sheet status decisions
- Yellow Sheet edit/pending rules
- queue reset behavior for deleted dates
- roster grouping logic
- workflow interaction tests using a lightweight GAS spreadsheet harness

These tests do not replace live Google Sheets testing. They reduce regression risk while developing.

## Build and Local Commands

From [KSUMB-Attendance-GAS](./KSUMB-Attendance-GAS):

```powershell
npm.cmd run build
npm.cmd test
```

`build` copies `src/` into `dist/` for Apps Script deployment.

## Current Limitations

The system is significantly further along now, but it is still not fully complete.

Known limitations:

- there is no single HTML admin dashboard yet
- staff still approve Pink/Yellow requests directly in the log sheets
- live permission/protection behavior still needs real-environment validation
- some maintenance and edge-case workflows still need more live testing
- repo-wide lint cleanup is still unfinished

## Recommended Way to Work With It

If you are trying to use the system right now:

- do operational work in the Google Sheet
- use the `Attendance` menu for all admin actions
- use the forms for member submissions
- use the log tabs for review and approvals
- use automated tests locally while developing
- use manual live tests in the real Google Sheet before trusting a workflow

## Important Files

- [code.js](./KSUMB-Attendance-GAS/src/code.js): custom menu
- [Feature_Admin.js](./KSUMB-Attendance-GAS/src/Feature_Admin.js): setup and validation
- [Feature_FormSync.js](./KSUMB-Attendance-GAS/src/Feature_FormSync.js): form submission handlers
- [Feature_LateCheckIn.js](./KSUMB-Attendance-GAS/src/Feature_LateCheckIn.js): Late Check-In processing
- [Feature_PinkSheets.js](./KSUMB-Attendance-GAS/src/Feature_PinkSheets.js): Pink Sheet processing
- [Feature_YellowSheets.js](./KSUMB-Attendance-GAS/src/Feature_YellowSheets.js): Yellow Sheet processing
- [Feature_RosterSync.js](./KSUMB-Attendance-GAS/src/Feature_RosterSync.js): spreadsheet roster sync
- [Feature_Maintenance.js](./KSUMB-Attendance-GAS/src/Feature_Maintenance.js): clear/reset operations

## Related Documents

- [DOCS/REQUIREMENTS_DOCUMENT.md](./DOCS/REQUIREMENTS_DOCUMENT.md)
- [DOCS/SCOPE_02.md](./DOCS/SCOPE_02.md)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
- [REPO_ANALYSIS_FINDINGS.md](./REPO_ANALYSIS_FINDINGS.md)
