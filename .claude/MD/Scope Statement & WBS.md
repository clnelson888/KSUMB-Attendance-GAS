# Scope Statement & WBS

| Property | Value | Property | Value |
| :--- | :--- | :--- | :--- |
| **Scope Statement & WBS** | | **Date** | 4/22/2026 |
| **Reporting Period** | 4/6/2026 – 4/10/2026 | | |
| **Project Sponsor** | Dr. Alexander Wimmer | **Project Manager** | Cameron Nelson |
| **Project Start Date** | 1/27/2026 | **Project End Date** | 4/30/2026 |
| **Document Version** | 2.0 (GAS Pivot) | | |

## Part 1: Scope Statement

### Project Objectives Summary
The KSUMB Attendance System will replace the current manual, paper-based attendance workflow for the 400+ member Kansas State University Marching Band with an enhanced Google Sheets platform powered by Google Apps Script.
The project objectives, as established in the Project Charter, are:
* **Efficiency:** Reduce administrative overhead for KSUMB staff by automating attendance recording, exception handling, and concern reporting through Apps Script triggers and a custom spreadsheet menu.
* **Accuracy & Integrity:** Eliminate errors from manual data entry by using roster-driven form dropdowns, automated cell updates, and a centralized Database tab as the single source of truth.
* **Accountability:** Create a transparent, auditable digital record of attendance and approved exceptions through form submission logs with status tracking (Pending/Approved/Denied/Complete).
* **Integration:** Consolidate data silos (paper binders, standalone spreadsheets, paper forms) into a single Google Spreadsheet with role-appropriate access for Staff, Section Leaders, and Members.

### In-Scope Items
The following functional areas and deliverables are within the boundaries of this project:

**Core Spreadsheet Features**
* **DateAdd:** Staff add rehearsal dates via a custom menu dialog; columns are inserted chronologically with data validation and conditional formatting. Pending Pink Sheet and Late Check-In entries are processed automatically on date creation.
* **Late Check-In:** Google Form for members arriving late. Submissions are logged with a Pending/Complete status; triggers automatically update the student’s attendance cell based on a configurable tardy threshold.
* **Pink Sheet (Excused Absence):** Google Form for absence requests. Staff approve or deny via the log tab; approved entries mark the cell “Excused” with a timestamped note. Supports deferred processing when the date column doesn’t exist yet.
* **Yellow Sheet (Class Conflict):** Google Form for recurring class conflict declarations. Staff approve via the log tab; approved entries add a conflict-schedule note to the student’s name cell. Existing conditional formatting handles yellow highlighting.
* **Concern List:** A formula-driven tab with a date selector that populates a list of all students not marked “Present” for the selected rehearsal.

**Spreadsheet & Roster Management**
* **Roster Sync:** Manual menu action that reads the Database tab and updates section tabs (add/remove/move members) while preserving attendance data. Also refreshes all form dropdowns.
* **Delete Date:** Menu action to remove a specific date column from all section tabs with confirmation dialog.
* **Clear Attendance History:** Menu action to remove all date columns, resetting to roster-only state.
* **New Year Setup:** Menu action to clear attendance history, form logs, and Yellow Sheet notes for a new semester while preserving the Database tab.

**Access & Configuration**
* All staff actions accessible from a single custom spreadsheet menu.
* All configurable values (thresholds, status strings, colors) stored on the Data tab—no hardcoded values in scripts.
* Section Leaders have edit access to their section tab only; log and data tabs are hidden and restricted to the spreadsheet owner.
* Google Forms are open-link (no login required) for member accessibility.

**Non-Functional Scope**
* **Performance:** Handle 400+ simultaneous check-ins at peak time (~3:00–3:30 PM).
* **Offline Resilience:** Client-side check-in caching with automatic sync when connectivity resumes, preserving original timestamp and GPS.
* **Security:** K-State SSO/Active Directory for primary authentication; FERPA-compliant data handling; strict RBAC enforcement.
* **Mobile-First:** Responsive, lightweight web interface optimized for smartphone screens and variable outdoor connectivity.
* **Sustainability:** Hosted under K-State institutional ownership; no reliance on individual student accounts.

### Project Deliverables
The project will produce the following deliverables:

