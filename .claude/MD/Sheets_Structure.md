# KSUMB Attendance System Structure

This document outlines the architecture of the KSUMB Attendance Spreadsheet and its connected Google Forms to assist in Google Apps Script (GAS) development and data mapping.

---

## 1. Spreadsheet Tabs & Tables

All tables are named to match their respective tab names.

### 1.1 Database

*Source of truth for all ensemble members.*

| Header | Data Type | Notes |
| :--- | :--- | :--- |
| **Last Name** | String | |
| **First Name** | String | |
| **Full Name** | String | Formula: `[Last & ", " & First]` |
| **Section** | String | e.g., Tuba, Piccolo |
| **Instrument** | String | Formula: mirrors `Section` |
| **Email** | String | Formula: `[Last_First@ksu.edu]` |
| **Phone Number** | String | |
| **Status** | String | `Active` / `Inactive` |

---

### 1.2 Yellow Sheets

*Class Conflict requests (recurring schedule issues).*

| Header | Data Type | Notes |
| :--- | :--- | :--- |
| **Submission ID** | String | UUID generated on submission |
| **Response ID** | String | Google Forms response ID |
| **Submitted At** | String | Timestamp of original submission |
| **Last Updated At** | String | Timestamp of last update |
| **Full Name** | String | Format: `[Last, First]` |
| **Section** | String | |
| **Conflict Days** | String | e.g., `Monday, Tuesday, Wednesday` |
| **Start Time** | String | e.g., `2:30:00 PM` |
| **End Time** | String | e.g., `3:45:00 PM` |
| **Notes** | String | |
| **Status** | String | Dropdown: `Pending`, `Approved`, `Denied` |
| **Approved At** | String | Timestamp; populated by GAS on approval |
| **Denied At** | String | Timestamp; populated by GAS on denial |
| **Processed At** | String | Timestamp; populated by GAS after processing |
| **Error** | String | Error message if GAS processing failed |

---

### 1.3 Pink Sheets

*Excused Absence requests (single instances).*

| Header | Data Type | Notes |
| :--- | :--- | :--- |
| **Submission ID** | String | UUID generated on submission |
| **Submitted At** | String | Timestamp of original submission |
| **Full Name** | String | Format: `[Last, First]` |
| **Section** | String | |
| **Date** | String | Date of the absence |
| **Reason** | String | |
| **Status** | String | Dropdown: `Pending`, `Approved`, `Denied`, `Completed` |
| **Approved At** | String | Timestamp; populated by GAS on approval |
| **Denied At** | String | Timestamp; populated by GAS on denial |
| **Processed At** | String | Timestamp; populated by GAS after processing |
| **Error** | String | Error message if GAS processing failed |

---

### 1.4 Late Check-Ins

*Logs for late arrivals.*

| Header | Data Type | Notes |
| :--- | :--- | :--- |
| **Submission ID** | String | UUID generated on submission |
| **Submitted At** | String | Timestamp of submission (used as Arrival Time) |
| **Full Name** | String | Format: `[Last, First]` |
| **Section** | String | |
| **Arrival Time** | String | Timestamp of arrival |
| **Reason** | String | e.g., `Class`, `Work`, `Parking / traffic`, `Other` |
| **Other Explanation** | String | Populated if Reason is `Other` |
| **Status** | String | Dropdown: `Pending`, `Approved`, `Denied`, `Completed` |
| **Processed At** | String | Timestamp; populated by GAS after processing |
| **Error** | String | Error message if GAS processing failed |

---

### 1.5 Section Tabs

*Includes: Piccolo, Clarinet, Alto Sax, Tenor Sax, Trumpet, Horn, Trombone, Baritone, Tuba, Percussion, Classy Cats, Color Guard, Twirlers, Drum Majors, Student Staff.*

| Header | Data Type | Notes |
| :--- | :--- | :--- |
| **Name** | String | Format: `[Last, First]` |
| **[Dates]** | String | Column headers formatted as `M/D H:MM AM/PM` (e.g., `3/30 3:30 PM`). Cell values dropdown: `Present`, `Absent`, `Tardy`, `Excused` |

---

### 1.6 System Log

*Append-only log of GAS actions and errors.*

| Header | Data Type | Notes |
| :--- | :--- | :--- |
| **Timestamp** | String | Datetime of the logged event |
| **Feature** | String | GAS feature area (e.g., `Settings`, `Admin`) |
| **Action** | String | Function or action name (e.g., `saveSettings`) |
| **Severity** | String | `INFO`, `WARN`, `ERROR` |
| **Reference ID** | String | Submission ID or other reference; may be blank |
| **Message** | String | Human-readable log message |

---

### 1.7 Search Attendance *(Utility Tab)*

*Interactive search/filter interface for attendance records. Not a data source.*

| Filter Field | Notes |
| :--- | :--- |
| **Date** | Dropdown sourced from `Dates!A:A` |
| **Section** | Dropdown sourced from `Database[Section]` |
| **Name** | Dropdown sourced from `Database[Full Name]` |
| **Status** | Dropdown: `Present`, `Absent`, `Tardy`, `Excused` |
| **All Emails** | Array formula output; aggregates emails matching the filters |

Results are rendered below the filter row via array formulas.

---

