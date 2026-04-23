## Bugs & Fixes

- **Denied Pink Sheets Do Not Mark Students Absent**
  - **Where:** Pink Sheet workflow → Attendance / Section tabs → Concern List.
  - **Issue:** When a Pink Sheet is denied, the automation currently:
    - Removes the excused status.
    - Effectively “deletes” the excused handling, but does **not** explicitly mark the student as **Absent** in the attendance table.
  - **How Wimmer Wants It Resolved:**
    - When a Pink Sheet is **denied**, automatically:
      - Mark that student as **Absent** for the relevant date in their section tab.
      - Ensure they appear in the **Concern List** as absent for that date.

- **Yellow Sheet Entries Are Being Overwritten Instead of Appended**
  - **Where:** Yellow Sheet Form responses → Yellow Sheet response sheet → subsequent automation into section tabs.
  - **Issue:** Multiple Yellow Sheet submissions by the same student for different conflicts are currently **overwriting** previous entries (based on name/section key), so the historical trail of multiple Yellow Sheets is lost.
  - **How Wimmer Wants It Resolved:**
    - Do **not** overwrite prior Yellow Sheet entries when a student submits multiple forms.
    - Each submission should be stored as a separate record (separate row) so staff can see the full history of all Yellow Sheets for that student.
    - When a student has more than one active Yellow Sheet:
      - The system should **recognize there are multiple conflicts** for that student.
      - Any **notes or annotations added to section attendance tabs** should be **appended** so that _all_ relevant conflicts are represented (e.g., a combined note listing both conflict windows), not replaced by only the latest one.

- **Conditional Highlighting Without Supporting Data After Denial**
  - **Where:** Section attendance tabs (e.g., clarinet, piccolo, tuba) – cell highlighting that indicates Yellow/Pink Sheet status.
  - **Current Implementation Detail:** This highlighting is currently done using **built-in Google Sheets conditional formatting**, **not** via Apps Script.
  - **Issue:** After certain denial flows (e.g., a Yellow Sheet or Pink Sheet is denied and the related note cleared), conditional formatting can still highlight the cell as if a sheet is active, but the actual detailed note/data is missing.
  - **How Wimmer Wants It Resolved:**
    - Ensure that when an item is **denied**, both:
      - The highlight state is updated consistently (e.g., no highlight if there is no active excuse), and
      - The underlying note or marker used for conditional formatting is synchronized so there are no “ghost highlight with no data” states.
    - **Implementation Preference:**
      - If possible, keep this behavior driven by a **regular formula and conditional formatting rules**, rather than Apps Script.
      - Apps Script changes should assume conditional formatting is the primary mechanism and avoid breaking that model; formula-based fixes are preferred but not mandatory for the Apps Script developer.

- **Pink Sheet Approval Not Immediately Reflected as ‘Excused’ in Attendance**
  - **Where:** Pink Sheet approval workflow → Section tabs → Concern List.
  - **Issue:** During the demo, a Pink Sheet approval did not immediately show the student as **Excused** on the section attendance sheet / Concern List until additional steps or date handling were performed.
  - **How Wimmer Wants It Resolved:**
    - When a Pink Sheet is **approved**, the corresponding attendance cell for that date should:
      - Clearly mark the student as **Excused**.
      - Be reflected correctly in the Concern List logic (i.e., excused vs. absent/tardy).
    - This should work even when the Pink Sheet is submitted for a **future date** that has not yet been added as a rehearsal date; once the date is added, the excused status should automatically “snap into place.”

- **Unit-Test and Stabilize Edge-Case Behaviors**
  - **Where:** All workflows: Pink Sheets, Yellow Sheets, Late Check-Ins, Concern List, approval/denial toggling.
  - **Issue:** Cameron notes he has not finished comprehensive unit testing for all edge cases (approve → deny → re-approve, multiple submissions, future dates, etc.). Demo surfaced inconsistent or surprising behavior (e.g., excused not appearing until after certain actions).
  - **How Wimmer Wants It Resolved:**
    - Systematically test and fix logic for:
      - Approve → Deny → Approve sequences for both Pink and Yellow Sheets.
      - Multiple submissions from the same user (especially Yellow Sheets).
      - Pink Sheets and Yellow Sheets tied to dates that are added after the form submission.
    - Ensure the user-facing result always matches Wimmer’s expectations:
      - Clear excused/absent/tardy status.
      - Correct inclusion/exclusion from Concern List.
      - No silent overwrites of important historical data.

---

## Structural / Workflow Changes

