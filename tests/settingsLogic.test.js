import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, expect, test } from '@jest/globals';

function loadSettingsLogic() {
  const context = { console };
  vm.createContext(context);
  vm.runInContext(readFileSync(path.resolve(process.cwd(), 'src/Config.js'), 'utf8'), context, {
    filename: 'src/Config.js',
  });
  vm.runInContext(readFileSync(path.resolve(process.cwd(), 'src/SettingsLogic.js'), 'utf8'), context, {
    filename: 'src/SettingsLogic.js',
  });
  return context;
}

describe('SettingsLogic', () => {
  test('normalizes multiline list fields and trims scalar values', () => {
    const logic = loadSettingsLogic();

    const payload = logic.normalizeSettingsPayload({
      SECTION_TABS: ' Trumpet \nTuba\nTrumpet ',
      LATE_REASONS: 'Class, Parking / traffic',
      TIMEZONE: ' America/Chicago ',
      REHEARSAL_START_TIME: '15:30',
      LATE_THRESHOLD_MINUTES: 15,
      STATUS_PENDING: 'Pending',
      STATUS_APPROVED: 'Approved',
      STATUS_DENIED: 'Denied',
      STATUS_COMPLETE: 'Completed',
      ATTENDANCE_PRESENT: 'Present',
      ATTENDANCE_TARDY: 'Tardy',
      ATTENDANCE_ABSENT: 'Absent',
      ATTENDANCE_EXCUSED: 'Excused',
    });

    expect(payload.SECTION_TABS).toBe('Trumpet\nTuba');
    expect(payload.LATE_REASONS).toBe('Class\nParking / traffic');
    expect(payload.TIMEZONE).toBe('America/Chicago');
    expect(payload.LATE_THRESHOLD_MINUTES).toBe('15');
  });

  test('rejects invalid settings payloads', () => {
    const logic = loadSettingsLogic();

    const errors = logic.validateSettingsPayload({
      SECTION_TABS: '',
      TIMEZONE: '',
      REHEARSAL_START_TIME: '3:30 PM',
      LATE_THRESHOLD_MINUTES: 'fifteen',
      LATE_REASONS: '',
      STATUS_PENDING: '',
      STATUS_APPROVED: 'Approved',
      STATUS_DENIED: 'Denied',
      STATUS_COMPLETE: 'Completed',
      ATTENDANCE_PRESENT: 'Present',
      ATTENDANCE_TARDY: 'Tardy',
      ATTENDANCE_ABSENT: 'Absent',
      ATTENDANCE_EXCUSED: 'Excused',
    });

    expect(errors).toContain('At least one section is required.');
    expect(errors).toContain('Timezone is required.');
    expect(errors).toContain('Rehearsal start time must use HH:MM 24-hour format.');
    expect(errors).toContain('Late threshold minutes must be a whole number.');
    expect(errors).toContain('At least one late reason is required.');
    expect(errors).toContain('STATUS_PENDING cannot be blank.');
  });
});
