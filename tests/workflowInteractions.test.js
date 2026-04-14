import { describe, expect, test } from '@jest/globals';
import { createGasTestContext, loadGasScripts, MockSheet } from './helpers/gasHarness.js';

function buildDataSheet() {
  return new MockSheet('Data', [
    ['Key', 'Value'],
    ['SECTION_TABS', 'Trumpet\nTuba'],
    ['TIMEZONE', 'America/Chicago'],
    ['REHEARSAL_START_TIME', '15:30'],
    ['LATE_THRESHOLD_MINUTES', '15'],
    ['STATUS_PENDING', 'Pending'],
    ['STATUS_APPROVED', 'Approved'],
    ['STATUS_DENIED', 'Denied'],
    ['STATUS_COMPLETE', 'Completed'],
    ['ATTENDANCE_PRESENT', 'Present'],
    ['ATTENDANCE_TARDY', 'Tardy'],
    ['ATTENDANCE_ABSENT', 'Absent'],
    ['ATTENDANCE_EXCUSED', 'Excused'],
    ['LATE_REASONS', 'Class\nOther'],
  ]);
}

function loadCoreWorkflowScripts(context) {
  loadGasScripts(context, [
    'src/SheetManager.js',
    'src/Config.js',
    'src/LateCheckInLogic.js',
    'src/PinkSheetLogic.js',
    'src/YellowSheetLogic.js',
    'src/Feature_DateAdd.js',
    'src/Feature_QueueProcessor.js',
    'src/Feature_LateCheckIn.js',
    'src/Feature_PinkSheets.js',
    'src/Feature_YellowSheets.js',
    'src/RosterSyncLogic.js',
    'src/Feature_RosterSync.js',
  ]);
}

