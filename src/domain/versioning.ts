/**
 * Generování výskytů a verzování definic kontrol.
 *
 * Pravidla (viz docs/BUSINESS_RULES.md):
 *  1. Generování je idempotentní – klíčem je OccurrenceKey (unikátní index).
 *  2. Změna „tento a všechny následující“ vytvoří novou verzi s datem účinnosti.
 *     Předchozí verze dostane EffectiveTo = den před účinností nové verze.
 *  3. Dokončené a zrušené běhy se nikdy nemění.
 *  4. Rozpracované / odeslané / vrácené běhy se nemění – jsou označeny jako konflikt.
 *  5. Naplánované běhy se buď aktualizují (stejný OccurrenceKey), nebo bezpečně nahradí
 *     (stav Cancelled, IsSuperseded = true, uvolněný OccurrenceKey) a vzniknou nové.
 *  6. Jednorázově upravené výskyty si ponechají své úpravy (termín, osoby).
 */
import { addDays, addMonthsClamped, maxDate, minDate, monthKey, type WorkCalendar, defaultCalendar } from './dates';
import { newGuid } from './ids';
import { checklistTemplate, newRunFromOccurrence, supersededKey, uniqueRunCode } from './runFactory';
import { generateOccurrences, validateSchedule, type Occurrence } from './recurrence';
import type { Control, ControlRun, ControlVersion, Email, ISODate, ISODateTime, WorkflowState } from './types';

export function horizonEnd(today: ISODate, months: number): ISODate {
  return addMonthsClamped(today, months);
}

export function versionForDate(versions: ControlVersion[], date: ISODate): ControlVersion | undefined {
  return versions
    .filter((v) => v.EffectiveFrom <= date && (!v.EffectiveTo || v.EffectiveTo >= date))
    .sort((a, b) => b.VersionNumber - a.VersionNumber)[0];
}

export function latestVersion(versions: ControlVersion[]): ControlVersion | undefined {
  return [...versions].sort((a, b) => b.VersionNumber - a.VersionNumber)[0];
}

// ---------------------------------------------------------------------------------------------
// FLOW-01: generování výskytů
// ---------------------------------------------------------------------------------------------

export interface GenerationResult {
  creates: ControlRun[];
  skippedExisting: number;
}

export function planGeneration(p: {
  control: Control;
  versions: ControlVersion[];
  runs: ControlRun[];
  from: ISODate;
  to: ISODate;
  now: ISODateTime;
  actor: Email;
  cal?: WorkCalendar;
}): GenerationResult {
  const cal = p.cal ?? defaultCalendar;
  if (!p.control.IsActive) return { creates: [], skippedExisting: 0 };
  const existingKeys = new Set(p.runs.map((r) => r.OccurrenceKey));
  const usedCodes = new Set(p.runs.filter((r) => !r.IsSuperseded).map((r) => r.RunCode));
  const creates: ControlRun[] = [];
  let skippedExisting = 0;
  for (const v of [...p.versions].sort((a, b) => a.EffectiveFrom.localeCompare(b.EffectiveFrom))) {
    const from = maxDate(p.from, v.EffectiveFrom);
    const to = v.EffectiveTo ? minDate(p.to, v.EffectiveTo) : p.to;
    if (from > to) continue;
    for (const occ of generateOccurrences(v, from, to, cal)) {
      if (existingKeys.has(occ.occurrenceKey)) {
        skippedExisting++;
        continue;
      }
      const run = newRunFromOccurrence(p.control, v, occ, p.now, p.actor);
      run.RunCode = uniqueRunCode(occ.runCode, usedCodes);
      usedCodes.add(run.RunCode);
      existingKeys.add(occ.occurrenceKey);
      creates.push(run);
    }
  }
  return { creates, skippedExisting };
}

// ---------------------------------------------------------------------------------------------
// Změna definice – „tento a všechny následující“
// ---------------------------------------------------------------------------------------------

