/** Vytvoření záznamu ControlRun z výskytu a verze definice. */
import { monthKey } from './dates';
import { newGuid } from './ids';
import type { Occurrence } from './recurrence';
import type { Control, ControlRun, ControlVersion, Email, ISODateTime } from './types';

export function checklistTemplate(version: ControlVersion) {
  return version.ChecklistDefinition.map((i) => ({ itemId: i.id, label: i.label, required: i.required, answer: null, comment: '' }));
}

export function newRunFromOccurrence(
  control: Pick<Control, 'ControlId' | 'ControlCode' | 'Department' | 'Category'>,
  version: ControlVersion,
  occ: Occurrence,
  now: ISODateTime,
  actor: Email,
): ControlRun {
  return {
    RunId: newGuid(),
    ControlId: control.ControlId,
    VersionId: version.VersionId,
    VersionNumber: version.VersionNumber,
    ControlCode: control.ControlCode,
    ControlName: version.ControlName,
    Department: control.Department,
    Category: control.Category,
    RiskLevel: version.RiskLevel,
    RecurrenceType: version.RecurrenceType,
    OccurrenceKey: occ.occurrenceKey,
    RunCode: occ.runCode,
    NominalDate: occ.nominalDate,
    PeriodFrom: occ.periodFrom,
    PeriodTo: occ.periodTo,
    ScheduledDate: occ.scheduledDate,
    DueDate: occ.dueDate,
    DueMonthKey: monthKey(occ.dueDate),
    AssignedOwnerEmail: version.PrimaryOwnerEmail,
    BackupOwnerEmail: version.BackupOwnerEmail,
    ReviewerEmail: version.ReviewerEmail,
    ApprovalRequired: version.ApprovalRequired,
    WorkflowState: 'Planned',
    IsOpen: true,
    StartedAt: null,
    SubmittedAt: null,
    CompletedAt: null,
    ApprovedAt: null,
    CompletedBy: null,
    ApprovedBy: null,
    Result: null,
    ResultComment: '',
    ExceptionReason: '',
    ChecklistResults: checklistTemplate(version),
    ReturnCount: 0,
    ReturnComment: '',
    IsOneTimeOverride: false,
    OverrideNote: '',
    IsSuperseded: false,
    SupersededByVersionId: null,
    IsCorrection: false,
    ProtocolId: null,
    ProtocolUrl: null,
    CreatedAt: now,
    ModifiedAt: now,
    ModifiedBy: actor,
    RowVersion: 1,
  };
}

/** Uvolnění OccurrenceKey nahrazeného běhu (unikátní index na OccurrenceKey zůstává platný). */
export function supersededKey(run: Pick<ControlRun, 'OccurrenceKey' | 'RunId'>): string {
  return `${run.OccurrenceKey}#S-${run.RunId.slice(0, 8)}`;
}

/** Zajistí unikátní RunCode v rámci kontroly (kolize po změně pravidla → přípona -B, -C …). */
export function uniqueRunCode(code: string, used: Set<string>): string {
  if (!used.has(code)) return code;
  for (let i = 1; i < 26; i++) {
    const candidate = `${code}-${String.fromCharCode(65 + i)}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${code}-${Date.now()}`;
}
