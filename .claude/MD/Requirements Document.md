# Requirements Document

| Property | Value | Property | Value |
| :--- | :--- | :--- | :--- |
| **Requirements Document** | | **Date** | 4/15/2026 |
| **Reporting Period** | 4/6/2026 – 4/10/2026 | | |
| **Project Sponsor** | Dr. Alexander Wimmer | **Project Manager** | Cameron Nelson |
| **Project Start Date** | 1/27/2026 | **Project End Date** | 4/30/2026 |
| **Document Version** | 2.0 (GAS Pivot) | | |

## Introduction
This Requirements Document defines the functional and non-functional requirements for the KSUMB Attendance System.
It describes what the system must do and the quality attributes it must exhibit, without prescribing a specific technical implementation.
All requirements trace back to the business objectives established in the Project Charter and the stakeholder needs identified during the interview with Sharyn Worcester and Dr. Wimmer.
This document serves as the foundation for downstream planning artifacts including the Scope Statement, Work Breakdown Structure, Schedule, and ultimately the Design and Test Plans.

## Stakeholders & User Roles

| Role | Description | Primary System Capabilities |
| :--- | :--- | :--- |
| **Staff/Director** | Band directors and administrative staff (e.g., Dr. Wimmer, Sharyn Worcester). Spreadsheet owner with full access. | Custom menu actions (Add Date, Delete Date, Roster Sync, Clear History, New Year Setup), Access to all tabs including hidden logs (Pink Sheet, Yellow Sheet, Late Check-In, Database), approve/deny exception submissions, view Concern List. |
| **Section Leader** | Student leaders responsible for a specific section. Edit access scoped to their section tab. | Record attendance via dropdown selection on their section tab, view their section's roster and attendance history. |
| **Member** | General band members (~400+ students). No direct spreadsheet access. | Self late check-in (Google Form), Submit Pink Sheets and Yellow Sheets (Google Forms), Edit Yellow Sheet response |

Note: The Kiosk role from the original requirements has been eliminated.
Members who need to check in late at the field use the Late Check-In Google Form on any available device.
Section Leaders record day-of attendance directly in the spreadsheet.

## Functional Requirements
Note: Requirements are prioritized using MoSCoW: Must (M), Should (S), Could (C), Won’t this phase (W).

### DateAdd (Add Rehearsal Date)

| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| FR-101 | Staff shall be able to add a single rehearsal date and time via a custom menu item that opens an HTML dialog with a date/time picker and input validation. | M | Menu item opens dialog; staff selects date and time; invalid inputs are rejected before submission. |
| FR-102 | The date and time shall be stored in the new column header using the format M/D H:MM AM/PM (e.g., "3/30 6:00 PM"). The script shall parse this into a proper Date object internally for all comparisons and logic. | M | Column header displays the formatted string; internal logic correctly parses and compares dates. |
| FR-103 | The new date column shall be inserted in chronological order among existing date columns. Existing columns and their data shall shift right to accommodate the insertion — no data is overwritten or lost. | M | Adding a date between two existing dates inserts it in the correct position; all existing attendance data remains intact. |
| FR-104 | New date columns shall inherit the same data validation (Present / Tardy / Absent / Excused dropdown) and existing date columns. The script shall expand existing data validation ranges rather than creating duplicate rules. | M | New column has the validation dropdown; rule ranges are updated (not duplicated); visual highlighting behaves identically to existing columns. |
| FR-105 | All cells in a newly added date column shall default to blank (no value). | M | After adding a date, every member's cell in that column is empty. |
| FR-106 | On date creation, the script shall check the Pink Sheet log for any entries with a matching date. For each match: if the Pink Sheet status is "Approved," the cell shall be set to "Excused" and a note added (Date/Time Submitted, status). If "Pending" or "Denied," a note shall be added but the cell value shall remain blank. | M | Adding a date that matches a pending Pink Sheet adds the note only; adding a date that matches an approved Pink Sheet sets the cell to "Excused" with the note. |
| FR-107 | All configurable values (e.g., late thresholds, default rehearsal time) shall be read from the Data tab at runtime. No values shall be hardcoded in the script. | M | Changing a config value on the Data tab is reflected the next time the script runs without code changes. |
| FR-108 | Staff shall be able to add multiple dates at once (e.g., a range of recurring rehearsal days). | W | Deferred to a future enhancement phase. |

