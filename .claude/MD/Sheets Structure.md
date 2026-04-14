\# KSUMB Attendance System Structure



This document outlines the architecture of the KSUMB Attendance Spreadsheet and its connected Google Forms to assist in Google Apps Script (GAS) development and data mapping.



\---



\## 1. Spreadsheet Tabs \& Tables

All tables are named to match their respective tab names.



\### 1.1 Database

\*Source of truth for all ensemble members.\*



| Header | Data Type | Notes |

| :--- | :--- | :--- |

| \*\*Last Name\*\* | String | |

| \*\*First Name\*\* | String | |

| \*\*Full Name\*\* | String | Format: `\[Last, First]` |

| \*\*Section\*\* | String | e.g., Tuba, Piccolo |

| \*\*Instrument\*\* | String | |

| \*\*Email\*\* | String | |

| \*\*Phone Number\*\* | String | |

| \*\*Active\*\* | Boolean | TRUE / FALSE |



\### 1.2 Data

\*Configuration values, Form IDs, and Named Ranges for dropdowns.\*



| Header | Data Type | Notes |

| :--- | :--- | :--- |

| \*\*Key\*\* | String | e.g., `YELLOW\_FORM\_ID`, `REHEARSAL\_START\_TIME` |

| \*\*Value\*\* | Mixed | e.g., `15:15`, `45` (Threshold) |

| \*\*Ensembles\*\* | Range | List for Form/Sheet validation |

| \*\*Sections\*\* | Range | List for Form/Sheet validation |



\### 1.3 Yellow Sheets

\*Class Conflict requests (recurring schedule issues).\*



| Header | Data Type | Notes |

| :--- | :--- | :--- |

| \*\*Full Name\*\* | String | Format: `\[Last, First]` |

| \*\*Ensemble\*\* | String | Dropdown from `Data!Ensembles` |

| \*\*Section\*\* | String | Dropdown from `Data!Sections` |

| \*\*Conflict Days\*\* | String | e.g., Monday, Tuesday, Wednesday |

| \*\*Start Time\*\* | Time | e.g., 2:30:00 PM |

| \*\*End Time\*\* | Time | e.g., 3:45:00 PM |

| \*\*Status\*\* | String | Pending, Approved, Denied |

| \*\*Notes\*\* | String | |



\### 1.4 Pink Sheets

\*Excused Absence requests (single instances).\*



| Header | Data Type | Notes |

| :--- | :--- | :--- |

| \*\*Full Name\*\* | String | Format: `\[Last, First]` |

| \*\*Ensemble\*\* | String | Dropdown from `Data!Ensembles` |

| \*\*Section\*\* | String | Dropdown from `Data!Sections` |

| \*\*Date\*\* | Date | Type: Date |

| \*\*Reason\*\* | String | |



\### 1.5 Late Check-Ins

\*Logs for late arrivals.\*



| Header | Data Type | Notes |

| :--- | :--- | :--- |

| \*\*Full Name\*\* | String | Format: `\[Last, First]` |

| \*\*Section\*\* | String | Dropdown from `Data!Sections` |

| \*\*Arrival Time\*\* | Time | e.g., 6:19:00 PM |

| \*\*Reason\*\* | String | |



\### 1.6 Section Tabs

\*Includes: Piccolo, Clarinet, Alto Sax, Tenor Sax, Trumpet, Horn, Trombone, Baritone, Tuba, Percussion, Classy Cats, Color Guard, Twirlers, Drum Majors, Student Staff.\*



| Header | Data Type | Notes |

| :--- | :--- | :--- |

| \*\*Name\*\* | String | Format: `\[Last, First]` |

| \*\*\[Dates]\*\* | String | Column Header Ex: `3/30 3:30 PM` |



\---



\## 2. Connected Google Forms



\### 2.1 KSUMB Yellow Sheet — Class Conflict

\* \*\*Email\*\*

\* \*\*Your Full Name\*\* (Dropdown)

\* \*\*Ensemble\*\*

\* \*\*Your Section\*\* (Dropdown)

\* \*\*Conflict Days\*\*

\* \*\*Conflict Start Time\*\*

\* \*\*Conflict End Time\*\*

\* \*\*Notes\*\*



\### 2.2 KSUMB Pink Sheet — Excused Absence

\* \*\*Email\*\*

\* \*\*Your Full Name\*\*

\* \*\*Ensemble\*\*

\* \*\*Your Section\*\*

\* \*\*Date of Absence\*\* (Date)

\* \*\*Reason\*\*



\### 2.3 KSUMB Late Check-In

\* \*\*What is your section?\*\*

\* \*\*Your Name\*\*

\* \*\*Reason for late arrival\*\*

&#x20;   \* Class

&#x20;   \* Traffic / Parking

&#x20;   \* Work

&#x20;   \* Other (explain below)

\* \*\*If "Other", please explain:\*\*



\---



\## 3. Automation \& Logic Notes

\* \*\*Matching:\*\* Scripts should use `Full Name \[Last, First]` as the primary lookup key when moving data from Forms to Section tabs.

