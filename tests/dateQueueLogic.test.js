import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, expect, test } from '@jest/globals';

function loadDateQueueLogic() {
  const context = {};
  vm.createContext(context);

  const lateLogic = readFileSync(path.resolve(process.cwd(), 'src', 'LateCheckInLogic.js'), 'utf8');
  const dateQueueLogic = readFileSync(path.resolve(process.cwd(), 'src', 'DateQueueLogic.js'), 'utf8');
  vm.runInContext(lateLogic, context);
  vm.runInContext(dateQueueLogic, context);
  return context;
}

describe('DateQueueLogic', () => {
  test('shouldResetQueueRowForDeletedDate matches by calendar day only', () => {
    const logic = loadDateQueueLogic();

    expect(
      logic.shouldResetQueueRowForDeletedDate(
        new Date(2026, 3, 14, 15, 30, 0),
        new Date(2026, 3, 14, 20, 0, 0)
      )
    ).toBe(true);

    expect(
      logic.shouldResetQueueRowForDeletedDate(
        new Date(2026, 3, 14, 15, 30, 0),
        new Date(2026, 3, 15, 15, 30, 0)
      )
    ).toBe(false);
  });
});
