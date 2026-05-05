import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, expect, test } from '@jest/globals';

function loadLateCheckInLogic() {
  const filePath = path.resolve(process.cwd(), 'src', 'LateCheckInLogic.js');
  const source = readFileSync(filePath, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

// Minimal yellow-sheet row builder for findApprovedClassEndTime tests.
// Returns [fullName, section, conflictDays, endTime, status] in that index order.
function makeYsRow(headerMap, name, section, conflictDays, endTime, status) {
  const row = new Array(Object.keys(headerMap).length).fill('');
  row[headerMap.fullName] = name;
  row[headerMap.section] = section;
  row[headerMap.conflictDays] = conflictDays;
  row[headerMap.endTime] = endTime;
  row[headerMap.status] = status;
  return row;
}

function makeYsHeaderMap() {
  return { fullName: 0, section: 1, conflictDays: 2, endTime: 3, status: 4 };
}

describe('LateCheckInLogic', () => {
  test('parseLateThresholdMinutes falls back for invalid values', () => {
    const logic = loadLateCheckInLogic();

    expect(logic.parseLateThresholdMinutes('15', 5)).toBe(15);
    expect(logic.parseLateThresholdMinutes('-1', 5)).toBe(5);
    expect(logic.parseLateThresholdMinutes('abc', 5)).toBe(5);
  });

  test('determineLateAttendanceStatus returns Present inside threshold', () => {
    const logic = loadLateCheckInLogic();
    const rehearsal = new Date(2026, 3, 14, 15, 30, 0);
    const arrival = new Date(2026, 3, 14, 15, 40, 0);

    expect(
      logic.determineLateAttendanceStatus(arrival, rehearsal, 15, 'Present', 'Tardy')
    ).toBe('Present');
  });

  test('determineLateAttendanceStatus returns Tardy outside threshold', () => {
    const logic = loadLateCheckInLogic();
    const rehearsal = new Date(2026, 3, 14, 15, 30, 0);
    const arrival = new Date(2026, 3, 14, 15, 46, 0);

    expect(
      logic.determineLateAttendanceStatus(arrival, rehearsal, 15, 'Present', 'Tardy')
    ).toBe('Tardy');
  });

  test('canLateCheckInOverwriteAttendance allows standard attendance values', () => {
    const logic = loadLateCheckInLogic();
    const attendanceValues = {
      present: 'Present',
      tardy: 'Tardy',
      absent: 'Absent',
      excused: 'Excused',
    };

    expect(logic.canLateCheckInOverwriteAttendance('', attendanceValues)).toBe(true);
    expect(logic.canLateCheckInOverwriteAttendance('Absent', attendanceValues)).toBe(true);
    expect(logic.canLateCheckInOverwriteAttendance('Excused', attendanceValues)).toBe(true);
    expect(logic.canLateCheckInOverwriteAttendance('Locked', attendanceValues)).toBe(false);
  });

  test('isSameCalendarDate compares only the date portion', () => {
    const logic = loadLateCheckInLogic();
    const left = new Date(2026, 3, 14, 15, 30, 0);
    const right = new Date(2026, 3, 14, 20, 0, 0);
    const other = new Date(2026, 3, 15, 0, 0, 0);

    expect(logic.isSameCalendarDate(left, right)).toBe(true);
    expect(logic.isSameCalendarDate(left, other)).toBe(false);
  });

  test('buildLateCheckInNoteText includes details only when present', () => {
    const logic = loadLateCheckInLogic();

    expect(logic.buildLateCheckInNoteText('3:42 PM', 'Class', '')).toBe(
      'Late check-in: 3:42 PM\nReason: Class'
    );

    expect(logic.buildLateCheckInNoteText('3:42 PM', 'Other', 'Bus delay')).toBe(
      'Late check-in: 3:42 PM\nReason: Other\nDetails: Bus delay'
    );
  });

  test('conflictDaysIncludesDay matches full day names case-insensitively', () => {
    const logic = loadLateCheckInLogic();

    // Monday = jsDay 1
    expect(logic.conflictDaysIncludesDay('Monday, Wednesday, Friday', 1)).toBe(true);
    expect(logic.conflictDaysIncludesDay('monday, wednesday', 1)).toBe(true);
    expect(logic.conflictDaysIncludesDay('Tuesday, Thursday', 1)).toBe(false);
    expect(logic.conflictDaysIncludesDay('', 1)).toBe(false);
    // Sunday = jsDay 0
    expect(logic.conflictDaysIncludesDay('Sunday', 0)).toBe(true);
  });

  test('applyTimeToDate applies hours/minutes to the reference date', () => {
    const logic = loadLateCheckInLogic();

    const ref = new Date(2026, 3, 14, 15, 30, 0); // Tue Apr 14 15:30
    const timeSrc = new Date(1899, 11, 30, 16, 45, 0); // GAS epoch time = 4:45 PM
    const result = logic.applyTimeToDate(ref, timeSrc);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3);
    expect(result.getDate()).toBe(14);
    expect(result.getHours()).toBe(16);
    expect(result.getMinutes()).toBe(45);
    expect(result.getSeconds()).toBe(0);
  });

  test('findApprovedClassEndTime returns null when no approved row matches', () => {
    const logic = loadLateCheckInLogic();
    const hm = makeYsHeaderMap();
    const arrival = new Date(2026, 3, 14, 15, 30, 0); // Tuesday

    const allData = [
      ['fullName', 'section', 'conflictDays', 'endTime', 'status'],
      makeYsRow(hm, 'Smith, John', 'Trumpet', 'Monday, Wednesday', new Date(1899, 11, 30, 16, 0, 0), 'Approved'),
    ];

    expect(logic.findApprovedClassEndTime(allData, hm, 'Smith, John', 'Trumpet', arrival, 'Approved')).toBeNull();
  });

  test('findApprovedClassEndTime finds matching approved row', () => {
    const logic = loadLateCheckInLogic();
    const hm = makeYsHeaderMap();
    const arrival = new Date(2026, 3, 14, 15, 30, 0); // Tuesday = jsDay 2

    const endSrc = new Date(1899, 11, 30, 15, 45, 0); // 3:45 PM
    const allData = [
      ['fullName', 'section', 'conflictDays', 'endTime', 'status'],
      makeYsRow(hm, 'Smith, John', 'Trumpet', 'Tuesday, Thursday', endSrc, 'Approved'),
    ];

    const result = logic.findApprovedClassEndTime(allData, hm, 'Smith, John', 'Trumpet', arrival, 'Approved');
    expect(result).not.toBeNull();
    expect(result.getHours()).toBe(15);
    expect(result.getMinutes()).toBe(45);
    expect(result.getDate()).toBe(14); // projected onto arrival date
  });

  test('findApprovedClassEndTime returns the latest end time when multiple rows match', () => {
    const logic = loadLateCheckInLogic();
    const hm = makeYsHeaderMap();
    const arrival = new Date(2026, 3, 14, 15, 30, 0); // Tuesday

    const earlier = new Date(1899, 11, 30, 15, 30, 0); // 3:30 PM
    const later = new Date(1899, 11, 30, 16, 15, 0); // 4:15 PM
    const allData = [
      ['fullName', 'section', 'conflictDays', 'endTime', 'status'],
      makeYsRow(hm, 'Smith, John', 'Trumpet', 'Tuesday', earlier, 'Approved'),
      makeYsRow(hm, 'Smith, John', 'Trumpet', 'Tuesday', later, 'Approved'),
    ];

    const result = logic.findApprovedClassEndTime(allData, hm, 'Smith, John', 'Trumpet', arrival, 'Approved');
    expect(result.getHours()).toBe(16);
    expect(result.getMinutes()).toBe(15);
  });

  test('findApprovedClassEndTime ignores non-approved rows', () => {
    const logic = loadLateCheckInLogic();
    const hm = makeYsHeaderMap();
    const arrival = new Date(2026, 3, 14, 15, 30, 0); // Tuesday

    const allData = [
      ['fullName', 'section', 'conflictDays', 'endTime', 'status'],
      makeYsRow(hm, 'Smith, John', 'Trumpet', 'Tuesday', new Date(1899, 11, 30, 16, 0, 0), 'Pending'),
    ];

    expect(logic.findApprovedClassEndTime(allData, hm, 'Smith, John', 'Trumpet', arrival, 'Approved')).toBeNull();
  });

  test('computeYellowSheetTardyCutoff uses class end time in after_class_end mode', () => {
    const logic = loadLateCheckInLogic();
    const rehearsalStart = new Date(2026, 3, 14, 15, 30, 0);
    const classEnd = new Date(2026, 3, 14, 15, 50, 0);

    const cutoff = logic.computeYellowSheetTardyCutoff(rehearsalStart, classEnd, 'after_class_end', 10);
    // 3:50 + 10 min = 4:00 PM
    expect(cutoff.getHours()).toBe(16);
    expect(cutoff.getMinutes()).toBe(0);
  });

  test('computeYellowSheetTardyCutoff uses rehearsal start in after_rehearsal_start mode', () => {
    const logic = loadLateCheckInLogic();
    const rehearsalStart = new Date(2026, 3, 14, 15, 30, 0);
    const classEnd = new Date(2026, 3, 14, 15, 50, 0);

    const cutoff = logic.computeYellowSheetTardyCutoff(rehearsalStart, classEnd, 'after_rehearsal_start', 20);
    // 3:30 + 20 min = 3:50 PM
    expect(cutoff.getHours()).toBe(15);
    expect(cutoff.getMinutes()).toBe(50);
  });

  test('computeYellowSheetTardyCutoff falls back to rehearsal start when classEnd is null', () => {
    const logic = loadLateCheckInLogic();
    const rehearsalStart = new Date(2026, 3, 14, 15, 30, 0);

    const cutoff = logic.computeYellowSheetTardyCutoff(rehearsalStart, null, 'after_class_end', 15);
    // null classEnd → use rehearsal start: 3:30 + 15 = 3:45
    expect(cutoff.getHours()).toBe(15);
    expect(cutoff.getMinutes()).toBe(45);
  });
});
