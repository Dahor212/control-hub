import { describe, expect, it } from 'vitest';
import { planGeneration, planVersionChange, planArchive } from '../src/domain/versioning';
import { computeTiming, runAsOf } from '../src/domain/status';
import { computeKpis, monthPeriod } from '../src/domain/metrics';
import { evaluateDeadlineNotifications } from '../src/domain/notifications';
import { validateSubmission } from '../src/domain/workflow';
import { canReview, type Session } from '../src/domain/permissions';
import type { Control, ControlRun } from '../src/domain/types';
import { DEFAULT_SETTINGS } from '../src/data/store';
import { DIRECTORY, LOOKUPS } from '../src/data/seedCatalog';
import { U, draft, versionFrom } from './helpers';

const control: Control = {
  ControlId: 'c1',
  ControlCode: 'CTRL-9001',
  Name: 'Testovací kontrola',
  Category: 'PLATBY',
  Department: 'PRI',
  IsActive: true,
  CreatedAt: '2026-11-01T08:00:00.000Z',
  CreatedBy: U.coord,
  ArchivedAt: null,
  ArchiveReason: null,
  CurrentVersionId: 'v1',
  CurrentVersionNumber: 1,
  OwnerEmail: U.jana,
  RiskLevel: 'High',
  RecurrenceType: 'Monthly',
  ModifiedAt: '2026-11-01T08:00:00.000Z',
  ModifiedBy: U.coord,
  RowVersion: 1,
};
const v1 = versionFrom(draft({ RecurrenceSettings: { ...draft().RecurrenceSettings, startDate: '2026-01-01' } }));

function generate(): ControlRun[] {
  return planGeneration({ control, versions: [v1], runs: [], from: '2026-01-01', to: '2026-12-31', now: '2026-01-01T00:00:00Z', actor: U.coord }).creates;
}

describe('generování výskytů (FLOW-01)', () => {
  it('vytvoří samostatné běhy a je idempotentní', () => {
    const runs = generate();
    expect(runs).toHaveLength(12);
    const again = planGeneration({ control, versions: [v1], runs, from: '2026-01-01', to: '2026-12-31', now: 'x', actor: U.coord });
    expect(again.creates).toHaveLength(0);
    expect(again.skippedExisting).toBe(12);
    expect(new Set(runs.map((r) => r.OccurrenceKey)).size).toBe(12);
    expect(new Set(runs.map((r) => r.RunId)).size).toBe(12);
  });
  it('doplní jen chybějící výskyty při prodloužení horizontu', () => {
    const runs = generate();
    const more = planGeneration({ control, versions: [v1], runs, from: '2026-01-01', to: '2027-03-31', now: 'x', actor: U.coord });
    expect(more.creates.map((r) => r.NominalDate)).toEqual(['2027-01-10', '2027-02-10', '2027-03-10']);
  });
  it('neaktivní kontrola negeneruje', () => {
    expect(planGeneration({ control: { ...control, IsActive: false }, versions: [v1], runs: [], from: '2026-01-01', to: '2026-12-31', now: 'x', actor: U.coord }).creates).toHaveLength(0);
  });
});

