import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, expect, test } from '@jest/globals';

function loadConcernListLogic() {
  const filePath = path.resolve(process.cwd(), 'src', 'ConcernListLogic.js');
  const source = readFileSync(filePath, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

describe('ConcernListLogic', () => {
  test('quoteSheetNameForFormula escapes single quotes', () => {
    const logic = loadConcernListLogic();

    expect(logic.quoteSheetNameForFormula("Bob's Section")).toBe("'Bob''s Section'");
  });

  test('buildConcernListSectionFormula references the selector and section sheet', () => {
    const logic = loadConcernListLogic();
    const formula = logic.buildConcernListSectionFormula('Color Guard');

    expect(formula).toContain("'Color Guard'!A2:A");
    expect(formula).toContain('MATCH($B$1');
    expect(formula).toContain('OFFSET(');
  });

  test('buildConcernListFormula builds a formula-only concern list', () => {
    const logic = loadConcernListLogic();
    const formula = logic.buildConcernListFormula(['Piccolo', 'Tuba'], 'Present');

    expect(formula.startsWith('=IF($B$1')).toBe(true);
    expect(formula).toContain('QUERY(VSTACK(');
    expect(formula).toContain('"Present"');
    expect(formula).toContain("'Piccolo'!A2:A");
    expect(formula).toContain("'Tuba'!A2:A");
  });
});