### Late Check-In

| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| FR-201 | A Google Form shall collect late check-in submissions with the following fields: Section (dropdown), Name (dropdown filtered to the selected section), Reason for late arrival (multiple choice), and an "If Other, please explain" free-text field. | M | Form presents section list first; second page shows only names belonging to that section; reason and other fields are present. |
| FR-202 | The Name field shall be populated from the Database tab roster so that students select their exact name string rather than typing it manually. The form dropdowns shall be refreshed whenever a roster sync is performed. | M | Names on the form match the Database tab exactly; after a roster sync, new/removed members are reflected on the form. |
| FR-203 | Each form submission shall be appended as a log entry to the Late Check-In log tab with a Status column. The initial status shall be set to "Pending." Duplicate submissions for the same student on the same day shall be logged without error. Full Name, Section, Arrival Time, and Reason (Multiple choice with manual text option). | M | Every submission creates a new row in the log and sets status to pending; a second submission by the same student on the same day does not throw an error or break automation. |
| FR-204 | On submission, the script shall locate today's date column in the student's section tab by searching column headers — not by assuming it is the last column. | M | If today's date column exists between other date columns, the correct column is found and updated. |
| FR-205 | The script shall compare the submission timestamp against the rehearsal start time (parsed from the column header) and the late threshold value stored on the Data tab. If within the threshold, the cell shall be set to "Present"; if beyond the threshold, the cell shall be set to "Tardy." | M | A student checking in within the threshold is marked Present; a student beyond the threshold is marked Tardy; changing the threshold on the Data tab changes future behavior without code changes. |
| FR-206 | The late check-in shall overwrite an existing cell value of "Absent" or blank. It shall also overwrite "Excused." | M | A student previously marked Absent, blank, or Excused has their cell updated to Present or Tardy based on the threshold. |
| FR-207 | A comment/note shall be added to the updated cell containing the time and reason provided on the form. | M | After submission, the cell has a note with the student's stated time and reason for late arrival. |
| FR-208 | If the cell is successfully updated, the log entry's Status shall be changed to "Complete." If no date column exists for today, Status shall remain "Pending" and no cell update shall occur. | M | Successful update → Status = "Complete"; missing date column → Status = "Pending," no error thrown. |
| FR-209 | When a new date is added via DateAdd (FR-106), the script shall also check the Late Check-In log for any "Pending" entries matching that date and process them using the same threshold logic. | M | Adding a date that matches a pending late check-in log entry updates the cell and sets the log entry to "Complete." |
| FR-210 | All threshold values and attendance status strings shall be read from the Data tab at runtime. No values shall be hardcoded. | S | Config-driven behavior; same principle as FR-107. |

### Pink Sheet (Excused Absence)

| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| FR-301 | A Google Form shall collect Pink Sheet submissions with the following fields: Section (dropdown), Name (dropdown filtered to the selected section), Date of absence, and Reason. | M | Form collects all four fields; section and name use roster-driven dropdowns consistent with FR-202. |
| FR-302 | Each form submission shall be appended as a log entry to the Pink Sheet log tab with a Status column. The initial status shall be set to "Pending." | M | Every submission creates a new row with Status = "Pending." |
| FR-303 | One Pink Sheet submission shall cover one date only. Students needing to excuse multiple dates shall submit separate forms. | S | Form accepts a single date value per submission. |
| FR-304 | Staff shall be able to change a Pink Sheet log entry's status to "Approved" or "Denied" directly in the log tab. | M | Staff can edit the Status cell on the log; values are validated to Pending/Approved/Denied. |
| FR-305 | When a Pink Sheet is set to "Approved" and the corresponding date column already exists in the student's section tab, the script shall set the cell to "Excused" and add a note (Date/Time Submitted, Status). The log entry Status shall then be updated to "Complete." | M | Approving a Pink Sheet for an existing date marks the cell "Excused," adds the note, and sets log status to "Complete." |
| FR-306 | When a Pink Sheet is set to "Approved" but the corresponding date column does not yet exist, the log entry Status shall remain "Approved" (not "Complete"). When the date is later added via DateAdd (per FR-106), the script shall process the entry — setting the cell to "Excused" and the note, then updating the log status to "Complete." | M | Approved entry with no matching date stays "Approved"; once the date is added, the cell is marked and log status becomes "Complete." |
| FR-307 | When a Pink Sheet is set to "Denied," a note shall be added to the student's cell (Date/Time Submitted, "Denied") but the cell value shall not be changed. The log entry Status shall be updated to "Complete." | M | Denying a Pink Sheet adds the note only; cell value remains unchanged; log status set to "Complete." |
| FR-308 | When a Pink Sheet status is "Pending," no cell changes shall occur regardless of whether the date column exists. A note may be added indicating the pending submission. | M | Pending entries do not modify attendance cell values, only adding note there is a pending pink sheet. |
| FR-309 | Notes added to attendance cells shall include Date/Time Submitted and the current status (Approved/Denied/Pending). The reason shall NOT be included in the note. | M | Note contains submission timestamp and status only; no reason text is visible in the cell note. |
| FR-310 | All status strings and configuration values shall be read from the Data tab at runtime. No values shall be hardcoded. | S | Consistent with FR-107 and FR-210. |

### Yellow Sheet (Class Conflict)

| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| FR-401 | A Google Form shall collect Yellow Sheet submissions with the following fields: Section (dropdown), Name (dropdown filtered to the selected section), and one or more conflict entries specifying Day(s) of the week (Monday–Friday, multi-select), Start time, and End time. | M | Form collects section, name, and at least one conflict block with day/time range. |
| FR-402 | The form shall allow students to edit their response after submission. When a student edits their response, the existing entry in the Yellow Sheet log tab shall be updated rather than creating a duplicate row. There shall be no more than one Yellow Sheet entry per student. | M | A student submitting a second time updates their existing row; the log never contains duplicate entries for the same student. |
| FR-403 | Each form submission shall be appended to the Yellow Sheet log tab with a Status column. The initial status shall be set to "Pending." | M | New submissions create a row with Status = "Pending." |
| FR-404 | Staff shall be able to change a Yellow Sheet log entry's status to "Approved" or "Denied" directly in the log tab. | M | Staff can edit the Status cell; values are validated to Pending/Approved/Denied. |
| FR-405 | When a Yellow Sheet is set to "Approved," a note/comment shall be added to the student's name cell in their section tab containing the conflict days and times (e.g., "MWF 2:30–3:20 PM"). The log entry Status shall then be updated to "Complete." | M | Approving a Yellow Sheet adds the conflict schedule note to the name cell and sets log status to "Complete." |
| FR-406 | The Yellow Sheet shall NOT automatically mark any attendance cells. Conflict dates are informational only — staff and section leaders handle attendance for those dates manually. | M | No attendance cell values are modified by Yellow Sheet processing at any point. |
| FR-407 | The yellow highlight on a student's name cell shall continue to be handled by the existing conditional formatting rule. The script shall not modify or duplicate this formatting. | S | Existing conditional formatting rule highlights names that appear in the Yellow Sheet log; script does not touch this rule. |
| FR-408 | When a Yellow Sheet status is "Pending" or "Denied," no note shall be added to the student's name cell. | M | Only approved entries produce a note on the section tab. |
| FR-409 | If a student updates their form response and their Yellow Sheet was already "Complete," the log entry shall revert to "Pending" and the existing name cell note shall be set to “Pending Yellow Sheet”, requiring re-approval. | S | Editing a previously approved response resets status to "Pending" and removes the old note. |
| FR-410 | All status strings and configuration values shall be read from the Data tab at runtime. No values shall be hardcoded. | M | Consistent with FR-107, FR-210, FR-310. |

