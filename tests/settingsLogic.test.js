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
    });

    expect(payload.SECTION_TABS).toBe('Trumpet\nTuba');
    expect(payload.LATE_REASONS).toBe('Class\nParking / traffic');
    expect(payload.TIMEZONE).toBe('America/Chicago');
    expect(payload.LATE_THRESHOLD_MINUTES).toBe('15');
  });

  test('omits keys absent from the raw payload so stored defaults are not overwritten', () => {
    const logic = loadSettingsLogic();

    const payload = logic.normalizeSettingsPayload({
      SECTION_TABS: 'Trumpet',
      TIMEZONE: 'America/Chicago',
      REHEARSAL_START_TIME: '15:30',
      LATE_THRESHOLD_MINUTES: 15,
      LATE_REASONS: 'Class',
      ROSTER_NOTE_COLUMNS: '',
    });

    expect(Object.prototype.hasOwnProperty.call(payload, 'STATUS_PENDING')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, 'ATTENDANCE_PRESENT')).toBe(false);
  });

  test('rejects invalid settings payloads', () => {
    const logic = loadSettingsLogic();

    const errors = logic.validateSettingsPayload({
      SECTION_TABS: '',
      TIMEZONE: '',
      REHEARSAL_START_TIME: '3:30 PM',
      LATE_THRESHOLD_MINUTES: 'fifteen',
      LATE_REASONS: '',
    });

    expect(errors).toContain('At least one section is required.');
    expect(errors).toContain('Timezone is required.');
    expect(errors).toContain('Rehearsal start time must use HH:MM 24-hour format.');
    expect(errors).toContain('Late threshold minutes must be a whole number.');
    expect(errors).toContain('At least one late reason is required.');
  });
});