- **Yellow Sheet: Preserve Full History & Manage “Current” View Separately**
  - **Where:** Yellow Sheet response sheet and any logic that aggregates Yellow Sheets into section tabs / summaries.
  - **Requested Change:**
    - Store **every** Yellow Sheet submission as its own row (no overwrite by default).
    - Provide a way for staff to see:
      - The **full history** of all Yellow Sheets for a student (log level).
      - Optionally, a “current active conflicts” view if needed, but that should not delete historical entries.
    - When generating notes or status annotations in the **section attendance tabs**:
      - If a student has **more than one Yellow Sheet**, the system should:
        - Detect that **multiple conflicts exist**.
        - **Append** information for each conflict into the note / annotation, so all relevant conflicts are visible to staff (e.g., two conflict windows in one combined note), instead of overwriting prior conflict details.

- **Unified Search/Report Sheet for Yellow Sheets, Pink Sheets, and Late Check-Ins**
  - **Where:** A single search/report tab (new sheet) in the workbook.
  - **Requested Change:**
    - Create **one consolidated “Search/Reports” sheet** with:
      - A selector (e.g., dropdown or validation cell) to choose **which workflow** to search:
        - `Yellow Sheets`
        - `Pink Sheets`
        - `Late Check-Ins`
      - Additional filters similar to the Concern List paradigm:
        - **Status** (e.g., Pending, Approved, Denied, Completed – where applicable).
        - **Date** (at minimum a specific date; extended range optional).
        - Optionally: **Student** and **Section** filters.
    - Based on the selected workflow type and filters, the sheet should query the appropriate underlying data (Yellow Sheet log, Pink Sheet log, Late Check-In log) and display a structured table of matching records.
  - **Rationale per Wimmer:**
    - Wants a single place to “search the system” and then choose which dataset (Yellow, Pink, Late) he’s looking at, rather than three separate report sheets.

- **Integrate Email (and Possibly Phone) Into Roster and Propagate Where Needed**
  - **Where:** Database tab (primary roster), section tabs, Concern List, and the unified Search/Reports sheet.
  - **Requested Change:**
    - Add **email** (and optionally phone) fields to the **Database** (roster) tab.
    - Ensure these fields:
      - Are propagated to section-specific roster views (so section leaders can quickly contact members).
      - Are **included** in:
        - The **Concern List** output.
        - The unified **Search/Reports** sheet (for all three workflows).
      - Joining should use a stable key (e.g., last name + first name + section, or a unique roster ID if present).
  - **Rationale per Wimmer:**
    - Wants to avoid manually looking up each address in another system.
    - Needs to easily copy/paste email lists for targeted outreach (“you were not present; you need to address this immediately”).

- **Concern List Should Include Email Column**
  - **Where:** Concern List tab.
  - **Requested Change:**
    - Extend the Concern List query logic to pull **email** from the Database tab (using name + section key or equivalent).
    - Display a single **email column** for each row.
  - **Rationale per Wimmer:** Primary workflow is to email all students that appear on the Concern List; he wants to be able to copy the email column directly without additional lookup.

- **Allow Safe Editing of Form Descriptions & Confirmation Messages**
  - **Where:** Google Forms for Yellow Sheets, Pink Sheets, and Late Check-Ins.
  - **Requested Change:**
    - Confirm and maintain a structure where:
      - **Descriptions / informational text / confirmation messages** (e.g., “Thank you for completing this form, someone will reach out within 24 hours…”) can be edited by staff without breaking anything.
      - **Question titles / keys** that the script relies on **must not change**.
    - Clearly document which form elements are **safe to edit** vs. **must remain untouched**.
  - **Rationale per Wimmer:**
    - He wants flexibility to tweak user-facing copy for clarity and expectations without risking breakage of the automation.

- **Treat Denied/Deleted Entries Safely in Concern List & Attendance**
  - **Where:** Concern List formulas, conditional formatting in section tabs, and approval/denial handlers.
  - **Requested Change:**
    - Align deletion/denial semantics so that:
      - Denying an excuse (Pink or Yellow) always leads to a **clear, explicit** attendance status (typically Absent) and consistent Concern List entry.
      - If staff later decide to **manually delete duplicates**, there is a recommended **workflow** (e.g., mark as Denied first, then delete) that:
        - Preserves attendance accuracy.
        - Keeps notes/formatting in sync with the true state.
  - **Rationale per Wimmer:** Avoid silently losing meaningful status or leaving inconsistent UI states.