### Concern List

| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| FR-501 | A dedicated Concern List tab shall exist in the spreadsheet containing a searchable date selector that allows staff to select a rehearsal date. | M | Tab exists; staff can select any date that has a corresponding column in the section tabs. |
| FR-502 | When a date is selected, the tab shall populate a list of all students who are NOT marked as "Present" for that date across all sections. This shall include students marked Absent, Tardy, Excused, or blank. | M | Selecting a date shows every student whose cell value is not "Present"; no statuses are excluded. |
| FR-503 | The concern list shall be driven by spreadsheet formulas (e.g., FILTER, QUERY, or a pivot table) rather than Apps Script automation. | M | List updates dynamically when the date selection changes; no script execution required. |
| FR-504 | The list shall display at minimum: Student Name, Section, and current Attendance Status for the selected date. | S | All three data points are visible for each entry on the list. |
| FR-505 | The system shall maintain an immutable audit log of all check-in and status change events | C | Audit log is exportable through a CSV |

### Spreadsheet and Roster Management

| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| FR-601 | The Database tab shall serve as the single source of truth for all roster data. It shall contain at minimum: Student Name, Section, and any additional student fields needed by forms or tabs. | M | All other tabs and forms derive their roster data from this tab. |
| FR-602 | A manual "Roster Sync" action (via custom menu) shall read the Database tab and update each section tab accordingly: new members are added, removed members are deleted, and members who changed sections are moved. Existing attendance data for retained members shall be preserved. | M | Adding a student to the Database and running sync adds them to the correct section tab with blank attendance cells; removing a student removes their row; changing a section moves the student and preserves their data in the new tab. |
| FR-603 | Roster Sync shall also create new section tabs if a section exists in the Database that does not yet have a tab, including all conditional formatting, data validation, and table structure matching existing section tabs. | W | Adding a new section to the Database and running sync creates a properly formatted tab. |
| FR-604 | Roster Sync shall refresh all form dropdowns (Late Check-In, Pink Sheet, Yellow Sheet) with the current roster from the Database tab. | M | After sync, form dropdowns reflect the current Database roster with no stale or missing names. |
| FR-605 | Names within each section tab shall be sorted alphabetically after sync. | S | After sync, every section tab's roster is in alphabetical order by name. Each member’s past attendance is retained and moved with the student (including notes/comments) |
| FR-606 | A "Clear Attendance History" action (via custom menu) shall remove all date columns and their data from every section tab, resetting the spreadsheet to a roster-only state. A confirmation dialog shall be presented before execution. | C | After clearing, section tabs contain only the roster columns with no date columns; a confirmation prompt prevents accidental execution. The data validation rule should be kept in the second column ready for when a date is added so it can be expanded. |
| FR-607 | A "Delete Date" action (via custom menu) shall allow staff to select a specific date and remove that date column from all section tabs. A confirmation dialog shall be presented before execution. | S | Selecting a date removes that column from every section tab; data in other columns is unaffected; confirmation prompt prevents accidental deletion. |
| FR-608 | Delete Date shall also update any log entries (Late Check-In, Pink Sheet) that reference the deleted date — setting their Status back to "Pending" so they can be reprocessed if the date is re-added. | C | Deleting a date that had associated log entries resets those entries to "Pending." |
| FR-609 | A "New Year Setup" action (via custom menu) shall clear all attendance history (per FR-606), clear all form response logs (Late Check-In, Pink Sheet, Yellow Sheet), and reset the Yellow Sheet name cell notes/highlights. The Database tab shall be preserved for manual roster updates. | W | After running, the spreadsheet is in a clean state ready for a new roster import and new semester; Database tab is untouched; a confirmation dialog prevents accidental execution. |
| FR-610 | All management actions shall be accessible from a single custom menu in the spreadsheet menu bar. | S | One top-level menu contains all staff actions: Roster Sync, Add Date, Delete Date, Clear History, New Year Setup, etc. |
| FR-611 | All configuration values (section names, status strings, formatting colors, thresholds) shall be stored on the Data tab and read at runtime. No values shall be hardcoded. | S | Consistent with FR-107, FR-210, FR-310, FR-410. |

