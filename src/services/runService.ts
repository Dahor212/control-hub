/**
 * Operace nad běhy kontrol (IC_ControlRuns).
 * Každá operace: kontrola oprávnění → validace → zápis s kontrolou RowVersion → audit → upozornění.
 * Referenční ID akcí (completeControlRun apod.) odpovídají registru v src/powerapps/refRegistry.ts.
 */
import { addDays, diffDays, isValidISODate, monthKey } from '../domain/dates';
import { canCancel, canCorrect, canExecute, canReschedule, canReview } from '../domain/permissions';
import { canTransition, targetState, validateSubmission } from '../domain/workflow';
import { dedupKey } from '../domain/notifications';
import { RESULT_LABELS } from '../domain/labels';
import type { ChecklistResult, ControlRun, Email, RunResult } from '../domain/types';
import { ServiceError, audit, displayName, ensure, fieldChanges, nowIso, today, type ServiceContext } from './core';
import { cancelPendingForRun, notifyEvent } from './notificationService';
import { createProtocolForRun } from './documentService';

function getRun(ctx: ServiceContext, runId: string): ControlRun {
  const run = ctx.store.runs.get(runId);
  if (!run) throw new ServiceError('Běh kontroly nebyl nalezen.');
  return run;
}

function fmt(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return `${day}. ${m}. ${y}`;
}

export interface ExecutionData {
  ChecklistResults: ChecklistResult[];
  Result: RunResult | null;
  ResultComment: string;
  ExceptionReason: string;
}

/** startControlRun */
export async function startRun(ctx: ServiceContext, runId: string, expectedRowVersion: number) {
  const run = getRun(ctx, runId);
  ensure(canExecute(ctx.session, run));
  if (!canTransition(run.WorkflowState, 'start')) throw new ServiceError('Běh již byl zahájen.');
  const now = nowIso(ctx.store);
  const next = await ctx.store.runs.update(
    runId,
    { WorkflowState: 'InProgress', IsOpen: true, StartedAt: run.StartedAt ?? now, ModifiedAt: now, ModifiedBy: ctx.session.user.Email },
    { expectedRowVersion },
  );
  await audit(ctx, { EntityType: 'ControlRun', EntityId: runId, ControlId: run.ControlId, Action: 'Zahájení provedení', FieldName: 'WorkflowState', OldValue: run.WorkflowState, NewValue: 'InProgress' });
  return next;
}

/** saveControlRunDraft */
export async function saveRunDraft(ctx: ServiceContext, runId: string, expectedRowVersion: number, data: ExecutionData) {
  const run = getRun(ctx, runId);
  ensure(canExecute(ctx.session, run));
  if (!canTransition(run.WorkflowState, 'save')) throw new ServiceError('Nejprve zahajte provedení kontroly.');
  const now = nowIso(ctx.store);
  const patch: Partial<ControlRun> = { ...data, ModifiedAt: now, ModifiedBy: ctx.session.user.Email };
  const next = await ctx.store.runs.update(runId, patch, { expectedRowVersion });
  const entries = fieldChanges(ctx, { EntityType: 'ControlRun', EntityId: runId, ControlId: run.ControlId, Action: 'Uložení rozpracovaného provedení' }, run, patch, ['Result', 'ResultComment', 'ExceptionReason']);
  const answered = data.ChecklistResults.filter((c) => c.answer).length;
  const prevAnswered = run.ChecklistResults.filter((c) => c.answer).length;
  if (answered !== prevAnswered || JSON.stringify(data.ChecklistResults) !== JSON.stringify(run.ChecklistResults))
    entries.push(
      ...fieldChanges(ctx, { EntityType: 'ControlRun', EntityId: runId, ControlId: run.ControlId, Action: 'Uložení rozpracovaného provedení' }, { ChecklistResults: `${prevAnswered}/${run.ChecklistResults.length} vyplněno` }, { ChecklistResults: `${answered}/${data.ChecklistResults.length} vyplněno` }, ['ChecklistResults']),
    );
  await ctx.store.audit.appendMany(entries);
  return next;
}