| # | Deliverable | Description |
| :--- | :--- | :--- |
| 1 | Requirements Document (v1.0) | Defines functional and non-functional requirements for the GAS-based system with acceptance criteria. |
| 2 | Scope Statement & WBS | This document. Defines project boundaries and work structure for the GAS pivot. |
| 3 | Project Schedule | Timeline with milestones, dependencies, and critical path. |
| 4 | Design Document | Architecture, data model, UI wireframes, and technology selection rationale. |
| 5 | Working Prototype / MVP | Functional Google Spreadsheet with all core features (DateAdd, Late Check-In, Pink Sheet, Yellow Sheet, Concern List, Roster Sync). |
| 6 | Test Plan & Results | Test strategy, cases, and documented results including UAT with band staff. |
| 7 | Mid-Term Report | Progress report for sponsor and professor. Due 3/9–3/12. |
| 8 | Handover Package | Apps Script source code, configuration guide, admin manual, and operational documentation for future band staff. |
| 9 | Final Report & Presentation | Comprehensive project report and client presentation (4/29–5/8). |

### Out of Scope
The following items are explicitly excluded from this project phase. Any request to include them constitutes a scope change and must go through change control.
* Geofencing or GPS-verified check-in.
* Mobile app or custom web interface (all member interaction is via Google Forms).
* SSO / K-State Active Directory integration.
* Kiosk hardware or standalone kiosk mode.
* Automated grade calculation or grade display.
* Integration with KSIS for automatic roster importing.
* Pep-band sign-up system.
* Functionality for other K-State band programs (Wind Symphony, Concert Band, etc.).
* Calendar view for events.
* Automated email/notification delivery of the Concern List.
* Multi-date batch entry for DateAdd (deferred to future enhancement).
* Automatic section tab creation on Roster Sync (deferred; FR-603 = Won’t).

### High-Level Acceptance Criteria
The project will be considered successfully delivered when the following conditions are met:

| # | Criterion | Verified By |
| :--- | :--- | :--- |
| AC-1 | Staff can add a rehearsal date via the custom menu; the column is inserted chronologically with correct validation and formatting. Pending Pink Sheet and Late Check-In entries are processed automatically. | Sponsor UAT / Field Test |
| AC-2 | Section Leaders can record attendance via dropdown selection on their section tab and view their section’s roster and history. | Sponsor UAT |
| AC-3 | Staff can approve/deny Pink and Yellow Sheets in the log tabs, and approved exceptions automatically update attendance cells and/or name cell notes. | Sponsor UAT / Test Cases |
| AC-4 | Late Check-In form submissions automatically update the correct attendance cell using the configurable tardy threshold, with Pending/Complete status tracking. | Sponsor Demo |
| AC-5 | The Concern List tab dynamically displays all non-Present students for a selected date using formulas only. | Load Test |
| AC-6 | Roster Sync correctly adds, removes, and moves members across section tabs while preserving attendance data and refreshing form dropdowns. | Security Review / Test |
| AC-7 | Data access is restricted by role: Section Leaders see only their tab; log tabs are hidden; Forms require no login. FERPA compliance is maintained (no reasons in cell notes). | Sponsor Sign-Off |
| AC-8 | Handover documentation is sufficient for future band staff to maintain and operate the system without developer assistance. | Sponsor Sign-Off |

### Key Constraints & Assumptions
**Constraints**
* **Timeline:** Project must be completed by April 30, 2026. Final presentation window is 4/29–5/8.
* **Team Size:** Single-person project team (Cameron Nelson) with limited development hours per week alongside coursework.
* **FERPA:** All student data handling must comply with FERPA and K-State data privacy policies. Pink Sheet reasons must not appear in cell notes.
* **Platform:** The system must run entirely within Google Workspace (Sheets, Forms, Apps Script) with zero external hosting costs.
* **Connectivity:** Google Forms require internet access. No offline capability is provided.
* **Budget:** Zero ongoing operational cost; the system uses only free Google Workspace tools.