## Non-Functional Requirements

### Performance

| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| NFR-01 | Form submission triggers shall process and update the spreadsheet within 30 seconds under normal conditions. | S | A Late Check-In or Pink Sheet submission is reflected in the section tab within 30 seconds of form submit. |
| NFR-02 | Roster Sync and DateAdd operations shall complete within 60 seconds for a roster of 400+ members across all section tabs. | S | Running Roster Sync or Add Date on a full roster completes without timeout. |

### Reliability & Availability

| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| NFR-03 | All form submission triggers shall include error handling that logs failures without corrupting spreadsheet data. If a trigger fails, the log entry remains at "Pending" status for manual review or reprocessing. | M | A trigger failure does not overwrite or delete existing data; the log entry status stays "Pending"; an error is logged. |
| NFR-04 | Scripts shall handle concurrent form submissions gracefully using Apps Script's built-in Lock Service where necessary to prevent race conditions. | S | Two students submitting Late Check-In simultaneously do not produce data corruption or overwrite each other's records. |

### Security & Compliance

| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| NFR-05 | Spreadsheet access shall be controlled via Google Workspace sharing permissions. Section Leaders receive edit access to their section tab only. Log tabs (Pink Sheet, Yellow Sheet, Late Check-In, Database) shall be hidden and restricted to the spreadsheet owner. | S | A Section Leader cannot view or edit hidden tabs; only the owner can unhide and edit them. |
| NFR-06 | Google Forms shall be accessible to anyone with the link (no login required) to accommodate students on personal devices. Form responses shall be validated server-side by the trigger script. | S | A student can submit a form without a Google Workspace login; the trigger validates the submission data before processing. |
| NFR-07 | The system shall comply with FERPA guidelines. Attendance records are educational records; access shall be limited to authorized staff and the student's own section leader. Individual student reasons for Pink Sheets shall not be visible in cell notes or to Section Leaders. | M | Pink Sheet notes contain timestamp and status only — no reason text. Section Leaders cannot access other sections' data. |
| NFR-08 | No student data shall be stored outside the Google Workspace environment (no third-party services, external databases, or API calls to external systems). | M | All data resides in the Google Spreadsheet and Google Forms only. |

### Usability

| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| NFR-09 | Google Forms shall be mobile-friendly and usable on smartphone screens without horizontal scrolling. | S | Students can complete any form on a standard smartphone screen. |
| NFR-10 | The custom spreadsheet menu shall organize all staff actions in a logical hierarchy with clear labels. | C | A new staff member can locate and execute any management action from the menu without documentation. |
| NFR-11 | Attendance statuses shall be visually distinguished via conditional formatting: distinct colors for Present, Tardy, Absent, and Excused. | C | Each status has a unique color; changing a color on the Data tab updates formatting on the next rule refresh. |

### Hosting & Sustainability

| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| NFR-12 | The system shall run entirely within Google Workspace (Sheets, Forms, Apps Script) with zero external hosting costs. | M | No paid services or external infrastructure required for operation. |
| NFR-13 | The spreadsheet and Apps Script project shall be owned by an institutional Google account (e.g., ksumb@ksu.edu), not a personal student account. The system shall be fully transferable to future staff. | M | Ownership is under an institutional account; a handover guide documents how to transfer ownership and manage the system. |
| NFR-14 | The system shall not rely on any single student's personal account for maintenance or operation. | M | All scripts, triggers, and forms function under the institutional account without personal account dependencies. |
| NFR-15 | The Apps Script code shall be documented with inline comments and a separate handover guide so that a technically competent staff member or future student can maintain the system. | S | Code has function-level comments; a handover document explains architecture, configuration, and common maintenance tasks. |