/** submitControlRun / completeControlRun – podle ApprovalRequired. */
export async function submitRun(ctx: ServiceContext, runId: string, expectedRowVersion: number, data: ExecutionData) {
  const store = ctx.store;
  const run = getRun(ctx, runId);
  ensure(canExecute(ctx.session, run));
  if (!canTransition(run.WorkflowState, 'submit')) throw new ServiceError('Běh nelze v aktuálním stavu odeslat.');
  const version = store.versions.get(run.VersionId);
  if (!version) throw new ServiceError('Verze definice kontroly nebyla nalezena.');
  const candidate: ControlRun = { ...run, ...data };
  const check = validateSubmission(candidate, version, store.documents.all() as never, store.findings.all() as never);
  if (check.errors.length) throw new ServiceError('Kontrolu nelze odeslat – doplňte povinné údaje.', check.errors);
  if (run.ApprovalRequired && run.ReviewerEmail === ctx.session.user.Email)
    throw new ServiceError('Princip čtyř očí: jste zároveň určeným schvalovatelem. Požádejte koordinátora o změnu schvalovatele.');

  const now = nowIso(store);
  const to = targetState(run, 'submit');
  // Řízená oprava nemění datum provedení pro účely včasnosti.
  const submittedAt = run.IsCorrection && run.SubmittedAt ? run.SubmittedAt : now;
  const patch: Partial<ControlRun> = {
    ...data,
    WorkflowState: to,
    IsOpen: to !== 'Completed',
    StartedAt: run.StartedAt ?? now,
    SubmittedAt: submittedAt,
    CompletedBy: ctx.session.user.Email,
    CompletedAt: to === 'Completed' ? now : null,
    ModifiedAt: now,
    ModifiedBy: ctx.session.user.Email,
  };
  const next = await store.runs.update(runId, patch, { expectedRowVersion });
  await store.audit.appendMany([
    ...fieldChanges(ctx, { EntityType: 'ControlRun', EntityId: runId, ControlId: run.ControlId, Action: to === 'Completed' ? 'Dokončení kontroly' : 'Odeslání ke schválení' }, run, patch, ['WorkflowState', 'Result', 'ResultComment', 'ExceptionReason', 'CompletedBy']),
  ]);
  if (to === 'Submitted') {
    await notifyEvent(ctx, {
      type: 'ApprovalRequest',
      runId,
      controlId: run.ControlId,
      recipient: run.ReviewerEmail ?? '',
      subject: `Ke schválení: ${run.ControlCode} ${run.ControlName} (${run.RunCode})`,
      body: `${displayName(store, ctx.session.user.Email)} odeslal(a) kontrolu ke schválení. Výsledek: ${data.Result ? RESULT_LABELS[data.Result] : '—'}.`,
      reason: 'Událost: odeslání ke schválení (FLOW-06 / schvalovací upozornění).',
      dedupKey: dedupKey([runId, 'ApprovalRequest', run.ReturnCount + 1, run.ReviewerEmail ?? '']),
    });
  } else {
    await cancelPendingForRun(ctx, runId);
    await createProtocolForRun(ctx, runId, run.IsCorrection ? run.ExceptionReason || 'Řízená oprava' : null);
  }
  return store.runs.get(runId) ?? next;
}

/** approveControlRun */
export async function approveRun(ctx: ServiceContext, runId: string, expectedRowVersion: number, comment: string) {
  const store = ctx.store;
  const run = getRun(ctx, runId);
  ensure(canReview(ctx.session, run));
  const now = nowIso(store);
  const patch: Partial<ControlRun> = {
    WorkflowState: 'Completed',
    IsOpen: false,
    ApprovedAt: now,
    ApprovedBy: ctx.session.user.Email,
    CompletedAt: now,
    ModifiedAt: now,
    ModifiedBy: ctx.session.user.Email,
  };
  await store.runs.update(runId, patch, { expectedRowVersion });
  await audit(ctx, { EntityType: 'ControlRun', EntityId: runId, ControlId: run.ControlId, Action: 'Schválení kontroly', FieldName: 'WorkflowState', OldValue: 'Submitted', NewValue: 'Completed', ChangeReason: comment || null });
  await notifyEvent(ctx, {
    type: 'Approved',
    runId,
    controlId: run.ControlId,
    recipient: run.CompletedBy ?? run.AssignedOwnerEmail,
    subject: `Schváleno: ${run.ControlCode} (${run.RunCode})`,
    body: `Kontrolu schválil(a) ${displayName(store, ctx.session.user.Email)}.${comment ? ` Komentář: ${comment}` : ''}`,
    reason: 'Událost: finální schválení.',
    dedupKey: dedupKey([runId, 'Approved', run.ReturnCount, now]),
  });
  await cancelPendingForRun(ctx, runId);
  await createProtocolForRun(ctx, runId, run.IsCorrection ? run.ExceptionReason || 'Řízená oprava' : null);
  return store.runs.get(runId) as ControlRun;
}

