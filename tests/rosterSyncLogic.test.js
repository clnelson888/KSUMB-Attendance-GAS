import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, expect, test } from '@jest/globals';

function loadRosterSyncLogic() {
  const filePath = path.resolve(process.cwd(), 'src', 'RosterSyncLogic.js');
  const source = readFileSync(filePath, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

const SEPARATOR = '--- Roster Info ---';

describe('RosterSyncLogic', () => {
  test('isRosterMemberActive recognizes common truthy values', () => {
    const logic = loadRosterSyncLogic();

    expect(logic.isRosterMemberActive(true)).toBe(true);
    expect(logic.isRosterMemberActive('TRUE')).toBe(true);
    expect(logic.isRosterMemberActive('yes')).toBe(true);
    expect(logic.isRosterMemberActive(false)).toBe(false);
    expect(logic.isRosterMemberActive('')).toBe(false);
  });

  test('groupActiveRosterMembersBySection filters inactive rows and sorts names', () => {
    const logic = loadRosterSyncLogic();

    expect(
      logic.groupActiveRosterMembersBySection([
        { fullName: 'Zulu, Zoey', section: 'Trumpet', active: true },
        { fullName: 'Alpha, Ana', section: 'Trumpet', active: 'TRUE' },
        { fullName: 'Inactive, Ian', section: 'Trumpet', active: false },
        { fullName: 'Bravo, Ben', section: 'Tuba', active: 'yes' },
      ])
    ).toEqual({
      Trumpet: ['Alpha, Ana', 'Zulu, Zoey'],
      Tuba: ['Bravo, Ben'],
    });
  });

  test('buildRosterContactNote returns only configured columns with values', () => {
    const logic = loadRosterSyncLogic();

    const rowData = { 'Full Name': 'Smith, John', Email: 'john@example.com', 'Phone Number': '(785) 555-1234', Section: 'Trumpet' };

    expect(logic.buildRosterContactNote(rowData, ['Email', 'Phone Number'])).toBe(
      'Email: john@example.com\nPhone Number: (785) 555-1234'
    );
    expect(logic.buildRosterContactNote(rowData, ['Email'])).toBe('Email: john@example.com');
    expect(logic.buildRosterContactNote(rowData, [])).toBe('');
    expect(logic.buildRosterContactNote(rowData, ['Missing Column'])).toBe('');
  });

  test('buildRosterContactNote omits blank values', () => {
    const logic = loadRosterSyncLogic();

    const rowData = { Email: 'john@example.com', 'Phone Number': '' };
    expect(logic.buildRosterContactNote(rowData, ['Email', 'Phone Number'])).toBe('Email: john@example.com');
  });

  test('splitNoteAtRosterSeparator splits on the separator line', () => {
    const logic = loadRosterSyncLogic();

    const combined = `Class conflict: Mon/Wed 1:00 PM-2:30 PM\n${SEPARATOR}\nEmail: john@example.com`;
    expect(logic.splitNoteAtRosterSeparator(combined)).toEqual({
      yellowSheetPart: 'Class conflict: Mon/Wed 1:00 PM-2:30 PM',
      contactPart: 'Email: john@example.com',
    });
  });

  test('splitNoteAtRosterSeparator returns whole text as yellowSheetPart when no separator', () => {
    const logic = loadRosterSyncLogic();

    expect(logic.splitNoteAtRosterSeparator('Class conflict: Mon 2:00 PM-3:00 PM')).toEqual({
      yellowSheetPart: 'Class conflict: Mon 2:00 PM-3:00 PM',
      contactPart: '',
    });
    expect(logic.splitNoteAtRosterSeparator('')).toEqual({ yellowSheetPart: '', contactPart: '' });
  });

  test('buildCombinedMemberNote assembles both parts with the separator', () => {
    const logic = loadRosterSyncLogic();

    expect(logic.buildCombinedMemberNote('Class conflict: Mon 2:00 PM-3:00 PM', 'Email: john@example.com')).toBe(
      `Class conflict: Mon 2:00 PM-3:00 PM\n${SEPARATOR}\nEmail: john@example.com`
    );
  });

  test('buildCombinedMemberNote handles blank sides correctly', () => {
    const logic = loadRosterSyncLogic();

    // Contact-only: separator is always written so splitNote can recover it later
    expect(logic.buildCombinedMemberNote('', 'Email: john@example.com')).toBe(
      `${SEPARATOR}\nEmail: john@example.com`
    );
    expect(logic.buildCombinedMemberNote('Class conflict: Mon 2:00 PM-3:00 PM', '')).toBe(
      'Class conflict: Mon 2:00 PM-3:00 PM'
    );
    expect(logic.buildCombinedMemberNote('', '')).toBe('');
  });

  test('splitNoteAtRosterSeparator recovers contact info when separator is at start', () => {
    const logic = loadRosterSyncLogic();

    // Format written by buildCombinedMemberNote when only contact info exists
    const contactOnly = `${SEPARATOR}\nEmail: john@example.com`;
    expect(logic.splitNoteAtRosterSeparator(contactOnly)).toEqual({
      yellowSheetPart: '',
      contactPart: 'Email: john@example.com',
    });
  });
});
