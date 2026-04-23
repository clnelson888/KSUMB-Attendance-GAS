import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

function loadFormNameLogic() {
  const context = { console };
  vm.createContext(context);
  const source = readFileSync(
    path.resolve(process.cwd(), 'src/FormNameLogic.js'),
    'utf8'
  );
  vm.runInContext(source, context, { filename: 'src/FormNameLogic.js' });
  return context;
}

describe('FormNameLogic', () => {
  test('normalizes manual names into Last, First format', () => {
    const context = loadFormNameLogic();

    expect(context.normalizeSubmittedName('Jane Doe')).toBe('Doe, Jane');
    expect(context.normalizeSubmittedName('Doe,   Jane Marie')).toBe('Doe, Jane Marie');
    expect(context.normalizeSubmittedName('  Doe ,  Jane  ')).toBe('Doe, Jane');
  });

  test('manual name overrides dropdown name and missing names throw', () => {
    const context = loadFormNameLogic();

    expect(context.resolveSubmittedName('Doe, Jane', 'Smith, Sam')).toBe('Smith, Sam');
    expect(context.resolveSubmittedName('Doe, Jane', '')).toBe('Doe, Jane');
    expect(() => context.requireResolvedSubmittedName('', '')).toThrow(
      'Submission is missing a student name'
    );
  });

  test('builds and parses section page titles consistently', () => {
    const context = loadFormNameLogic();
    const title = context.buildSectionPageTitle('Trumpet');

    expect(title).toBe('Trumpet — Student Information');
    expect(context.extractSectionFromPageTitle(title)).toBe('Trumpet');
  });
});