**Assumptions**
* All band members have access to a smartphone or shared device with internet access at the practice field.
* Google Workspace accounts will remain available and supported.
* The existing onboarding Google Form or FileMaker Pro export provides roster data in a format that can be pasted into the Database tab.
* Wi-Fi or cellular coverage at Memorial Stadium and the practice field is sufficient for Google Form submissions.
* Section Leaders are trusted with edit access to their section tab and trained on how to record attendance.
* Staff will manually run Roster Sync when roster changes occur.
* Dr. Wimmer and Sharyn Worcester are available for requirement validation, feedback, and UAT sessions.
* Google Apps Script execution quotas are sufficient for 400+ member operations.

## Part 2: Work Breakdown Structure
The WBS below decomposes the project into phases, deliverables, and work packages.
It is structured by project phase (not chronological sequence—sequencing is handled in the project schedule).
Each work package traces back to requirements from the Requirements Document.

### Phase 1: Project Initiation & Planning

| WBS ID | Work Package | Deliverables | Req Trace |
| :--- | :--- | :--- | :--- |
| 4.1 | Test plan development (unit, integration, UAT) | Test plan document | All FR & NFR |
| 4.2 | Unit & integration testing | Test results / defect log | All FR & NFR |
| 4.3 | Load / performance testing (400+ concurrent check-ins) | Load test results | NFR-01, NFR-02 |
| 4.4 | Security & RBAC testing | Security test results | NFR-05–08 |
| 4.5 | Field testing (outdoor GPS, connectivity) | Field test report | FR-101, NFR-02, NFR-03 |
| 4.6 | User acceptance testing with band staff & section leaders | UAT sign-off / feedback log | AC-1 through AC-7 |
| 4.7 | Defect resolution & regression testing | Updated defect log, clean test run | All |

### Phase 2: Design

| WBS ID | Work Package | Deliverables | Req Trace |
| :--- | :--- | :--- | :--- |
| 2.1 | Technology evaluation & selection (React/Next.js, hosting, DB) | Technology selection rationale document | NFR-12, NFR-14, Tech Constraints |
| 2.2 | System architecture design (frontend, backend, DB, auth) | Architecture diagram & design document | NFR-01, NFR-05, NFR-12 |
| 2.3 | Data model design (students, events, attendance, exceptions) | ERD / schema documentation | FR-107, FR-304, FR-502 |
| 2.4 | UI/UX wireframes & user flow diagrams | Wireframe set for all role views | FR-401–405, NFR-09–11 |
| 2.5 | SSO integration research & K-State IT coordination | SSO integration plan / findings | NFR-05, NFR-06 |
| 2.6 | Geofencing & location strategy design | Location management design spec | FR-101–104 |

### Phase 3: Development

| WBS ID | Work Package | Deliverables | Req Trace |
| :--- | :--- | :--- | :--- |
| 3.1 | Project scaffolding & CI/CD setup | Repository, build pipeline, dev/staging environments | NFR-12 |
| 3.2 | Database setup & schema implementation | Running database with seed data | 2.3 → FR-107, FR-502 |
| 3.3 | Authentication module (SSO + kiosk fallback) | Working login for all auth paths | NFR-05, NFR-06, FR-106 |
| 3.4 | Check-in engine (GPS geofence, timestamp, data capture) | Self-check-in feature | FR-101, FR-102, FR-107, FR-108 |
| 3.5 | Location management (pre-defined, custom pin, section pre-check-in) | Location configuration UI & backend | FR-102, FR-103, FR-104 |
| 3.6 | Tardy threshold engine (role-based, additive modifiers, per-event override) | Tardy calculation logic & admin settings | FR-201–204 |
| 3.7 | Pink Sheet workflow (submission, 24-hr warning, late flag, staff approval) | Pink Sheet feature end-to-end | FR-301–303 |
| 3.8 | Yellow Sheet workflow (semester submission, staff verification, auto-apply) | Yellow Sheet feature end-to-end | FR-304–306 |
| 3.9 | Section leader manual check-in | Manual check-in feature on section roster | FR-105 |
| 3.10 | Staff dashboard (real-time overview, drill-down, exception queue) | Staff dashboard UI & data layer | FR-401, FR-402 |
| 3.11 | Section leader view (roster, photos, status, exception info toggle) | Section leader view UI | FR-403, FR-404 |
| 3.12 | Member view (self-check-in, personal history) | Member view UI | FR-405, FR-406 |
| 3.13 | Kiosk mode (ID scan / manual login interface) | Kiosk check-in UI | FR-106, NFR-06 |
| 3.14 | Event management (CRUD, location, threshold overrides) | Event management admin UI | FR-501 |
| 3.15 | Roster import & user management | Bulk import tool & user admin UI | FR-502, FR-503, FR-504 |
| 3.16 | Reporting & export (CSV/Excel, filters) | Export feature | FR-407 |
| 3.17 | Daily Consolidated Concern Report (automated) | Scheduled report generation | FR-408 |
| 3.18 | Notification system (exception status, late submission alerts) | Notification service | FR-301 note, new reqs |
| 3.19 | Audit logging (immutable event trail) | Audit log module | New req (audit) |
| 3.20 | Offline check-in caching & sync | PWA/service worker cache logic | FR-108, NFR-03 |
| 3.21 | Geofence radius configurability & GPS error handling | Configurable geofence settings | FR-102, NFR-04 |

