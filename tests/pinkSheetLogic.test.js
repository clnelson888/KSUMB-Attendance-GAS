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
    complete: 'Complete',
  };

  test('approved rows complete only when the date exists', () => {
    const logic = loadPinkSheetLogic();

    expect(logic.determinePinkSheetAction('Approved', true, statuses)).toEqual({
      writeAttendance: true,
      writeNote: true,
      nextStatus: 'Complete',
    });

    expect(logic.determinePinkSheetAction('Approved', false, statuses)).toEqual({
      writeAttendance: false,
      writeNote: false,
      nextStatus: 'Approved',
    });
  });

  test('denied rows write a note and complete only when the date exists', () => {
    const logic = loadPinkSheetLogic();

    expect(logic.determinePinkSheetAction('Denied', true, statuses)).toEqual({
      writeAttendance: false,
      writeNote: true,
      nextStatus: 'Complete',
    });

    expect(logic.determinePinkSheetAction('Denied', false, statuses)).toEqual({
      writeAttendance: false,
      writeNote: false,
      nextStatus: 'Denied',
    });
  });

  test('pending rows never change attendance and remain pending', () => {
    const logic = loadPinkSheetLogic();

    expect(logic.determinePinkSheetAction('Pending', true, statuses)).toEqual({
      writeAttendance: false,
      writeNote: true,
      nextStatus: 'Pending',
    });
  });

  test('buildPinkSheetNoteText excludes the reason and keeps only timestamp plus status', () => {
    const logic = loadPinkSheetLogic();

    expect(logic.buildPinkSheetNoteText('4/14/2026 2:45 PM', 'Approved')).toBe(
      'Pink Sheet submitted: 4/14/2026 2:45 PM\nStatus: Approved'
    );
  });
});