export type VersionDraft = Omit<
  ControlVersion,
  'VersionId' | 'ControlId' | 'ControlCode' | 'VersionNumber' | 'EffectiveFrom' | 'EffectiveTo' | 'CreatedAt' | 'CreatedBy' | 'ChangeReason'
>;

export type ImpactAction = 'update' | 'create' | 'cancel' | 'keepConflict' | 'keepOverride' | 'unchanged' | 'skipCovered';

export const IMPACT_LABELS: Record<ImpactAction, string> = {
  update: 'Aktualizace',
  create: 'Nový výskyt',
  cancel: 'Nahrazení (zrušení)',
  keepConflict: 'Konflikt – beze změny',
  keepOverride: 'Jednorázová úprava zachována',
  unchanged: 'Uzavřeno – beze změny',
  skipCovered: 'Období již pokryto',
};

export interface ImpactRow {
  action: ImpactAction;
  runId: string | null;
  runCode: string;
  occurrenceKey: string;
  state: WorkflowState | null;
  oldScheduled: ISODate | null;
  oldDue: ISODate | null;
  newScheduled: ISODate | null;
  newDue: ISODate | null;
  oldOwner: Email | null;
  newOwner: Email | null;
  oldReviewer: Email | null;
  newReviewer: Email | null;
  changed: boolean;
  note: string;
}

export interface VersionChangePlan {
  newVersion: ControlVersion;
  previousVersion: ControlVersion | null;
  previousVersionEffectiveTo: ISODate | null;
  controlPatch: Partial<Control>;
  runUpdates: Array<{ runId: string; expectedRowVersion: number; patch: Partial<ControlRun> }>;
  runCreates: ControlRun[];
  rows: ImpactRow[];
  counts: Record<ImpactAction, number>;
  warnings: string[];
  errors: string[];
}

export function validateVersionDraft(draft: VersionDraft): string[] {
  const errors = validateSchedule({ ...draft, ControlCode: 'X' });
  if (!draft.ControlName.trim()) errors.push('Název kontroly je povinný.');
  if (!draft.PrimaryOwnerEmail) errors.push('Vyberte odpovědnou osobu.');
  if (draft.ApprovalRequired && !draft.ReviewerEmail) errors.push('Pro schvalovaný proces vyberte schvalovatele.');
  if (draft.ApprovalRequired && draft.ReviewerEmail && draft.ReviewerEmail === draft.PrimaryOwnerEmail)
    errors.push('Princip čtyř očí: schvalovatel nesmí být totožný s odpovědnou osobou.');
  if (draft.BackupOwnerEmail && draft.BackupOwnerEmail === draft.PrimaryOwnerEmail)
    errors.push('Zástupce musí být jiná osoba než odpovědná osoba.');
  if (draft.ChecklistDefinition.length === 0) errors.push('Definujte alespoň jeden kontrolní krok.');
  if (draft.ChecklistDefinition.some((i) => !i.label.trim())) errors.push('Každý kontrolní krok musí mít popis.');
  if (draft.RequiredEvidence.some((e) => !e.name.trim())) errors.push('Každý požadovaný dokument musí mít název.');
  return errors;
}

