import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, expect, test } from '@jest/globals';

function loadYellowSheetLogic() {
  const filePath = path.resolve(process.cwd(), 'src', 'YellowSheetLogic.js');
  const source = readFileSync(filePath, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

describe('YellowSheetLogic', () => {
  test('edited submissions revert complete rows back to pending', () => {
    const logic = loadYellowSheetLogic();

    expect(
      logic.getYellowSubmissionStatus('Complete', { pending: 'Pending', complete: 'Complete' })
    ).toBe('Pending');
  });

  test('approved note text includes days and time range', () => {
    const logic = loadYellowSheetLogic();

    expect(logic.buildYellowSheetApprovedNote('Monday, Wednesday', '2:30 PM', '3:20 PM')).toBe(
      'Class conflict: Monday, Wednesday 2:30 PM-3:20 PM'
    );
  });

  test('pending note text is stable', () => {
    const logic = loadYellowSheetLogic();

    expect(logic.getPendingYellowSheetNoteText()).toBe('Pending Yellow Sheet');
  });
});
