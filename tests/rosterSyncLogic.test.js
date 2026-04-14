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
});
