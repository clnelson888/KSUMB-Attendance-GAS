import { describe, expect, test } from '@jest/globals';
import { createGasTestContext, loadGasScripts, MockSheet } from './helpers/gasHarness.js';

describe('Config', () => {
  test('document properties override legacy Data-sheet values', () => {
    const { context, documentProperties } = createGasTestContext({
      Data: new MockSheet('Data', [
        ['Key', 'Value'],
        ['TIMEZONE', 'America/Chicago'],
        ['STATUS_COMPLETE', 'Complete'],
      ]),
    });

    documentProperties.CFG__TIMEZONE = 'America/New_York';
    documentProperties.CFG__STATUS_COMPLETE = 'Completed';

    loadGasScripts(context, ['src/Config.js']);

    expect(context.getAppTimezone()).toBe('America/New_York');
    expect(context.getStatusValue('COMPLETE')).toBe('Completed');
  });

  test('imports legacy Data settings into document properties', () => {
    const { context, documentProperties } = createGasTestContext({
      Data: new MockSheet('Data', [
        ['Key', 'Value'],
        ['SECTION_TABS', 'Trumpet\nTuba'],
        ['TIMEZONE', 'America/Los_Angeles'],
      ]),
    });

    loadGasScripts(context, ['src/Config.js']);

    const importedCount = context.importLegacyDataConfigToProperties(false);

    expect(importedCount).toBe(2);
    expect(documentProperties.CFG__SECTION_TABS).toBe('Trumpet\nTuba');
    expect(documentProperties.CFG__TIMEZONE).toBe('America/Los_Angeles');
  });
});
