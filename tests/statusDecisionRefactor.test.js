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
  ]);
}

function isDateLike(value) {
  return Object.prototype.toString.call(value) === '[object Date]' && !isNaN(new Date(value).getTime());
}

const YELLOW_HEADERS = [
  'Submission ID',
  'Response ID',
  'Submitted At',
  'Last Updated At',
  'Full Name',
  'Section',
  'Conflict Days',
  'Start Time',
  'End Time',
  'Notes',
  'Status',
  'Approved At',
  'Denied At',
  'Processed At',
  'Error',
];

describe('Status-as-decision refactor regressions', () => {
  test('Pink Sheet denied + matching date writes Absent (not blank)', () => {
    const { context, spreadsheet } = createGasTestContext({
      Data: buildDataSheet(),
      Tuba: new MockSheet('Tuba', [
        ['Name', '4/14 3:30 PM'],
        ['Smith, Sam', 'Excused'],
      ]),
    });
    loadCoreWorkflowScripts(context);

    const deniedOutcome = context.processSinglePinkSheet(spreadsheet, {
      submissionId: 'pink-deny-1',
      submittedAt: new Date(2026, 3, 10, 14, 0, 0),
      name: 'Smith, Sam',
      section: 'Tuba',
      date: new Date(2026, 3, 14, 0, 0, 0),
      status: 'Denied',
    });

    expect(deniedOutcome.statusValue).toBe('Denied');
    expect(deniedOutcome.updated).toBe(true);
    expect(spreadsheet.getSheetByName('Tuba').getRange(2, 2).getValue()).toBe('Absent');
    expect(spreadsheet.getSheetByName('Tuba').getRange(2, 2).getNote()).toContain('Pink Sheet denied');
  });

  test('Pink Sheet approve → deny → approve cycle keeps Status and first-set timestamps stable', () => {
    const { context, spreadsheet } = createGasTestContext({
      Data: buildDataSheet(),
      Tuba: new MockSheet('Tuba', [
        ['Name', '4/14 3:30 PM'],
        ['Smith, Sam', 'Absent'],
      ]),
    });
    loadCoreWorkflowScripts(context);

    const firstApproval = context.processSinglePinkSheet(spreadsheet, {
      submissionId: 'pink-cycle',
      submittedAt: new Date(2026, 3, 10, 14, 0, 0),
      name: 'Smith, Sam',
      section: 'Tuba',
      date: new Date(2026, 3, 14, 0, 0, 0),
      status: 'Approved',
    });

    expect(firstApproval.statusValue).toBe('Approved');
    expect(isDateLike(firstApproval.approvedAt)).toBe(true);
    expect(firstApproval.deniedAt).toBe('');
    const firstApprovedAt = firstApproval.approvedAt;
    expect(spreadsheet.getSheetByName('Tuba').getRange(2, 2).getValue()).toBe('Excused');

    const denial = context.processSinglePinkSheet(spreadsheet, {
      submissionId: 'pink-cycle',
      submittedAt: new Date(2026, 3, 10, 14, 0, 0),
      name: 'Smith, Sam',
      section: 'Tuba',
      date: new Date(2026, 3, 14, 0, 0, 0),
      status: 'Denied',
      approvedAt: firstApprovedAt,
    });

    expect(denial.statusValue).toBe('Denied');
    expect(denial.approvedAt).toBe('');
    expect(isDateLike(denial.deniedAt)).toBe(true);
    const firstDeniedAt = denial.deniedAt;
    expect(spreadsheet.getSheetByName('Tuba').getRange(2, 2).getValue()).toBe('Absent');

    const secondApproval = context.processSinglePinkSheet(spreadsheet, {
      submissionId: 'pink-cycle',
      submittedAt: new Date(2026, 3, 10, 14, 0, 0),
      name: 'Smith, Sam',
      section: 'Tuba',
      date: new Date(2026, 3, 14, 0, 0, 0),
      status: 'Approved',
      approvedAt: firstApprovedAt,
      deniedAt: firstDeniedAt,
    });

    expect(secondApproval.statusValue).toBe('Approved');
    expect(secondApproval.approvedAt).toBe('');
    expect(secondApproval.deniedAt).toBe('');
    expect(spreadsheet.getSheetByName('Tuba').getRange(2, 2).getValue()).toBe('Excused');
  });

  test('Yellow Sheet second submission from the same student creates a new row instead of overwriting', () => {
    const { context, spreadsheet } = createGasTestContext({
      Data: buildDataSheet(),
      'Yellow Sheets': new MockSheet('Yellow Sheets', [YELLOW_HEADERS.slice()]),
      Tuba: new MockSheet('Tuba', [['Name'], ['Smith, Sam']]),
    });
    loadCoreWorkflowScripts(context);

    const firstRow = context.upsertYellowSheetSubmission({
      submissionId: 'sub-1',
      responseId: 'resp-A',
      submittedAt: new Date(2026, 3, 14, 9, 0, 0),
      lastUpdatedAt: new Date(2026, 3, 14, 9, 0, 0),
      name: 'Smith, Sam',
      section: 'Tuba',
      days: 'Monday',
      startTime: '2:30 PM',
      endTime: '3:20 PM',
      notes: '',
    });

    const secondRow = context.upsertYellowSheetSubmission({
      submissionId: 'sub-2',
      responseId: 'resp-B',
      submittedAt: new Date(2026, 3, 15, 9, 0, 0),
      lastUpdatedAt: new Date(2026, 3, 15, 9, 0, 0),
      name: 'Smith, Sam',
      section: 'Tuba',
      days: 'Wednesday',
      startTime: '10:00 AM',
      endTime: '11:00 AM',
      notes: '',
    });

    expect(firstRow).toBe(2);
    expect(secondRow).toBe(3);
    const yellow = spreadsheet.getSheetByName('Yellow Sheets');
    expect(yellow.getRange(2, 2).getValue()).toBe('resp-A');
    expect(yellow.getRange(3, 2).getValue()).toBe('resp-B');
  });

  test('Yellow Sheet approving two rows produces a combined name-cell note; denying one leaves only the other', () => {
    const { context, spreadsheet } = createGasTestContext({
      Data: buildDataSheet(),
      'Yellow Sheets': new MockSheet('Yellow Sheets', [
        YELLOW_HEADERS.slice(),
        ['sub-1', 'resp-A', new Date(2026, 3, 14, 9, 0, 0), new Date(2026, 3, 14, 9, 0, 0), 'Smith, Sam', 'Tuba', 'Monday', '2:30 PM', '3:20 PM', '', 'Approved', '', '', '', ''],
        ['sub-2', 'resp-B', new Date(2026, 3, 15, 9, 0, 0), new Date(2026, 3, 15, 9, 0, 0), 'Smith, Sam', 'Tuba', 'Wednesday', '10:00 AM', '11:00 AM', '', 'Approved', '', '', '', ''],
      ]),
      Tuba: new MockSheet('Tuba', [['Name'], ['Smith, Sam']]),
    });
    loadCoreWorkflowScripts(context);

    const processed = context.processYellowSheetActions(spreadsheet);
    expect(processed).toBe(2);

    const combinedNote = spreadsheet.getSheetByName('Tuba').getRange(2, 1).getNote();
    expect(combinedNote).toContain('Class conflict: Monday 2:30 PM-3:20 PM');
    expect(combinedNote).toContain('Class conflict: Wednesday 10:00 AM-11:00 AM');
    expect(combinedNote).not.toContain('Pending Yellow Sheet');

    const yellow = spreadsheet.getSheetByName('Yellow Sheets');
    expect(yellow.getRange(2, 11).getValue()).toBe('Approved');
    expect(yellow.getRange(3, 11).getValue()).toBe('Approved');
    expect(isDateLike(yellow.getRange(2, 12).getValue())).toBe(true);
    expect(isDateLike(yellow.getRange(3, 12).getValue())).toBe(true);

    yellow.getRange(3, 11).setValue('Denied');
    const reprocessed = context.processYellowSheetActions(spreadsheet);
    expect(reprocessed).toBe(2);

    const finalNote = spreadsheet.getSheetByName('Tuba').getRange(2, 1).getNote();
    expect(finalNote).toContain('Class conflict: Monday 2:30 PM-3:20 PM');
    expect(finalNote).not.toContain('Class conflict: Wednesday');
    expect(yellow.getRange(3, 11).getValue()).toBe('Denied');
    expect(isDateLike(yellow.getRange(3, 13).getValue())).toBe(true);
  });

  test('Yellow Sheet pending submission alongside an approved row shows both the conflict and the pending marker', () => {
    const { context, spreadsheet } = createGasTestContext({
      Data: buildDataSheet(),
      'Yellow Sheets': new MockSheet('Yellow Sheets', [
        YELLOW_HEADERS.slice(),
        ['sub-1', 'resp-A', new Date(2026, 3, 14, 9, 0, 0), new Date(2026, 3, 14, 9, 0, 0), 'Smith, Sam', 'Tuba', 'Monday', '2:30 PM', '3:20 PM', '', 'Approved', new Date(2026, 3, 14, 10, 0, 0), '', new Date(2026, 3, 14, 10, 0, 0), ''],
      ]),
      Tuba: new MockSheet('Tuba', [['Name'], ['Smith, Sam']]),
    });
    loadCoreWorkflowScripts(context);

    context.upsertYellowSheetSubmission({
      submissionId: 'sub-2',
      responseId: 'resp-B',
      submittedAt: new Date(2026, 3, 15, 9, 0, 0),
      lastUpdatedAt: new Date(2026, 3, 15, 9, 0, 0),
      name: 'Smith, Sam',
      section: 'Tuba',
      days: 'Wednesday',
      startTime: '10:00 AM',
      endTime: '11:00 AM',
      notes: '',
    });

    const note = spreadsheet.getSheetByName('Tuba').getRange(2, 1).getNote();
    expect(note).toContain('Class conflict: Monday 2:30 PM-3:20 PM');
    expect(note).toContain('Pending Yellow Sheet');
    expect(note).toContain('Submitted: ');
  });
});