export function planVersionChange(p: {
  control: Control;
  versions: ControlVersion[];
  runs: ControlRun[];
  draft: VersionDraft;
  category?: string;
  department?: string;
  effectiveFrom: ISODate;
  reason: string;
  today: ISODate;
  horizon: ISODate;
  now: ISODateTime;
  actor: Email;
  cal?: WorkCalendar;
}): VersionChangePlan {
  const cal = p.cal ?? defaultCalendar;
  const errors = validateVersionDraft(p.draft);
  const warnings: string[] = [];
  const prev = latestVersion(p.versions) ?? null;
  if (!p.reason.trim()) errors.push('Uveďte důvod změny – je povinný pro auditní stopu.');
  if (!p.effectiveFrom) errors.push('Zadejte datum účinnosti.');
  if (prev && p.effectiveFrom < prev.EffectiveFrom)
    errors.push(`Datum účinnosti nesmí předcházet účinnosti aktuální verze v${prev.VersionNumber} (${prev.EffectiveFrom}).`);
  if (p.effectiveFrom && p.effectiveFrom < p.today)
    warnings.push('Datum účinnosti je v minulosti – změna se dotkne i nedokončených výskytů po termínu.');

  const department = p.department ?? p.control.Department;
  const category = p.category ?? p.control.Category;

  const newVersion: ControlVersion = {
    ...p.draft,
    VersionId: newGuid(),
    ControlId: p.control.ControlId,
    ControlCode: p.control.ControlCode,
    VersionNumber: (prev?.VersionNumber ?? 0) + 1,
    EffectiveFrom: p.effectiveFrom,
    EffectiveTo: null,
    CreatedAt: p.now,
    CreatedBy: p.actor,
    ChangeReason: p.reason.trim(),
  };

  const counts: Record<ImpactAction, number> = { update: 0, create: 0, cancel: 0, keepConflict: 0, keepOverride: 0, unchanged: 0, skipCovered: 0 };
  const rows: ImpactRow[] = [];
  const runUpdates: VersionChangePlan['runUpdates'] = [];
  const runCreates: ControlRun[] = [];

  if (errors.length) {
    return {
      newVersion,
      previousVersion: prev,
      previousVersionEffectiveTo: null,
      controlPatch: {},
      runUpdates,
      runCreates,
      rows,
      counts,
      warnings,
      errors,
    };
  }

  const affected = p.runs
    .filter((r) => !r.IsSuperseded && r.NominalDate >= p.effectiveFrom)
    .sort((a, b) => a.NominalDate.localeCompare(b.NominalDate));
  const lastAffected = affected.length ? affected[affected.length - 1].NominalDate : p.effectiveFrom;
  const generationEnd = maxDate(p.horizon, lastAffected);
  const newOccs: Occurrence[] = p.control.IsActive ? generateOccurrences(newVersion, p.effectiveFrom, generationEnd, cal) : [];
  const newByKey = new Map(newOccs.map((o) => [o.occurrenceKey, o]));
  const affectedKeys = new Set(affected.map((r) => r.OccurrenceKey));
  const denorm = {
    VersionId: newVersion.VersionId,
    VersionNumber: newVersion.VersionNumber,
    ControlName: newVersion.ControlName,
    RiskLevel: newVersion.RiskLevel,
    RecurrenceType: newVersion.RecurrenceType,
    ApprovalRequired: newVersion.ApprovalRequired,
    Department: department,
    Category: category,
    ChecklistResults: checklistTemplate(newVersion),
    ModifiedAt: p.now,
    ModifiedBy: p.actor,
  } satisfies Partial<ControlRun>;

  const baseRow = (r: ControlRun): Omit<ImpactRow, 'action' | 'changed' | 'note'> => ({
    runId: r.RunId,
    runCode: r.RunCode,
    occurrenceKey: r.OccurrenceKey,
    state: r.WorkflowState,
    oldScheduled: r.ScheduledDate,
    oldDue: r.DueDate,
    newScheduled: r.ScheduledDate,
    newDue: r.DueDate,
    oldOwner: r.AssignedOwnerEmail,
    newOwner: r.AssignedOwnerEmail,
    oldReviewer: r.ReviewerEmail,
    newReviewer: r.ReviewerEmail,
  });

  for (const r of affected) {
    const occ = newByKey.get(r.OccurrenceKey);
    if (r.WorkflowState === 'Completed' || r.WorkflowState === 'Cancelled') {
      counts.unchanged++;
      rows.push({ ...baseRow(r), action: 'unchanged', changed: false, note: 'Uzavřený běh se nemění (historie).' });
      continue;
    }
    if (r.WorkflowState !== 'Planned') {
      counts.keepConflict++;
      rows.push({
        ...baseRow(r),
        action: 'keepConflict',
        changed: false,
        note: 'Rozpracovaný / odeslaný běh zůstává na původní verzi. Případnou úpravu proveďte jednotlivě.',
      });
      continue;
    }
    if (r.IsOneTimeOverride) {
      if (occ) {
        counts.keepOverride++;
        runUpdates.push({ runId: r.RunId, expectedRowVersion: r.RowVersion, patch: { ...denorm } });
        rows.push({ ...baseRow(r), action: 'keepOverride', changed: false, note: 'Termín a osoby z jednorázové úpravy zůstávají.' });
      } else {
        counts.keepConflict++;
        rows.push({
          ...baseRow(r),
          action: 'keepConflict',
          changed: false,
          note: 'Jednorázově upravený výskyt neodpovídá novému pravidlu – ponechán, případně jej zrušte ručně.',
        });
      }
      continue;
    }
    if (occ) {
      const patch: Partial<ControlRun> = {
        ...denorm,
        ScheduledDate: occ.scheduledDate,
        DueDate: occ.dueDate,
        DueMonthKey: monthKey(occ.dueDate),
        PeriodFrom: occ.periodFrom,
        PeriodTo: occ.periodTo,
        AssignedOwnerEmail: newVersion.PrimaryOwnerEmail,
        BackupOwnerEmail: newVersion.BackupOwnerEmail,
        ReviewerEmail: newVersion.ReviewerEmail,
      };
      const changed =
        occ.scheduledDate !== r.ScheduledDate ||
        occ.dueDate !== r.DueDate ||
        newVersion.PrimaryOwnerEmail !== r.AssignedOwnerEmail ||
        newVersion.ReviewerEmail !== r.ReviewerEmail;
      counts.update++;
      runUpdates.push({ runId: r.RunId, expectedRowVersion: r.RowVersion, patch });
      rows.push({
        ...baseRow(r),
        action: 'update',
        newScheduled: occ.scheduledDate,
        newDue: occ.dueDate,
        newOwner: newVersion.PrimaryOwnerEmail,
        newReviewer: newVersion.ReviewerEmail,
        changed,
        note: changed ? 'Termín nebo osoby se mění podle nové verze.' : 'Převedeno na novou verzi (metodika).',
      });
    } else {
      counts.cancel++;
      runUpdates.push({
        runId: r.RunId,
        expectedRowVersion: r.RowVersion,
        patch: {
          WorkflowState: 'Cancelled',
          IsOpen: false,
          IsSuperseded: true,
          SupersededByVersionId: newVersion.VersionId,
          OccurrenceKey: supersededKey(r),
          ExceptionReason: `Nahrazeno verzí v${newVersion.VersionNumber}: ${p.reason.trim()}`,
          ModifiedAt: p.now,
          ModifiedBy: p.actor,
        },
      });
      rows.push({
        ...baseRow(r),
        action: 'cancel',
        newScheduled: null,
        newDue: null,
        newOwner: null,
        newReviewer: null,
        changed: true,
        note: 'Výskyt podle nového pravidla neexistuje – bude nahrazen.',
      });
    }
  }

  const cancelledIds = new Set(rows.filter((r) => r.action === 'cancel').map((r) => r.runId));
  // Období, která už pokrývá ponechaný běh (dokončený, rozpracovaný, jednorázově upravený) – nový výskyt by je zdvojil.
  const covered = new Map<string, ControlRun>();
  for (const r of p.runs) {
    if (r.IsSuperseded || cancelledIds.has(r.RunId) || r.WorkflowState === 'Cancelled') continue;
    covered.set(`${r.PeriodFrom}|${r.PeriodTo}`, r);
  }
  const usedCodes = new Set(p.runs.filter((r) => !r.IsSuperseded && !cancelledIds.has(r.RunId)).map((r) => r.RunCode));
  const control = { ...p.control, Department: department, Category: category };
  for (const occ of newOccs) {
    if (affectedKeys.has(occ.occurrenceKey)) continue;
    const cover = covered.get(`${occ.periodFrom}|${occ.periodTo}`);
    if (cover && cover.OccurrenceKey !== occ.occurrenceKey && !(cover.WorkflowState === 'Planned' && !cover.IsOneTimeOverride && cover.NominalDate >= p.effectiveFrom)) {
      counts.skipCovered++;
      rows.push({
        action: 'skipCovered',
        runId: null,
        runCode: cover.RunCode,
        occurrenceKey: occ.occurrenceKey,
        state: null,
        oldScheduled: null,
        oldDue: null,
        newScheduled: occ.scheduledDate,
        newDue: occ.dueDate,
        oldOwner: null,
        newOwner: null,
        oldReviewer: null,
        newReviewer: null,
        changed: false,
        note: `Období ${occ.periodFrom} – ${occ.periodTo} již pokrývá běh ${cover.RunCode} – nový výskyt se nevytvoří.`,
      });
      continue;
    }
    const run = newRunFromOccurrence(control, newVersion, occ, p.now, p.actor);
    run.RunCode = uniqueRunCode(occ.runCode, usedCodes);
    usedCodes.add(run.RunCode);
    runCreates.push(run);
    counts.create++;
    rows.push({
      action: 'create',
      runId: null,
      runCode: run.RunCode,
      occurrenceKey: occ.occurrenceKey,
      state: null,
      oldScheduled: null,
      oldDue: null,
      newScheduled: occ.scheduledDate,
      newDue: occ.dueDate,
      oldOwner: null,
      newOwner: newVersion.PrimaryOwnerEmail,
      oldReviewer: null,
      newReviewer: newVersion.ReviewerEmail,
      changed: true,
      note: 'Nový výskyt podle nové verze.',
    });
  }

  if (counts.keepConflict > 0)
    warnings.push(
      `${counts.keepConflict} rozpracovaných nebo jednorázově upravených výskytů zůstane beze změny na původní verzi. Zkontrolujte je po uložení.`,
    );

  rows.sort((a, b) => (a.newScheduled ?? a.oldScheduled ?? '').localeCompare(b.newScheduled ?? b.oldScheduled ?? ''));

  return {
    newVersion,
    previousVersion: prev,
    previousVersionEffectiveTo: prev ? addDays(p.effectiveFrom, -1) : null,
    controlPatch: {
      Name: newVersion.ControlName,
      Category: category,
      Department: department,
      CurrentVersionId: newVersion.VersionId,
      CurrentVersionNumber: newVersion.VersionNumber,
      OwnerEmail: newVersion.PrimaryOwnerEmail,
      RiskLevel: newVersion.RiskLevel,
      RecurrenceType: newVersion.RecurrenceType,
      ModifiedAt: p.now,
      ModifiedBy: p.actor,
    },
    runUpdates,
    runCreates,
    rows,
    counts,
    warnings,
    errors,
  };
}

// ---------------------------------------------------------------------------------------------
// Archivace
// ---------------------------------------------------------------------------------------------

export interface ArchivePlan {
  toCancel: ControlRun[];
  remainOpen: ControlRun[];
}

/** Naplánované budoucí běhy se zruší (klíč uvolněn pro případnou reaktivaci). Rozpracované zůstávají. */
export function planArchive(runs: ControlRun[], today: ISODate): ArchivePlan {
  const live = runs.filter((r) => !r.IsSuperseded && r.WorkflowState !== 'Completed' && r.WorkflowState !== 'Cancelled');
  return {
    toCancel: live.filter((r) => r.WorkflowState === 'Planned' && r.DueDate >= today),
    remainOpen: live.filter((r) => !(r.WorkflowState === 'Planned' && r.DueDate >= today)),
  };
}
