# IMPLEMENTATION_PLAN

Date: 2026-04-14

## Purpose

This document is the single implementation plan for turning the current KSUMB Attendance Google Apps Script repository into the fully functional app described by `REQUIREMENTS_DOCUMENT.md`, while incorporating the useful parts of the notes in `DOCS/`.

Where the documents conflict, this plan uses `REQUIREMENTS_DOCUMENT.md` as the source of truth.

## Source-of-Truth Decisions

Before implementation starts, the team should lock these decisions:

1. The platform remains Google Sheets + Google Forms + Google Apps Script only.
2. No offline caching, GPS, SSO, custom mobile app, or external database work is in scope.
3. Late Check-In is automatic on form submit.
4. Pink Sheet and Yellow Sheet use approval workflows.
5. Configuration must come from the `Data` tab at runtime.
6. The required terminal queue status is `Complete`, not `Completed`.
7. Reliability requirements include `LockService`, error logging, idempotent processing, and validation.

## Current State Summary

The repo already has:

- custom menu registration,
- HTML dialogs for add/delete date and default attendance,
- form builders for Pink, Yellow, and Late Check-In,
- form roster sync,
- a date insertion feature,
- a concern-list generator,
- a manual queue processor.

The repo is still missing or misaligned on:

- spreadsheet-side roster sync,
- automatic Late Check-In processing,
- proper Pink Sheet note/status behavior,
- Yellow edit-response handling,
- clear history and new year setup,
- queue/state consistency,
- schema/bootstrap validation,
- access/protection automation,
- test coverage,
- handover-grade documentation.

## Implementation Principles

1. Build against the requirements, not the prototype behavior.
2. Prefer batch reads/writes everywhere.
3. Use `LockService` for trigger-driven sheet mutations.
4. Make workflows idempotent.
5. Keep all operational strings in `Data`.
6. Treat spreadsheet schema as an API and validate it.
7. Separate pure logic from GAS API calls so the logic can be unit tested.

## Target Architecture

The target app should have these modules:

- `Config.js`: reads validated config from `Data`.
- `Schema.js`: validates required tabs, headers, ranges, and config keys.
- `SheetManager.js`: batch utilities and shared sheet helpers.
- `Feature_RosterSync.js`: spreadsheet roster sync and form refresh orchestration.
- `Feature_DateAdd.js`: add/delete date and cross-processing of pending records.
- `Feature_LateCheckIn.js`: immediate trigger processing for late submissions.
- `Feature_PinkSheets.js`: queue handling, status changes, note writing, deferred completion.
- `Feature_YellowSheets.js`: queue handling, edit-response reconciliation, note updates.
- `Feature_ConcernList.js`: formula-driven concern list setup or refresh.
- `Feature_Admin.js`: clear history, new year setup, trigger install, environment validation.
- `code.js`: menu registration only.

## Required Spreadsheet Schema

The implementation should standardize these tabs:

- `Database`
- `Data`
- `Pink Sheets`
- `Yellow Sheets`
- `Late Check-Ins`
- `Concern List`
- one tab per configured section
- optional `System Log`

The implementation should standardize these queue columns:

### Pink Sheets

- `Submission ID`
- `Submitted At`
- `Full Name`
- `Section`
- `Date`
- `Reason`
- `Status`
- `Processed At`
- `Error`

### Late Check-Ins

- `Submission ID`
- `Submitted At`
- `Full Name`
- `Section`
- `Arrival Time`
- `Reason`
- `Other Explanation`
- `Status`
- `Processed At`
- `Error`

### Yellow Sheets

- `Submission ID`
- `Response ID`
- `Submitted At`
- `Last Updated At`
- `Full Name`
- `Section`
- `Conflict Days`
- `Start Time`
- `End Time`
- `Notes`
- `Status`
- `Processed At`
- `Error`

### Data tab keys

At minimum:

- `TIMEZONE`
- `REHEARSAL_START_TIME`
- `LATE_THRESHOLD_MINUTES`
- `STATUS_PENDING`
- `STATUS_APPROVED`
- `STATUS_DENIED`
- `STATUS_COMPLETE`
- `ATTENDANCE_PRESENT`
- `ATTENDANCE_TARDY`
- `ATTENDANCE_ABSENT`
- `ATTENDANCE_EXCUSED`
- `SECTION_LIST_RANGE`
- `LATE_REASON_LIST_RANGE`
- `PINK_FORM_ID`
- `LATE_FORM_ID`
- `YELLOW_FORM_ID`