### Phase 4: Testing & Validation

| WBS ID | Work Package | Deliverables | Req Trace |
| :--- | :--- | :--- | :--- |
| 4.1 | Test plan development (unit, integration, UAT) | Test plan document | All FR & NFR |
| 4.2 | Unit & integration testing | Test results / defect log | All FR & NFR |
| 4.3 | Load / performance testing (400+ concurrent check-ins) | Load test results | NFR-01, NFR-02 |
| 4.4 | Security & RBAC testing | Security test results | NFR-05–08 |
| 4.5 | Field testing (outdoor GPS, connectivity) | Field test report | FR-101, NFR-02, NFR-03 |
| 4.6 | User acceptance testing with band staff & section leaders | UAT sign-off / feedback log | AC-1 through AC-7 |
| 4.7 | Defect resolution & regression testing | Updated defect log, clean test run | All |

### Phase 5: Deployment & Handover

| WBS ID | Work Package | Deliverables | Req Trace |
| :--- | :--- | :--- | :--- |
| 5.1 | Production environment setup (hosting, domain, SSL) | Running production environment | NFR-12, NFR-13 |
| 5.2 | Data migration (roster import, initial configuration) | Populated production database | FR-502 |
| 5.3 | Deployment & smoke testing | Deployed application, smoke test results | All |
| 5.4 | Admin & operational documentation | Admin manual, deployment guide | NFR-13 |
| 5.5 | Staff & section leader training / walkthrough | Training session, user guide | NFR-13 |
| 5.6 | Formal handover to K-State IT / band staff | Signed handover checklist | NFR-12, NFR-13, AC-7 |

### Phase 6: Project Management & Course Deliverables

| WBS ID | Work Package | Deliverables | Req Trace |
| :--- | :--- | :--- | :--- |
| 6.1 | Weekly status reports & sponsor communication | Status reports (ongoing) | MIS 677 / Charter |
| 6.2 | Risk & issue tracking (ongoing) | Updated risk register | Risk Plan |
| 6.3 | In-class Presentation #2 (progress update w/ Gantt) | Slide deck | MIS 677 (Week 7: 3/3–3/5) |
| 6.4 | Mid-term report | Mid-term report document | MIS 677 (Week 8: due 3/9–3/12) |
| 6.5 | In-class Presentation #3 (progress w/ Gantt update) | Slide deck | MIS 677 (Week 10: 3/26) |
| 6.6 | Practice presentations | Practice run slides | MIS 677 (Weeks 14–15) |
| 6.7 | Final client presentation (4/29–5/8) | Final presentation materials | MIS 677 (Weeks 15–16) |
| 6.8 | Final project report & reflective report | Final report, reflective report | MIS 677 (Week 17: due 5/12) |
| 6.9 | Peer evaluation | Submitted peer eval | MIS 677 (Week 17) |

### WBS Summary
The WBS contains 6 phases and 56 work packages:

| Phase | Work Packages | Deliverables |
| :--- | :--- | :--- |
| 1. Initiation & Planning | 7 | 7 |
| 2. Design | 6 | 6 |
| 3. Development | 21 | 21 |
| 4. Testing & Validation | 7 | 7 |
| 5. Deployment & Handover | 6 | 6 |
| 6. Project Management & Course Deliverables | 9 | 9 |
| **TOTAL** | **56** | **56** |