/** returnControlRun */
export async function returnRun(ctx: ServiceContext, runId: string, expectedRowVersion: number, comment: string) {
  const store = ctx.store;
  const run = getRun(ctx, runId);
  ensure(canReview(ctx.session, run));
  if (!comment.trim()) throw new ServiceError('Uveďte, co je potřeba doplnit.');
  const now = nowIso(store);
  await store.runs.update(
    runId,
    { WorkflowState: 'Returned', IsOpen: true, ReturnCount: run.ReturnCount + 1, ReturnComment: comment.trim(), ModifiedAt: now, ModifiedBy: ctx.session.user.Email },
    { expectedRowVersion },
  );
  await audit(ctx, { EntityType: 'ControlRun', EntityId: runId, ControlId: run.ControlId, Action: 'Vrácení k doplnění', FieldName: 'WorkflowState', OldValue: 'Submitted', NewValue: 'Returned', ChangeReason: comment });
  await notifyEvent(ctx, {
    type: 'Returned',
    runId,
    controlId: run.ControlId,
    recipient: run.CompletedBy ?? run.AssignedOwnerEmail,
    subject: `Vráceno k doplnění: ${run.ControlCode} (${run.RunCode})`,
    body: `Schvalovatel ${displayName(store, ctx.session.user.Email)} vrátil kontrolu: ${comment.trim()}`,
    reason: 'Událost: vrácení k doplnění.',
    dedupKey: dedupKey([runId, 'Returned', run.ReturnCount + 1]),
  });
  return store.runs.get(runId) as ControlRun;
}

/** cancelControlRun */
export async function cancelRun(ctx: ServiceContext, runId: string, expectedRowVersion: number, reason: string) {
  const run = getRun(ctx, runId);
  ensure(canCancel(ctx.session, run));
  if (!reason.trim()) throw new ServiceError('Důvod zrušení je povinný.');
  const now = nowIso(ctx.store);
  await ctx.store.runs.update(runId, { WorkflowState: 'Cancelled', IsOpen: false, ExceptionReason: reason.trim(), ModifiedAt: now, ModifiedBy: ctx.session.user.Email }, { expectedRowVersion });
  await audit(ctx, { EntityType: 'ControlRun', EntityId: runId, ControlId: run.ControlId, Action: 'Zrušení běhu', FieldName: 'WorkflowState', OldValue: run.WorkflowState, NewValue: 'Cancelled', ChangeReason: reason });
  await cancelPendingForRun(ctx, runId);
}

export interface OneTimeChanges {
  ScheduledDate?: string;
  DueDate?: string;
  AssignedOwnerEmail?: Email;
  BackupOwnerEmail?: Email | null;
  ReviewerEmail?: Email | null;
  OverrideNote?: string;
}

export function validateOneTimeChanges(run: ControlRun, ch: OneTimeChanges, reason: string): string[] {
  const errors: string[] = [];
  const scheduled = ch.ScheduledDate ?? run.ScheduledDate;
  const due = ch.DueDate ?? run.DueDate;
  if (!isValidISODate(scheduled) || !isValidISODate(due)) errors.push('Zadejte platná data.');
  else if (due < scheduled) errors.push('Termín splnění nesmí předcházet plánovanému datu.');
  else if (diffDays(scheduled, due) > 180) errors.push('Termín splnění může být nejvýše 180 dní po plánovaném datu.');
  const owner = ch.AssignedOwnerEmail ?? run.AssignedOwnerEmail;
  const reviewer = ch.ReviewerEmail === undefined ? run.ReviewerEmail : ch.ReviewerEmail;
  if (!owner) errors.push('Odpovědná osoba je povinná.');
  if (run.ApprovalRequired && !reviewer) errors.push('Schvalovatel je povinný.');
  if (run.ApprovalRequired && reviewer && reviewer === owner) errors.push('Princip čtyř očí: schvalovatel musí být jiná osoba než odpovědná osoba.');
  if (!reason.trim()) errors.push('Důvod změny je povinný.');
  return errors;
}