describe('změna „tento a všechny následující“', () => {
  const setup = () => {
    const runs = generate();
    const byMonth = (m: string) => runs.find((r) => r.NominalDate.startsWith(m))!;
    const done = byMonth('2026-09');
    Object.assign(done, { WorkflowState: 'Completed', IsOpen: false, SubmittedAt: '2026-09-11T09:00:00Z', CompletedAt: '2026-09-12T09:00:00Z', CompletedBy: U.jana, ApprovedBy: U.headPRI });
    const inprog = byMonth('2026-11');
    Object.assign(inprog, { WorkflowState: 'InProgress', StartedAt: '2026-11-10T08:00:00Z' });
    const overridden = byMonth('2026-12');
    Object.assign(overridden, { IsOneTimeOverride: true, DueDate: '2026-12-18' });
    return { runs, done, inprog, overridden };
  };

  it('vytvoří novou verzi, zachová historii a ukáže dopad', () => {
    const { runs, done, inprog, overridden } = setup();
    const plan = planVersionChange({
      control,
      versions: [v1],
      runs,
      draft: { ...draft(), RecurrenceSettings: { ...v1.RecurrenceSettings, dayOfMonth: 20 }, PrimaryOwnerEmail: U.veronika, BackupOwnerEmail: U.jana },
      effectiveFrom: '2026-09-01',
      reason: 'Změna metodiky',
      today: '2026-11-20',
      horizon: '2026-12-31',
      now: '2026-11-20T10:00:00Z',
      actor: U.coord,
    });
    expect(plan.errors).toEqual([]);
    expect(plan.newVersion.VersionNumber).toBe(2);
    expect(plan.previousVersionEffectiveTo).toBe('2026-08-31');
    // dokončený běh se nemění
    expect(plan.rows.find((r) => r.runId === done.RunId)?.action).toBe('unchanged');
    expect(plan.runUpdates.some((u) => u.runId === done.RunId)).toBe(false);
    // rozpracovaný = konflikt, beze změny
    expect(plan.rows.find((r) => r.runId === inprog.RunId)?.action).toBe('keepConflict');
    // jednorázově upravený výskyt (10. 12.) už podle nového pravidla (20. den) neexistuje → ponechán jako konflikt
    expect(plan.rows.find((r) => r.runId === overridden.RunId)?.action).toBe('keepConflict');
    // říjen (Planned, 10. den) → nahrazen; vznikne nový výskyt 20. 10.
    expect(plan.counts.cancel).toBe(1);
    // září, listopad a prosinec: období už pokrývá dokončený / rozpracovaný / upravený běh → bez zdvojení
    expect(plan.counts.skipCovered).toBe(3);
    expect(plan.runCreates.map((r) => r.NominalDate)).toEqual(['2026-10-20']);
    expect(plan.runCreates.every((r) => r.AssignedOwnerEmail === U.veronika && r.VersionNumber === 2)).toBe(true);
    const cancel = plan.runUpdates.find((u) => u.patch.WorkflowState === 'Cancelled')!;
    expect(cancel.patch.IsSuperseded).toBe(true);
    expect(cancel.patch.OccurrenceKey).toMatch(/#S-/);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('změna osob bez změny plánu aktualizuje plánované výskyty na místě', () => {
    const { runs } = setup();
    const plan = planVersionChange({
      control,
      versions: [v1],
      runs,
      draft: { ...draft(), RecurrenceSettings: v1.RecurrenceSettings, PrimaryOwnerEmail: U.veronika, BackupOwnerEmail: U.jana },
      effectiveFrom: '2026-10-01',
      reason: 'Změna odpovědnosti',
      today: '2026-11-20',
      horizon: '2026-12-31',
      now: 'x',
      actor: U.coord,
    });
    expect(plan.counts.cancel).toBe(0);
    expect(plan.counts.create).toBe(0);
    expect(plan.counts.update).toBe(1); // říjen; listopad rozpracován, prosinec jednorázová úprava
    expect(plan.counts.keepOverride).toBe(1);
    const update = plan.runUpdates.find((u) => u.patch.AssignedOwnerEmail)!;
    expect(update.patch.AssignedOwnerEmail).toBe(U.veronika);
  });

  it('vyžaduje důvod a validní data', () => {
    const plan = planVersionChange({ control, versions: [v1], runs: [], draft: { ...draft(), ReviewerEmail: U.jana }, effectiveFrom: '2025-01-01', reason: '', today: '2026-11-20', horizon: '2026-12-31', now: 'x', actor: U.coord });
    expect(plan.errors.join(' ')).toMatch(/důvod/i);
    expect(plan.errors.join(' ')).toMatch(/čtyř očí/);
    expect(plan.errors.join(' ')).toMatch(/nesmí předcházet/);
  });

  it('archivace zruší jen budoucí naplánované běhy', () => {
    const { runs } = setup();
    const p = planArchive(runs, '2026-11-20');
    expect(p.toCancel.every((r) => r.WorkflowState === 'Planned' && r.DueDate >= '2026-11-20')).toBe(true);
    expect(p.remainOpen.some((r) => r.WorkflowState === 'InProgress')).toBe(true);
  });
});

describe('odvozené stavy a KPI', () => {
  const runs = generate();
  it('po termínu / blíží se / dokončeno pozdě', () => {
    const r = { ...runs[10], ScheduledDate: '2026-11-10', DueDate: '2026-11-13' };
    expect(computeTiming(r, '2026-11-20').status).toBe('Overdue');
    expect(computeTiming(r, '2026-11-20').daysLate).toBe(7);
    expect(computeTiming(r, '2026-11-11').status).toBe('DueSoon');
    expect(computeTiming(r, '2026-11-13').status).toBe('DueToday');
    const late = { ...r, WorkflowState: 'Completed' as const, SubmittedAt: '2026-11-15T10:00:00Z', CompletedAt: '2026-11-16T10:00:00Z' };
    expect(computeTiming(late, '2026-11-20').status).toBe('Late');
    // včasnost rozhoduje datum odeslání, ne schválení
    const onTime = { ...late, SubmittedAt: '2026-11-13T21:00:00Z' }; // 22:00 v Praze = stále 13. 11.
    expect(computeTiming(onTime, '2026-11-20').status).toBe('OnTime');
  });
  it('míra včasného plnění nezapočítává zrušené a nevypršelé', () => {
    const mk = (i: number, patch: Partial<ControlRun>): ControlRun => ({ ...runs[0], RunId: `r${i}`, OccurrenceKey: `k${i}`, ScheduledDate: '2026-11-02', DueDate: '2026-11-05', DueMonthKey: '2026-11', ...patch });
    const set = [
      mk(1, { WorkflowState: 'Completed', SubmittedAt: '2026-11-04T10:00:00Z', CompletedAt: '2026-11-04T10:00:00Z' }),
      mk(2, { WorkflowState: 'Completed', SubmittedAt: '2026-11-07T10:00:00Z', CompletedAt: '2026-11-07T10:00:00Z' }),
      mk(3, { WorkflowState: 'Planned' }),
      mk(4, { WorkflowState: 'Cancelled' }),
      mk(5, { WorkflowState: 'Planned', DueDate: '2026-11-28' }),
      mk(6, { WorkflowState: 'Submitted', SubmittedAt: '2026-11-05T10:00:00Z' }),
    ];
    const k = computeKpis(set, monthPeriod('2026-11'), '2026-11-20');
    expect(k.planned).toBe(5);
    expect(k.cancelled).toBe(1);
    expect(k.completed).toBe(2);
    expect(k.onTime).toBe(1);
    expect(k.late).toBe(1);
    expect(k.overdueOpen).toBe(1);
    expect(k.pendingApproval).toBe(1);
    expect(k.evaluable).toBe(4); // 2 dokončené + 1 po termínu + 1 odeslaný po termínu; r5 má termín v budoucnu
    expect(k.onTimeRate).toBeCloseTo(0.25);
    expect(k.completionRate).toBeCloseTo(0.4);
    expect(k.avgDelayDays).toBe(2);
    expect(k.completedDuringPeriod).toBe(2);
  });
  it('rekonstrukce stavu k datu (snapshot reportu)', () => {
    const r: ControlRun = { ...runs[0], WorkflowState: 'Completed', StartedAt: '2026-01-09T08:00:00Z', SubmittedAt: '2026-01-12T09:00:00Z', CompletedAt: '2026-01-14T09:00:00Z' };
    expect(runAsOf(r, '2026-01-10').WorkflowState).toBe('InProgress');
    expect(runAsOf(r, '2026-01-13').WorkflowState).toBe('Submitted');
    expect(runAsOf(r, '2026-01-15').WorkflowState).toBe('Completed');
  });
});

describe('upozornění a eskalace', () => {
  const runs = generate();
  const ctx = (rs: ControlRun[], today: string, keys = new Set<string>()) =>
    evaluateDeadlineNotifications({
      runs: rs,
      versionsById: new Map([[v1.VersionId, v1]]),
      today,
      settings: { ...DEFAULT_SETTINGS, coordinatorEmail: U.coord },
      departments: LOOKUPS,
      directory: new Map(DIRECTORY.map((u) => [u.Email, u])),
      existingKeys: keys,
    });
  const r = { ...runs[10], ScheduledDate: '2026-11-10', DueDate: '2026-11-13' };

  it('připomínka 3 dny před termínem a zabránění duplicitě', () => {
    const first = ctx([r], '2026-11-10');
    expect(first.candidates).toHaveLength(1);
    expect(first.candidates[0].type).toBe('DueReminder');
    expect(first.candidates[0].dedupKey).toContain('|DueReminder|3|');
    const keys = new Set(first.candidates.map((c) => c.dedupKey));
    const second = ctx([r], '2026-11-10', keys);
    expect(second.candidates).toHaveLength(0);
    expect(second.duplicates).toHaveLength(1);
    // následující den (2 dny do termínu) je nejbližší pravidlo stále „3 dny“ → nic nového
    expect(ctx([r], '2026-11-11', keys).candidates).toHaveLength(0);
    expect(ctx([r], '2026-11-12', keys).candidates[0].dedupKey).toContain('|DueReminder|1|');
  });
  it('po termínu a eskalace vedoucímu i koordinátorovi', () => {
    const res = ctx([r], '2026-11-20'); // 7 dní po termínu
    const types = res.candidates.map((c) => `${c.type}:${c.recipient}`);
    expect(types).toContain(`Overdue:${U.jana}`);
    expect(res.candidates.find((c) => c.type === 'Overdue')!.dedupKey).toContain('|Overdue|7|');
    expect(types).toContain(`Escalation:${U.headPRI}`);
    expect(types).toContain(`Escalation:${U.coord}`);
  });
  it('po dokončení se neposílá nic', () => {
    const done = { ...r, WorkflowState: 'Completed' as const, IsOpen: false, CompletedAt: '2026-11-14T10:00:00Z', SubmittedAt: '2026-11-14T10:00:00Z' };
    expect(ctx([done], '2026-11-20').candidates).toHaveLength(0);
  });
  it('čekající schválení po 2 dnech upozorní schvalovatele', () => {
    const sub = { ...r, WorkflowState: 'Submitted' as const, SubmittedAt: '2026-11-12T10:00:00Z', CompletedBy: U.jana };
    const res = ctx([sub], '2026-11-14');
    expect(res.candidates[0].type).toBe('ApprovalPending');
    expect(res.candidates[0].recipient).toBe(U.headPRI);
  });
});

describe('workflow a princip čtyř očí', () => {
  const runs = generate();
  it('validace odeslání (povinné kroky, přílohy, zjištění)', () => {
    const run: ControlRun = { ...runs[0], WorkflowState: 'InProgress', Result: 'WithFindings', ResultComment: '' };
    const res = validateSubmission(run, v1, [], []);
    expect(res.errors.join(' ')).toMatch(/povinné kontrolní kroky/);
    expect(res.errors.join(' ')).toMatch(/je komentář povinný/);
    expect(res.errors.join(' ')).toMatch(/alespoň jedno zjištění/);
    expect(res.missingEvidence).toEqual(['Výpis']);
  });
  it('schvalovatel nesmí schválit vlastní provedení', () => {
    const run: ControlRun = { ...runs[0], WorkflowState: 'Submitted', CompletedBy: U.headPRI, ReviewerEmail: U.headPRI };
    const s: Session = { user: DIRECTORY.find((u) => u.Email === U.headPRI)!, activeRole: 'Reviewer', assignments: [] };
    expect(canReview(s, run).allowed).toBe(false);
    expect(canReview(s, { ...run, CompletedBy: U.jana }).allowed).toBe(true);
  });
});