## Step-by-Step Plan

## Phase 1: Align the documents and lock the design

### Step 1. Resolve planning contradictions

- Remove offline/GPS language from active implementation planning.
- Keep Google Forms as the member input mechanism.
- Keep SSO out of scope.
- Confirm Concern List should be formula-driven, not snapshot-only.
- Confirm Late Check-In is automatic and Pink/Yellow are approval-based.

Deliverable:

- updated design baseline with one workflow decision per feature.

### Step 2. Define the canonical sheet and queue schema

- Finalize exact tab names.
- Finalize exact header names.
- Finalize queue status values.
- Finalize section-tab layout.
- Finalize what notes are allowed for FERPA compliance.

Deliverable:

- schema table for every tab and column.

### Step 3. Define the state machines

Create a written state transition table for:

- Late Check-In
- Pink Sheet
- Yellow Sheet

Required Late state flow:

- submit -> `Pending`
- if date column exists and update succeeds -> `Complete`
- if date column missing -> remain `Pending`
- if processing error -> remain `Pending` and log error

Required Pink state flow:

- submit -> `Pending`
- staff changes to `Approved` or `Denied`
- approved + date exists -> `Complete`
- approved + date missing -> remain `Approved`
- denied -> `Complete`

Required Yellow state flow:

- submit -> `Pending`
- staff changes to `Approved` or `Denied`
- approved -> `Complete`
- denied -> remain denied or complete based on final admin decision, but behavior must be explicit
- edited approved response -> revert to `Pending`

Deliverable:

- documented state machines attached to implementation tickets.

## Phase 2: Build the reliable foundation

### Step 4. Implement schema validation

Create `validateEnvironment()` that:

- checks required tabs exist,
- checks required headers exist,
- checks required `Data` keys exist,
- checks configured section tabs exist,
- checks required named ranges or range-backed config sources exist,
- returns a human-readable validation report.

Also add `initializeSystem()` that can:

- create missing support tabs,
- write standard headers,
- add validation dropdowns,
- install triggers,
- store form IDs.

Deliverable:

- admin validation/setup flow available from the menu.

### Step 5. Centralize configuration

- Replace hardcoded section names with `Data`-driven section config.
- Replace hardcoded statuses.
- Replace hardcoded late reasons.
- Replace repeated timezone literals.
- Replace script-property-only behavior unless explicitly intended.

Deliverable:

- all runtime behavior reads from `Data`.

### Step 6. Add structured logging and error handling

Implement a shared logger that writes to `System Log` with:

- timestamp,
- feature,
- action,
- severity,
- submission ID,
- message,
- stack or error text.

Trigger handlers must:

- catch errors,
- keep queue rows non-destructive,
- leave failed items reprocessable,
- log the failure.

Deliverable:

- NFR-03 support.

### Step 7. Add concurrency control

Wrap write-critical trigger handlers with `LockService`.

Use it for:

- Late Check-In processing,
- Pink submission logging if it mutates other sheets,
- Yellow submission update logic,
- any bulk queue processor,
- date-add cross-processing,
- delete-date side effects.

Always:

- acquire lock,
- batch operations,
- `SpreadsheetApp.flush()`,
- release lock.

Deliverable:

- NFR-04 support.

### Step 8. Add idempotency keys

Persist a stable identifier per submission:

- form response ID when available,
- otherwise generated submission UUID.

Use it to:

- prevent duplicate queue rows on retries,
- prevent duplicate note writes,
- safely reprocess failed items,
- reconcile Yellow edits.

Deliverable:

- reprocessing-safe queue design.

## Phase 3: Correct the core features

### Step 9. Rebuild Late Check-In to match requirements

Implement `onLateSubmit(e)` so it:

1. validates form payload,
2. writes the log row with reason fields,
3. finds the correct section tab,
4. finds today's date column by header search,
5. parses rehearsal start time from the header,
6. compares arrival time against configured threshold,
7. writes `Present` or `Tardy`,
8. overwrites blank, `Absent`, or `Excused`,
9. adds a note with arrival time and reason,
10. marks the queue row `Complete` if successful,
11. leaves row `Pending` if the date column does not yet exist.