/** overrideControlRun – „Upravit pouze tento výskyt“. */
export async function overrideRun(ctx: ServiceContext, runId: string, expectedRowVersion: number, changes: OneTimeChanges, reason: string) {
  const store = ctx.store;
  const run = getRun(ctx, runId);
  ensure(canReschedule(ctx.session, run));
  const errors = validateOneTimeChanges(run, changes, reason);
  if (errors.length) throw new ServiceError('Změnu nelze uložit.', errors);
  const now = nowIso(store);
  const patch: Partial<ControlRun> = { ...changes, IsOneTimeOverride: true, ModifiedAt: now, ModifiedBy: ctx.session.user.Email };
  if (changes.DueDate) patch.DueMonthKey = monthKey(changes.DueDate);
  await store.runs.update(runId, patch, { expectedRowVersion });
  const entries = fieldChanges(ctx, { EntityType: 'ControlRun', EntityId: runId, ControlId: run.ControlId, Action: 'Jednorázová úprava výskytu', ChangeReason: reason }, run, patch, [
    'ScheduledDate',
    'DueDate',
    'AssignedOwnerEmail',
    'BackupOwnerEmail',
    'ReviewerEmail',
    'OverrideNote',
  ]);
  await store.audit.appendMany(entries);
  const label = `${run.ControlCode} ${run.ControlName} (${run.RunCode})`;
  if (changes.AssignedOwnerEmail && changes.AssignedOwnerEmail !== run.AssignedOwnerEmail) {
    await notifyEvent(ctx, {
      type: 'Assignment',
      runId,
      controlId: run.ControlId,
      recipient: changes.AssignedOwnerEmail,
      subject: `Byla vám přidělena kontrola ${run.ControlCode}`,
      body: `Kontrola ${label} s termínem ${fmt(changes.DueDate ?? run.DueDate)} vám byla přidělena. Důvod: ${reason}`,
      reason: 'Událost: změna odpovědné osoby jednoho výskytu (FLOW-06).',
      dedupKey: dedupKey([runId, 'Assignment', changes.AssignedOwnerEmail, now]),
    });
  } else if ((changes.DueDate && changes.DueDate !== run.DueDate) || (changes.ScheduledDate && changes.ScheduledDate !== run.ScheduledDate)) {
    await notifyEvent(ctx, {
      type: 'AssignmentChange',
      runId,
      controlId: run.ControlId,
      recipient: run.AssignedOwnerEmail,
      subject: `Změna termínu kontroly ${run.ControlCode}`,
      body: `Termín kontroly ${label} byl změněn z ${fmt(run.DueDate)} na ${fmt(changes.DueDate ?? run.DueDate)}. Důvod: ${reason}`,
      reason: 'Událost: změna termínu jednoho výskytu (FLOW-06).',
      dedupKey: dedupKey([runId, 'AssignmentChange', changes.DueDate ?? run.DueDate, now]),
    });
  }
}

/** reopenControlRunForCorrection – řízená oprava uzavřeného záznamu. */
export async function reopenForCorrection(ctx: ServiceContext, runId: string, expectedRowVersion: number, reason: string) {
  const run = getRun(ctx, runId);
  ensure(canCorrect(ctx.session, run));
  if (reason.trim().length < 10) throw new ServiceError('Popište důvod opravy (alespoň 10 znaků).');
  const now = nowIso(ctx.store);
  await ctx.store.runs.update(
    runId,
    {
      WorkflowState: 'InProgress',
      IsOpen: true,
      IsCorrection: true,
      ExceptionReason: `Řízená oprava: ${reason.trim()}`,
      CompletedAt: null,
      ApprovedAt: null,
      ApprovedBy: null,
      ModifiedAt: now,
      ModifiedBy: ctx.session.user.Email,
    },
    { expectedRowVersion },
  );
  await audit(ctx, { EntityType: 'ControlRun', EntityId: runId, ControlId: run.ControlId, Action: 'Zahájení řízené opravy uzavřeného záznamu', FieldName: 'WorkflowState', OldValue: 'Completed', NewValue: 'InProgress', ChangeReason: reason });
  await notifyEvent(ctx, {
    type: 'AssignmentChange',
    runId,
    controlId: run.ControlId,
    recipient: run.AssignedOwnerEmail,
    subject: `Řízená oprava kontroly ${run.ControlCode} (${run.RunCode})`,
    body: `Uzavřený běh byl otevřen k opravě. Důvod: ${reason.trim()}. Původní protokol zůstává archivován.`,
    reason: 'Událost: řízená oprava uzavřeného záznamu.',
    dedupKey: dedupKey([runId, 'Correction', now]),
  });
}

/** Výchozí termín pro „posunout o týden“ apod. – pomocník UI. */
export function suggestShift(run: ControlRun, days: number) {
  return { ScheduledDate: addDays(run.ScheduledDate, days), DueDate: addDays(run.DueDate, days) };
}

export function isRunEditableByOwner(run: ControlRun) {
  return run.WorkflowState === 'InProgress' || run.WorkflowState === 'Returned';
}

export function todayFor(ctx: ServiceContext) {
  return today(ctx.store);
}