- **Future-Proofing: Clear Maintenance Workflow**
  - **Where:** Developer workflow (VS Code + GitHub + AI agent), not strictly in-sheets, but impacts long-term behavior.
  - **Requested Change (process-oriented):**
    - Ensure that any future maintenance steps (e.g., updating scripts when Google changes APIs) are clearly encoded in:
      - The README.
      - The GitHub repo.
      - The in-project “AI agent” prompts/workflow.
    - So internal or student developers can reliably regenerate or repair code as platforms evolve.
  - **Rationale per Wimmer:**
    - He previously lost functionality on a Power Tools-based solution when the underlying add-on disappeared.
    - He wants confidence that the KSUMB Attendance System remains maintainable despite platform changes.

---

## New Features

- **Email-Ready Output for Absentees/Tardies from Concern List**
  - **Where:** Concern List tab.
  - **New Capability:**
    - Once email addresses are wired in (see Structural Changes), ensure the Concern List is optimized for **copy-paste email workflows**:
      - A dedicated **email column** usable directly in Gmail/Outlook.
      - (Optional) A helper cell that constructs a **comma- or semicolon-separated list** of the currently filtered concern-list emails for quick bulk sending, if this does not significantly complicate formulas.
  - **How Wimmer Intends to Use It:**
    - Select the list of absent/tardy students (from Concern List), copy the email column, paste into an email, and send a standard “you were not present; you need to address this immediately” message.

- **Per-Student Contact “Note” in Section Tabs**
  - **Where:** Section attendance tabs (piccolo, clarinet, tuba, etc.).
  - **New Capability:**
    - When syncing roster from the Database tab:
      - Optionally insert a **note or dedicated columns** per student row that include key contact info (e.g., email, phone).
    - This could be:
      - A hover note on the name cell, or
      - Visible columns (e.g., Email, Phone) alongside section & instrument.
  - **How Wimmer Intends to Use It:**
    - Section leaders and staff can quickly see how to contact a student without switching systems.

- **Unified Search/Reports with Workflow Selector**
  - **Where:** The single Search/Reports sheet described above.
  - **New Capability:**
    - Provide a **workflow selector** (Yellow/Pink/Late) and associated filters that will:
      - Query the relevant underlying dataset.
      - Display a list including:
        - Student name.
        - Section.
        - Date(s).
        - Status (Pending/Approved/Denied/Completed where applicable).
        - Reason / notes.
        - Email (and phone, if available).
  - **How Wimmer Intends to Use It:**
    - To audit histories for individual students.
    - To generate reports for patterns (e.g., repeated tardiness, repeated Yellow Sheet usage) without having to navigate separate sheets.

- **Yellow-Sheet-Aware Late Check-In Threshold (Potential Extension)**
  - **Where:** Settings panel controlling late check-in threshold logic.
  - **New Capability (discussed as an enhancement; Wimmer seemed interested):**
    - Distinguish between:
      - **Normal students** – tardy threshold relative to **rehearsal start time**.
      - **Yellow sheet students** – tardy threshold relative to **class end time** captured in Yellow Sheet.
    - Allow separate configuration:
      - `normalLateThresholdMinutes` (e.g., 30 minutes after rehearsal start).
      - `yellowSheetLateThresholdMinutes` (relative to class end).
  - **How Wimmer Intends to Use It:**
    - To handle class-conflict students fairly: they shouldn’t be penalized as tardy if they arrive within a reasonable window after their academic class ends, even if that is technically after rehearsal start.

- **Yellow/Pink/Late “Audit Log” Views**
  - **Where:** Within or alongside the unified Search/Reports sheet (or dedicated “Log” subviews).
  - **New Capability:**
    - Provide log-style views that list:
      - Every state transition (Pending → Approved, Pending → Denied, etc.).
      - Timestamps for:
        - Submission.
        - Approval.
        - Denial.
        - Completion/processing.
    - Some of this is already partially exposed (e.g., “submitted at” and “approved at” timestamps), but Wimmer’s desire for a complete “paper trail” suggests:
      - A consolidated **log view** for each workflow (Yellow, Pink, Late) accessible via the unified Search/Reports interface.
  - **How Wimmer Intends to Use It:**
    - As a clear audit record when questions arise (e.g., “When was this excused?” “Who denied this and when?”).

- **User Documentation & Training Artifacts**
  - **Where:** GitHub repo + external artifacts (PDF/Doc/video).
  - **New Capability:**
    - Provide:
      - A comprehensive **written manual** (already started in README).
      - A **video walkthrough** explaining:
        - Initial semester setup (“New Year Setup” → Initialize).
        - Day-to-day staff usage (recording attendance, approving/denying sheets, running Concern List, etc.).
        - Section leader workflows.
        - How to import/update roster data in the Database tab.
        - How to use VS Code + GitHub + AI agent for maintenance.
  - **How Wimmer Intends to Use It:**
    - To onboard grad assistants (GAs) and future staff.
    - To ensure the system survives turnover and can be run “in house” from the band office Windows machine.
