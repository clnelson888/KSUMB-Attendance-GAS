import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, expect, test } from '@jest/globals';

function loadQueueStatusLogic() {
  const filePath = path.resolve(process.cwd(), 'src', 'QueueStatusLogic.js');
  const source = readFileSync(filePath, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

describe('QueueStatusLogic', () => {
  test('processes only the targeted queue sheet on data rows with approved or denied values', () => {
    const logic = loadQueueStatusLogic();

    expect(
      logic.shouldProcessQueueStatusEdit('Yellow Sheets', 'Yellow Sheets', 2, 11, 11, 'Approved', 'Approved', 'Denied')
    ).toBe(true);
    expect(
      logic.shouldProcessQueueStatusEdit('Pink Sheets', 'Pink Sheets', 2, 7, 7, 'Approved', 'Approved', 'Denied')
    ).toBe(true);
    expect(
      logic.shouldProcessQueueStatusEdit('Yellow Sheets', 'Yellow Sheets', 3, 11, 11, 'Denied', 'Approved', 'Denied')
    ).toBe(true);
    expect(
      logic.shouldProcessQueueStatusEdit('Yellow Sheets', 'Yellow Sheets', 1, 11, 11, 'Approved', 'Approved', 'Denied')
    ).toBe(false);
    expect(
      logic.shouldProcessQueueStatusEdit('Pink Sheets', 'Yellow Sheets', 2, 11, 11, 'Approved', 'Approved', 'Denied')
    ).toBe(false);
    expect(
      logic.shouldProcessQueueStatusEdit('Yellow Sheets', 'Yellow Sheets', 2, 10, 11, 'Approved', 'Approved', 'Denied')
    ).toBe(false);
    expect(
      logic.shouldProcessQueueStatusEdit('Yellow Sheets', 'Yellow Sheets', 2, 11, 11, 'Pending', 'Approved', 'Denied')
    ).toBe(false);
  });

  test('back-compat wrapper still restricts to Yellow Sheets', () => {
    const logic = loadQueueStatusLogic();

    expect(logic.shouldProcessYellowStatusEdit('Yellow Sheets', 2, 11, 11, 'Approved', 'Approved', 'Denied')).toBe(
      true
    );
    expect(logic.shouldProcessYellowStatusEdit('Pink Sheets', 2, 11, 11, 'Approved', 'Approved', 'Denied')).toBe(
      false
    );
  });
});