Deliverable:

- FR-201 through FR-210 implemented correctly.

### Step 10. Rebuild Pink Sheet processing

Implement:

- submission logging with timestamp and reason,
- status validation setup on the log tab,
- approved processing,
- denied processing,
- note-only pending behavior when needed,
- date-add sweep for matching pending/approved/denied rows.

Rules:

- notes contain timestamp and status only,
- notes never include reason text,
- approved + date exists -> set `Excused` + note + `Complete`,
- approved + date missing -> stay `Approved`,
- denied -> note only + `Complete`,
- pending -> no attendance change.

Deliverable:

- FR-301 through FR-310 implemented correctly.

### Step 11. Rebuild Yellow Sheet processing

Implement:

- one-row-per-student reconciliation,
- response-edit handling,
- response ID tracking,
- status validation,
- approved note writing to the name cell,
- pending reset behavior after an edited approved response,
- duplicate-note prevention.

Rules:

- Yellow never changes attendance cells,
- only approved rows create name-cell notes,
- edited approved responses revert to `Pending` and replace stale note content.

Deliverable:

- FR-401 through FR-410 implemented correctly.

### Step 12. Fix DateAdd and Delete Date

Update DateAdd to:

- always create blank attendance cells,
- insert columns chronologically,
- preserve formatting and validation behavior,
- process matching Pink and Late queue rows after insertion,
- use data-driven defaults only where requirements allow.

Update Delete Date to:

- remove the chosen date from all section tabs,
- reset matching Pink and Late queue rows to `Pending`,
- preserve all unrelated data.

Deliverable:

- FR-101 through FR-107, FR-607, FR-608 aligned.

### Step 13. Rebuild Concern List as specified

Prefer a formula-driven sheet with:

- a date selector cell,
- formulas that pull all non-`Present` records for the selected rehearsal,
- behavior explicitly documented for `Excused`.

If formula-only is too brittle, use a script only for setup and formula refresh, not as the primary reporting mechanism.

Deliverable:

- AC-5-aligned concern list.

## Phase 4: Implement missing spreadsheet-management features

### Step 14. Implement spreadsheet roster sync

Build `syncRosterFromDatabase()` that:

1. reads `Database`,
2. filters active members,
3. groups by section,
4. compares against each section tab roster,
5. adds new members,
6. removes inactive members,
7. moves members who changed sections,
8. preserves historical attendance values,
9. preserves notes/comments,
10. sorts names alphabetically,
11. refreshes all forms afterward.

Important:

- preserve attendance row data when members move sections,
- preserve name-cell notes where allowed,
- do not create new section tabs unless the project is re-scoped.

Deliverable:

- FR-601 through FR-605 and FR-604 form-refresh behavior.

### Step 15. Implement clear-history

Build a confirmed admin action that:

- removes all date columns from every section tab,
- preserves roster columns,
- preserves reusable validation scaffolding,
- does not corrupt formatting.

Deliverable:

- FR-606.

### Step 16. Implement new-year setup

Build a confirmed admin action that:

- runs clear-history,
- clears Pink/Yellow/Late logs,
- clears Yellow-related notes/highlights as required,
- preserves `Database`,
- preserves config and form links unless intentionally rebuilt.

Deliverable:

- FR-609-aligned behavior.

### Step 17. Improve menu organization

Rework the custom menu into a single admin menu with clear labels:

- Validate Environment
- Initialize System
- Add Rehearsal Date
- Delete Rehearsal Date
- Roster Sync
- Build/Rebuild Forms
- Sync Forms
- Process Approved Requests
- Clear Attendance History
- New Year Setup
- Refresh Concern List

Deliverable:

- FR-610 and NFR-10 support.

## Phase 5: Access control, compliance, and reliability hardening

### Step 18. Implement protections and visibility rules

Automate or document:

- hidden admin/log tabs,
- protected ranges/tabs,
- section-leader edit scoping,
- owner-only admin access.

Because Google Sheets protection is imperfect for tab-only role isolation, validate what is technically enforceable and document the operational workaround if needed.

Deliverable:

- NFR-05 handling plan plus tested permissions setup.

### Step 19. FERPA and note-content review

Audit all note-writing logic to ensure:

- Pink notes never include reason text,
- only authorized roles can access sensitive tabs,
- concern-list outputs do not expose protected detail,
- forms remain open-link but server-side validated.

Deliverable:

- NFR-06 and NFR-07 support.

### Step 20. Performance pass

Measure:

- DateAdd on full roster,
- Roster Sync on full roster,
- Late trigger processing under load,
- queue processing across many rows.

Optimize:

- sheet reads,
- writes,
- note application strategy,
- repeated config access,
- unnecessary `flush()` calls.

Deliverable:

- NFR-01 and NFR-02 validation.

## Phase 6: Testing and release readiness

### Step 21. Add automated tests

Extract pure logic into testable helpers and cover:

- date parsing,
- date column matching,
- threshold calculation,
- state transitions,
- queue filtering,
- roster diffing,
- member move preservation,
- delete-date related queue reset logic,
- note text generation.

Preferred minimum:

- unit tests for all pure logic,
- regression tests for every fixed bug.

Deliverable:

- reliable development feedback loop.

### Step 22. Add live-system verification scripts

Create a manual/UAT checklist for:

- building forms,
- submitting each form,
- approving/denying requests,
- adding/deleting dates,
- syncing the roster,
- clearing history,
- new year reset,
- permissions behavior,
- concern list results.

Map each case to requirement IDs.

Deliverable:

- acceptance test pack.

### Step 23. Clean repository quality issues

- make lint pass,
- normalize quotes/formatting,
- remove encoding artifacts,
- add consistent comments,
- keep `dist/` generated only from source.

Deliverable:

- maintainable codebase ready for handoff.

### Step 24. Create handover and operations docs

Write:

- setup guide,
- admin operations guide,
- trigger installation guide,
- form rebuild guide,
- ownership transfer guide,
- troubleshooting guide,
- change log.

Deliverable:

- NFR-13 through NFR-15 support.

## Recommended Build Order

This is the most pragmatic execution sequence:

1. lock source-of-truth decisions
2. define canonical schema and `Data` keys
3. implement environment validator
4. centralize config and statuses
5. add logging + `LockService` + idempotency
6. fix Late Check-In
7. fix Pink Sheet
8. fix Yellow Sheet
9. fix DateAdd/Delete Date cross-processing
10. implement spreadsheet roster sync
11. implement clear-history and new-year setup
12. rebuild Concern List
13. add protections and compliance safeguards
14. add tests
15. complete documentation and UAT

## Milestone Definition

### Milestone 1: Stable foundation

Done when:

- environment validation exists,
- config is centralized,
- status names are normalized,
- logging and locking exist.

### Milestone 2: Core workflows correct

Done when:

- Late, Pink, and Yellow behave per requirements,
- queue rows transition correctly,
- no feature finalizes a row without a successful outcome.

### Milestone 3: Spreadsheet management complete

Done when:

- roster sync works on section tabs,
- date delete resets related queue items,
- clear-history and new-year setup exist.

### Milestone 4: Production readiness

Done when:

- tests exist,
- lint is clean,
- permissions are verified,
- UAT passes,
- handover docs exist.

## Risks to Track During Implementation

High-risk items:

- Google Forms limitations for filtered dropdown behavior
- Yellow response edit detection details
- section-only access enforcement in Google Sheets
- trigger quotas under rehearsal load
- date parsing across school-year boundaries

Mitigation:

- prototype and verify each high-risk area in the real GAS environment early,
- do not defer these checks until the end.

## Definition of Complete App

The app should be considered complete only when:

- every Must requirement is implemented or formally re-scoped,
- the workflows match the requirements rather than the current prototype,
- the spreadsheet and forms can be rebuilt from documentation,
- the system runs under institutional ownership,
- the codebase is testable and maintainable,
- staff can operate it without developer intervention.

## Immediate Next Actions

The next concrete tasks should be:

1. create the canonical schema and `Data` key list,
2. build `validateEnvironment()` and `initializeSystem()`,
3. normalize queue status values and config access,
4. replace the current Late Check-In flow with the required automatic processing,
5. implement spreadsheet roster sync before adding more feature polish.