### 1.8 Search Forms *(Utility Tab)*

*Interactive search/filter interface for form submission records. Not a data source.*

| Filter Field | Notes |
| :--- | :--- |
| **Forms** | Dropdown: `Pink Sheets`, `Yellow Sheets`, `Late Check-Ins` |
| **Section** | Dropdown sourced from `Database[Section]` |
| **Name** | Dropdown sourced from `Database[Full Name]` |
| **Status** | Dropdown: `Pending`, `Approved`, `Denied`, `Completed` |
| **All Emails** | Array formula output; aggregates emails matching the filters |

Results are rendered below the filter row via array formulas.

---

### 1.9 Dates *(Utility Tab)*

*Single-column tab populated entirely by an array formula. Provides the list of practice/event dates used by section tabs and the Search Attendance filter.*

---

## 2. Connected Google Forms

All three forms share a **section-router architecture**: Page 1 asks the member to pick their section, which navigates them to a section-specific page. Each section page always opens with two name fields before any form-specific questions:

* **`[Section Name] — Select Your Name`** *(Page Break — auto-generated title)*
* **Your Name** — `LIST` dropdown. Choices are the active members for that section, sourced from `Database[Full Name]` filtered by `Database[Section]` and `Database[Status] = Active`. Populated and kept in sync by `_getRosterData()` + `syncRosterToForms()` → `_syncFormSectionNameLists()`. Names are deduplicated and sorted alphabetically.
* **`[FORM_MANUAL_NAME_TITLE]`** *(manual fallback)* — `TEXT`. Optional. Accepts free text; validated by regex to enforce `Last, First` format. Used by `requireResolvedSubmittedName()` if the dropdown selection is absent.

Email collection is disabled on all forms (`setCollectEmail(false)`). Response limits are also disabled (`setLimitOneResponsePerUser(false)`).

---

### 2.1 KSUMB Pink Sheet — Excused Absence

*Built by `_buildPinkForm()` in `Feature_FormBuilder.js`.*

**Page 1**
* **`[FORM_SECTION_QUESTION_TITLE]`** — `MULTIPLE_CHOICE`. Choices = configured section tabs (`getConfiguredSectionTabs()`). Each choice routes to that section's page.

**Per-section page** *(one page per section tab)*
* **Your Name** — `LIST`. See shared name fields above.
* **`[FORM_MANUAL_NAME_TITLE]`** — `TEXT`. See shared name fields above.
* **Date of Absence** — `DATE`. Required.
* **Reason** — `PARAGRAPH`. Required.

---

### 2.2 KSUMB Late Check-In

*Built by `_buildLateForm()` in `Feature_FormBuilder.js`.*

No separate arrival time question exists — arrival time is derived from the form submission timestamp (`e.response.getTimestamp()`), recorded automatically by GAS in `onLateSubmit()`.

**Page 1**
* **`[FORM_SECTION_QUESTION_TITLE]`** — `MULTIPLE_CHOICE`. Choices = configured section tabs (`getConfiguredSectionTabs()`). Each choice routes to that section's page.

**Per-section page** *(one page per section tab)*
* **Your Name** — `LIST`. See shared name fields above.
* **`[FORM_MANUAL_NAME_TITLE]`** — `TEXT`. See shared name fields above.
* **Reason for late arrival** — `MULTIPLE_CHOICE`. Required. Choices sourced from `getConfiguredLateReasons()`.
* **If "Other", please explain:** — `TEXT`. Optional. Read by `onLateSubmit()` into the `Other Explanation` column.

---

### 2.3 KSUMB Yellow Sheet — Class Conflict

*Built by `_buildYellowForm()` in `Feature_FormBuilder.js`. Response editing is enabled (`setAllowResponseEdits(true)`).*

**Page 1**
* **`[FORM_SECTION_QUESTION_TITLE]`** — `MULTIPLE_CHOICE`. Choices = configured section tabs (`getConfiguredSectionTabs()`). Each choice routes to that section's page.

**Per-section page** *(one page per section tab)*
* **Your Name** — `LIST`. See shared name fields above.
* **`[FORM_MANUAL_NAME_TITLE]`** — `TEXT`. See shared name fields above.
* **Conflict Days** — `CHECKBOX`. Required. Choices hardcoded in `FORM_CONFIG.CONFLICT_DAYS`: `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday`, `Sunday`. Multi-select; joined to a comma-separated string on submission.
* **Conflict Start Time** — `TIME`. Required.
* **Conflict End Time** — `TIME`. Required.
* **Notes** — `PARAGRAPH`. Optional. Help text prompts: *"Include the class number and professor (e.g., 'MUSIC 285 — Dr. Smith')."*

---

## 3. Automation & Logic Notes

* **Matching:** Scripts should use `Full Name [Last, First]` as the primary lookup key when moving data from Forms to Section tabs.
* **Status lifecycle:** GAS sets `Processed At` after writing to section tabs, regardless of approval/denial. `Approved At` and `Denied At` are set at decision time.
* **Error column:** Present on Yellow Sheets, Pink Sheets, and Late Check-Ins. GAS writes failure details here if processing fails; column is blank on success.
* **Dates tab:** Fully formula-driven; do not manually edit. It feeds the `Search Attendance` date dropdown and column headers on section tabs.