## Technology Preferences
While this document focuses on what, not how, the following technology preferences have been expressed by the project team and sponsor.
These are recorded as constraints rather than requirements and will be formally evaluated during Design.

| Constraint | Detail |
| :--- | :--- |
| **Platform** | Google Workspace: Sheets (data store), Forms (member input), Apps Script (automation). |
| **Runtime** | Google Apps Script (V8 engine). Single spreadsheet model for performance. |
| **Build/Deploy** | Node.js build script + clasp CLI for deployment. |
| **Authentication** | Google Workspace sharing permissions for spreadsheet access. Forms are open-link (no login required). |
| **Data Integration** | Roster imported manually into the Database tab (copy/paste from onboarding form or export). |
| **Connectivity** | Forms require internet access. No offline capability. |

## Assumptions & Dependencies

### Assumptions
* All band members have access to a smartphone or shared device with internet access at the practice field.
* Google Workspace (K-State institutional accounts) will remain available and supported.
* The existing onboarding Google Form or FileMaker Pro export provides roster data in a format that can be pasted into the Database tab.
* Wi-Fi or cellular coverage at Memorial Stadium and the practice field is sufficient for Google Form submissions.
* Section Leaders are trusted with edit access to their section tab and trained on how to record attendance.
* Staff will manually run Roster Sync when roster changes occur (not automatic).

### Dependencies
* Creation or availability of an institutional Google account (ksumb@ksu.edu or equivalent) for spreadsheet and script ownership.
* Clarification from Sharyn Worcester on the roster data fields collected during onboarding and how they map to the Database tab.
* Staff availability for approval workflows (Pink Sheet and Yellow Sheet approvals are manual).
* Google Apps Script quotas (trigger execution time limits, daily quotas) are sufficient for a 400+ member roster.

## Out of Scope (This Phase)
* Geofencing or GPS-verified check-in.
* Mobile app or custom web interface (all member interaction is via Google Forms).
* SSO / K-State Active Directory integration.
* Kiosk hardware or standalone kiosk mode.
* Automated grade calculation or grade display.
* Integration with KSIS for automatic roster importing.
* Pep-band sign-up system.
* Functionality for other K-State band programs.
* Calendar view for events.
* Automated email/notification delivery of the Concern List.
* Multi-date batch entry for DateAdd (deferred to future enhancement).

## Open Questions & Risks
The following items require further clarification or carry risk that may affect downstream planning:

| # | Item | Impact / Notes |
| :--- | :--- | :--- |
| 1 | **Roster data fields:** What student information does the onboarding Google Form collect, and which fields are needed in the Database tab? | Blocks final Database tab schema design. Email sent to Sharyn. |
| 2 | **Institutional account availability:** Is a ksumb@ksu.edu Google account available or does one need to be created? | Affects NFR-13. System must eventually live under this account. |
| 3 | **Google Apps Script quotas:** Will trigger execution limits and daily quotas support 400+ simultaneous form submissions during a single rehearsal window? | May require batching or queue logic if quotas are hit. Needs testing. |
| 4 | **Cascading form dropdowns:** Google Forms does not natively support filtering a name dropdown by section selection. Implementation may require a multi-page form workaround or a custom Apps Script web app form. | Affects FR-201/FR-202 design. Needs prototyping. |
| 5 | **Sheet protection granularity:** Can Google Sheets restrict a Section Leader to edit only their tab while hiding other tabs? Native protection may not fully support this — may need workaround. | Affects NFR-05. Needs testing with Workspace sharing settings. |
| 6 | **Concurrent edit conflicts:** Multiple Section Leaders editing their tabs simultaneously during rehearsal. Does Google Sheets handle this natively, or do scripts need Lock Service? | Affects NFR-04. Low risk since each leader edits a different tab. |
| 7 | **Yellow Sheet edit detection:** When a student edits their Google Form response, does the onFormSubmit trigger fire again? If not, an alternative mechanism is needed. | Affects FR-402/FR-409. Needs testing. |