describe('Workflow interactions', () => {
  test('Late Check-In processing updates attendance, note, and queue status', () => {
    const { context, spreadsheet } = createGasTestContext({
      Data: buildDataSheet(),
      'Late Check-Ins': new MockSheet('Late Check-Ins', [
        ['Submission ID', 'Submitted At', 'Full Name', 'Section', 'Arrival Time', 'Reason', 'Other Explanation', 'Status', 'Processed At', 'Error'],
      ]),
      Trumpet: new MockSheet('Trumpet', [
        ['Name', '4/14 3:30 PM'],
        ['Doe, Jane', 'Absent'],
      ]),
    });
    loadCoreWorkflowScripts(context);

    const payload = {
      submissionId: 'late-1',
      submittedAt: new Date(2026, 3, 14, 15, 40, 0),
      name: 'Doe, Jane',
      section: 'Trumpet',
      arrival: new Date(2026, 3, 14, 15, 40, 0),
      reason: 'Class',
      otherExplanation: '',
    };

    const queueInfo = context.appendLateCheckInQueueRow(payload);
    const outcome = context.processSingleLateCheckIn(spreadsheet, payload);
    context.writeLateCheckInOutcome(queueInfo.sheet, queueInfo.headerMap, queueInfo.rowIndex, outcome);

    expect(spreadsheet.getSheetByName('Trumpet').getRange(2, 2).getValue()).toBe('Present');
    expect(spreadsheet.getSheetByName('Trumpet').getRange(2, 2).getNote()).toContain('Reason: Class');
    expect(spreadsheet.getSheetByName('Late Check-Ins').getRange(2, 8).getValue()).toBe('Completed');
  });

  test('Late Check-In stays pending when the rehearsal date does not exist yet', () => {
    const { context, spreadsheet } = createGasTestContext({
      Data: buildDataSheet(),
      'Late Check-Ins': new MockSheet('Late Check-Ins', [
        ['Submission ID', 'Submitted At', 'Full Name', 'Section', 'Arrival Time', 'Reason', 'Other Explanation', 'Status', 'Processed At', 'Error'],
      ]),
      Trumpet: new MockSheet('Trumpet', [
        ['Name', '4/15 3:30 PM'],
        ['Doe, Jane', 'Absent'],
      ]),
    });
    loadCoreWorkflowScripts(context);

    const payload = {
      submissionId: 'late-2',
      submittedAt: new Date(2026, 3, 14, 15, 50, 0),
      name: 'Doe, Jane',
      section: 'Trumpet',
      arrival: new Date(2026, 3, 14, 15, 50, 0),
      reason: 'Class',
      otherExplanation: '',
    };

    const outcome = context.processSingleLateCheckIn(spreadsheet, payload);

    expect(outcome.statusValue).toBe('Pending');
    expect(spreadsheet.getSheetByName('Trumpet').getRange(2, 2).getValue()).toBe('Absent');
  });

  test('Pink Sheet pending row auto-processes when date exists and stays pending when date is missing', () => {
    const { context, spreadsheet } = createGasTestContext({
      Data: buildDataSheet(),
      Tuba: new MockSheet('Tuba', [
        ['Name', '4/14 3:30 PM'],
        ['Smith, Sam', 'Absent'],
      ]),
    });
    loadCoreWorkflowScripts(context);

    const completedOutcome = context.processSinglePinkSheet(spreadsheet, {
      submissionId: 'pink-1',
      submittedAt: new Date(2026, 3, 10, 14, 0, 0),
      name: 'Smith, Sam',
      section: 'Tuba',
      date: new Date(2026, 3, 14, 0, 0, 0),
      status: 'Pending',
    });

    expect(completedOutcome.statusValue).toBe('Completed');
    expect(spreadsheet.getSheetByName('Tuba').getRange(2, 2).getValue()).toBe('Excused');
    expect(spreadsheet.getSheetByName('Tuba').getRange(2, 2).getNote()).toContain('Status: Completed');

    const missingDateOutcome = context.processSinglePinkSheet(spreadsheet, {
      submissionId: 'pink-2',
      submittedAt: new Date(2026, 3, 10, 14, 0, 0),
      name: 'Smith, Sam',
      section: 'Tuba',
      date: new Date(2026, 3, 15, 0, 0, 0),
      status: 'Pending',
    });

    expect(missingDateOutcome.statusValue).toBe('Pending');
  });

  test('Yellow Sheet upsert updates an existing complete row and resets note to pending', () => {
    const { context, spreadsheet } = createGasTestContext({
      Data: buildDataSheet(),
      'Yellow Sheets': new MockSheet('Yellow Sheets', [
        ['Submission ID', 'Response ID', 'Submitted At', 'Last Updated At', 'Full Name', 'Section', 'Conflict Days', 'Start Time', 'End Time', 'Notes', 'Status', 'Processed At', 'Error'],
        ['old-sub', 'resp-1', new Date(2026, 3, 1, 12, 0, 0), new Date(2026, 3, 1, 12, 0, 0), 'Smith, Sam', 'Tuba', 'Monday', '2:30 PM', '3:20 PM', '', 'Complete', new Date(2026, 3, 1, 13, 0, 0), ''],
      ]),
      Tuba: new MockSheet('Tuba', [
        ['Name'],
        ['Smith, Sam'],
      ]),
    });
    loadCoreWorkflowScripts(context);

    spreadsheet.getSheetByName('Tuba').getRange(2, 1).setNote('Old approved note');

    const rowIndex = context.upsertYellowSheetSubmission({
      submissionId: 'new-sub',
      responseId: 'resp-1',
      submittedAt: new Date(2026, 3, 14, 9, 0, 0),
      lastUpdatedAt: new Date(2026, 3, 14, 9, 0, 0),
      name: 'Smith, Sam',
      section: 'Tuba',
      days: 'Tuesday',
      startTime: '1:30 PM',
      endTime: '2:20 PM',
      notes: 'Updated',
    });

    expect(rowIndex).toBe(2);
    expect(spreadsheet.getSheetByName('Yellow Sheets').getRange(2, 11).getValue()).toBe('Pending');
    expect(spreadsheet.getSheetByName('Tuba').getRange(2, 1).getNote()).toBe('Pending Yellow Sheet');
  });

  test('Roster sync row builder preserves existing values and notes by student name', () => {
    const { context } = createGasTestContext({ Data: buildDataSheet() });
    loadCoreWorkflowScripts(context);

    const rows = context.buildSectionSyncRows(
      ['Alpha, Ana', 'Zulu, Zoey'],
      3,
      {
        'Zulu, Zoey': {
          values: ['Zulu, Zoey', 'Present', 'Tardy'],
          notes: ['', 'note-1', 'note-2'],
        },
      }
    );

    expect(rows.values).toEqual([
      ['Alpha, Ana', '', ''],
      ['Zulu, Zoey', 'Present', 'Tardy'],
    ]);
    expect(rows.notes).toEqual([
      ['', '', ''],
      ['', 'note-1', 'note-2'],
    ]);
  });
});
