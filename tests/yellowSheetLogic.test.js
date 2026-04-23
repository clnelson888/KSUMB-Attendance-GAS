import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, expect, test } from '@jest/globals';

function loadYellowSheetLogic() {
  const filePath = path.resolve(process.cwd(), 'src', 'YellowSheetLogic.js');
  const source = readFileSync(filePath, 'utf8');
  const context = {
    isCompleteStatusValue(value) {
      const normalized = String(value || '').trim();
      return normalized === 'Completed' || normalized === 'Complete';
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

describe('YellowSheetLogic', () => {
  test('every submission lands as pending regardless of prior status', () => {
    const logic = loadYellowSheetLogic();

    expect(logic.getYellowSubmissionStatus('Approved', { pending: 'Pending' })).toBe('Pending');
    expect(logic.getYellowSubmissionStatus('Denied', { pending: 'Pending' })).toBe('Pending');
    expect(logic.getYellowSubmissionStatus('', { pending: 'Pending' })).toBe('Pending');
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
    expect(logic.getPendingYellowSheetNoteText('4/14/2026 9:00 AM')).toBe(
      'Pending Yellow Sheet\nSubmitted: 4/14/2026 9:00 AM'
    );
  });

  test('approved note text omits submission/approval timestamps', () => {
    const logic = loadYellowSheetLogic();

    expect(
      logic.buildYellowSheetApprovedNote(
        'Tuesday',
        '1:30 PM',
        '2:20 PM',
        '4/14/2026 9:00 AM',
        '4/15/2026 10:15 AM'
      )
    ).toBe('Class conflict: Tuesday 1:30 PM-2:20 PM');
  });

  test('combined note joins every approved conflict line and only one pending line', () => {
    const logic = loadYellowSheetLogic();

    expect(
      logic.buildYellowSheetCombinedNote(
        ['Class conflict: Monday 2:30 PM-3:20 PM', 'Class conflict: Wednesday 2:30 PM-3:20 PM'],
        false,
        ''
      )
    ).toBe('Class conflict: Monday 2:30 PM-3:20 PM\nClass conflict: Wednesday 2:30 PM-3:20 PM');

    expect(
      logic.buildYellowSheetCombinedNote(
        ['Class conflict: Monday 2:30 PM-3:20 PM'],
        true,
        '4/14/2026 9:00 AM'
      )
    ).toBe('Class conflict: Monday 2:30 PM-3:20 PM\nPending Yellow Sheet\nSubmitted: 4/14/2026 9:00 AM');

    expect(logic.buildYellowSheetCombinedNote([], false, '')).toBe('');
  });
});
