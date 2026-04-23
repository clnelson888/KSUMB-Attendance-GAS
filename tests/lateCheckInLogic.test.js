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
});
