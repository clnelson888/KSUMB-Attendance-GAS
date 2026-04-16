import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, expect, test } from '@jest/globals';

function loadPinkSheetLogic() {
  const filePath = path.resolve(process.cwd(), 'src', 'PinkSheetLogic.js');
  const source = readFileSync(filePath, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

describe('PinkSheetLogic', () => {
  const statuses = {
    pending: 'Pending',
    approved: 'Approved',
    denied: 'Denied',
    complete: 'Completed',
  };

  test('approved rows complete only when the date exists', () => {
    const logic = loadPinkSheetLogic();

    expect(logic.determinePinkSheetAction('Approved', true, statuses)).toEqual({
      writeAttendance: true,
      clearAttendance: false,
      writeNote: true,
      nextStatus: 'Completed',
    });

    expect(logic.determinePinkSheetAction('Approved', false, statuses)).toEqual({
      writeAttendance: false,
      clearAttendance: false,
      writeNote: false,
      nextStatus: 'Approved',
    });
  });

  test('denied rows clear any prior Excused, add a note, and complete when the date exists', () => {
    const logic = loadPinkSheetLogic();

    expect(logic.determinePinkSheetAction('Denied', true, statuses)).toEqual({
      writeAttendance: true,
      clearAttendance: true,
      writeNote: true,
      nextStatus: 'Completed',
    });

    expect(logic.determinePinkSheetAction('Denied', false, statuses)).toEqual({
      writeAttendance: false,
      clearAttendance: true,
      writeNote: false,
      nextStatus: 'Denied',
    });
  });

  test('pending rows write a note only and stay pending', () => {
    const logic = loadPinkSheetLogic();

    expect(logic.determinePinkSheetAction('Pending', true, statuses)).toEqual({
      writeAttendance: false,
      clearAttendance: false,
      writeNote: true,
      nextStatus: 'Pending',
    });

    expect(logic.determinePinkSheetAction('Pending', false, statuses)).toEqual({
      writeAttendance: false,
      clearAttendance: false,
      writeNote: false,
      nextStatus: 'Pending',
    });
  });

  test('buildPinkSheetNoteText renders pending, approved, and denied variants', () => {
    const logic = loadPinkSheetLogic();

    expect(
      logic.buildPinkSheetNoteText({
        statusValue: 'Pending',
        submittedAtLabel: '4/14/2026 2:45 PM',
      })
    ).toBe('Pink Sheet pending (not yet approved)\nSubmitted: 4/14/2026 2:45 PM');

    expect(
      logic.buildPinkSheetNoteText({
        statusValue: 'Approved',
        submittedAtLabel: '4/14/2026 2:45 PM',
        approvedAtLabel: '4/15/2026 9:00 AM',
      })
    ).toBe(
      'Pink Sheet approved\nSubmitted: 4/14/2026 2:45 PM\nApproved: 4/15/2026 9:00 AM'
    );

    expect(
      logic.buildPinkSheetNoteText({
        statusValue: 'Denied',
        submittedAtLabel: '4/14/2026 2:45 PM',
        deniedAtLabel: '4/15/2026 9:00 AM',
      })
    ).toBe('Pink Sheet denied\nSubmitted: 4/14/2026 2:45 PM\nDenied: 4/15/2026 9:00 AM');
  });
});
