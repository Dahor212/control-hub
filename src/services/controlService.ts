/** Katalog kontrol, verze definic a generování výskytů (FLOW-01). */
import { addDays } from '../domain/dates';
import { newGuid, nextControlCode } from '../domain/ids';
import { dedupKey } from '../domain/notifications';
import { can } from '../domain/permissions';
import {
  horizonEnd,
  planArchive,
  planGeneration,
  planVersionChange,
  validateVersionDraft,
  latestVersion,
  type VersionChangePlan,
  type VersionDraft,
} from '../domain/versioning';
import { supersededKey } from '../domain/runFactory';
import type { Control, ControlRun, ControlVersion } from '../domain/types';
import { ConcurrencyError } from '../data/repository';
import { PermissionError, ServiceError, audit, calendar, displayName, fieldChanges, logAutomation, makeAudit, nowIso, today, type ServiceContext } from './core';
import { notifyEvent } from './notificationService';

function requireManage(ctx: ServiceContext) {
  if (!can(ctx.session, 'manageControls')) throw new PermissionError('Správu kontrol smí provádět Koordinátor nebo Administrátor.');
}

export interface NewControlInput {
  draft: VersionDraft;
  category: string;
  department: string;
}

export function validateNewControl(input: NewControlInput): string[] {
  const errors = validateVersionDraft(input.draft);
  if (!input.category) errors.push('Vyberte oblast (kategorii) kontroly.');
  if (!input.department) errors.push('Vyberte odpovědný útvar.');
  return errors;
}

/** createControl – IC_Controls + IC_ControlVersions (v1) + IC_ControlRuns na plánovací horizont. */
export async function createControl(ctx: ServiceContext, input: NewControlInput) {
  requireManage(ctx);
  const errors = validateNewControl(input);
  if (errors.length) throw new ServiceError('Kontrolu nelze uložit.', errors);
  const store = ctx.store;
  const now = nowIso(store);
  const actor = ctx.session.user.Email;
  const code = nextControlCode(store.controls.all().map((c) => c.ControlCode));
  const controlId = newGuid();
  const version: ControlVersion = {
    ...input.draft,
    VersionId: newGuid(),
    ControlId: controlId,
    ControlCode: code,
    VersionNumber: 1,
    EffectiveFrom: input.draft.RecurrenceSettings.startDate,
    EffectiveTo: null,
    CreatedAt: now,
    CreatedBy: actor,
    ChangeReason: 'Založení kontroly',
  };
  const control: Control = {
    ControlId: controlId,
    ControlCode: code,
    Name: version.ControlName,
    Category: input.category,
    Department: input.department,
    IsActive: true,
    CreatedAt: now,
    CreatedBy: actor,
    ArchivedAt: null,
    ArchiveReason: null,
    CurrentVersionId: version.VersionId,
    CurrentVersionNumber: 1,
    OwnerEmail: version.PrimaryOwnerEmail,
    RiskLevel: version.RiskLevel,
    RecurrenceType: version.RecurrenceType,
    ModifiedAt: now,
    ModifiedBy: actor,
    RowVersion: 1,
  };
  const horizon = horizonEnd(today(store), store.settings.get().planningHorizonMonths);
  const gen = planGeneration({ control, versions: [version], runs: [], from: version.EffectiveFrom, to: horizon, now, actor, cal: calendar(store) });

  await store.bus.batch(async () => {
    await store.controls.create(control);
    await store.versions.create(version);
    await store.runs.bulkPut(gen.creates);
    await store.audit.appendMany([
      makeAudit(ctx, { EntityType: 'Control', EntityId: controlId, ControlId: controlId, Action: 'Založení kontroly', FieldName: 'ControlCode', NewValue: code }),
      makeAudit(ctx, { EntityType: 'ControlVersion', EntityId: version.VersionId, ControlId: controlId, Action: 'Vytvoření verze v1', FieldName: 'EffectiveFrom', NewValue: version.EffectiveFrom }),
      makeAudit(ctx, { EntityType: 'ControlRun', EntityId: controlId, ControlId: controlId, Action: 'Vygenerování výskytů', FieldName: 'Count', NewValue: gen.creates.length }),
    ]);
    for (const email of [version.PrimaryOwnerEmail, version.BackupOwnerEmail].filter(Boolean) as string[]) {
      await notifyEvent(ctx, {
        type: 'Assignment',
        runId: null,
        controlId,
        recipient: email,
        subject: `Nově přidělená kontrola ${code} ${version.ControlName}`,
        body: `Byla vám přidělena kontrola ${code} (${email === version.PrimaryOwnerEmail ? 'odpovědná osoba' : 'zástupce'}). Naplánováno ${gen.creates.length} výskytů, první ${gen.creates[0]?.DueDate ?? '—'}.`,
        reason: 'Událost: založení kontroly (FLOW-06 AssignmentChangeNotification).',
        dedupKey: dedupKey([controlId, 'Assignment', 1, email]),
      });
    }
  });
  return { control, version, runsCreated: gen.creates.length };
}

export function previewDefinitionChange(
  ctx: ServiceContext,
  controlId: string,
  draft: VersionDraft,
  effectiveFrom: string,
  reason: string,
  category?: string,
  department?: string,
): VersionChangePlan {
  const store = ctx.store;
  const control = store.controls.get(controlId);
  if (!control) throw new ServiceError('Kontrola nebyla nalezena.');
  return planVersionChange({
    control,
    versions: store.versions.filter((v) => v.ControlId === controlId),
    runs: store.runs.filter((r) => r.ControlId === controlId),
    draft,
    category,
    department,
    effectiveFrom,
    reason,
    today: today(store),
    horizon: horizonEnd(today(store), store.settings.get().planningHorizonMonths),
    now: nowIso(store),
    actor: ctx.session.user.Email,
    cal: calendar(store),
  });
}

/** changeControlDefinition – „Upravit tento a všechny následující výskyty“. */
export async function applyDefinitionChange(ctx: ServiceContext, plan: VersionChangePlan, expectedControlRowVersion: number) {
  requireManage(ctx);
  if (plan.errors.length) throw new ServiceError('Změnu nelze uložit.', plan.errors);
  const store = ctx.store;
  const control = store.controls.get(plan.newVersion.ControlId);
  if (!control) throw new ServiceError('Kontrola nebyla nalezena.');
  if (!control.IsActive) throw new ServiceError('Archivovanou kontrolu nelze měnit. Nejprve ji reaktivujte.');
  // Kontrola souběžnosti před zápisem: nic z dotčeného se nesmělo mezitím změnit.
  if (control.RowVersion !== expectedControlRowVersion)
    throw new ConcurrencyError('IC_Controls', control.ControlId, expectedControlRowVersion, control.RowVersion, control.ModifiedBy);
  for (const u of plan.runUpdates) {
    const r = store.runs.get(u.runId);
    if (!r || r.RowVersion !== u.expectedRowVersion || r.WorkflowState !== 'Planned')
      throw new ServiceError('Některý z dotčených výskytů byl mezitím změněn. Otevřete náhled dopadu znovu.');
  }
  const prev = plan.previousVersion ? store.versions.get(plan.previousVersion.VersionId) : undefined;
  if (prev && latestVersion(store.versions.filter((v) => v.ControlId === control.ControlId))?.VersionId !== prev.VersionId)
    throw new ServiceError('Mezitím vznikla jiná verze definice. Otevřete náhled dopadu znovu.');

  const reason = plan.newVersion.ChangeReason;
  const base = { EntityType: 'ControlVersion' as const, EntityId: plan.newVersion.VersionId, ControlId: control.ControlId, Action: `Nová verze v${plan.newVersion.VersionNumber}`, ChangeReason: reason };
  const auditEntries = prev
    ? fieldChanges(ctx, base, prev, plan.newVersion, [
        'ControlName',
        'Description',
        'ControlObjective',
        'Instructions',
        'RiskLevel',
        'Priority',
        'PrimaryOwnerEmail',
        'BackupOwnerEmail',
        'ReviewerEmail',
        'RecurrenceType',
        'RecurrenceInterval',
        'RecurrenceSettings',
        'DueDateRule',
        'RequiredEvidence',
        'ChecklistDefinition',
        'ApprovalRequired',
        'ReminderPolicy',
      ])
    : [];
  auditEntries.push(
    makeAudit(ctx, { ...base, FieldName: 'EffectiveFrom', OldValue: prev?.EffectiveFrom, NewValue: plan.newVersion.EffectiveFrom }),
    makeAudit(ctx, {
      EntityType: 'ControlRun',
      EntityId: control.ControlId,
      ControlId: control.ControlId,
      Action: 'Přeplánování budoucích výskytů',
      FieldName: 'Impact',
      NewValue: `aktualizováno ${plan.counts.update}, nově ${plan.counts.create}, nahrazeno ${plan.counts.cancel}, konflikty ${plan.counts.keepConflict}, jednorázové úpravy zachovány ${plan.counts.keepOverride}`,
      ChangeReason: reason,
    }),
    ...fieldChanges(ctx, { EntityType: 'Control', EntityId: control.ControlId, ControlId: control.ControlId, Action: 'Aktualizace katalogu', ChangeReason: reason }, control, plan.controlPatch, ['Name', 'Category', 'Department', 'OwnerEmail', 'RiskLevel']),
  );

  await store.bus.batch(async () => {
    await store.versions.create(plan.newVersion);
    if (prev && plan.previousVersionEffectiveTo) await store.versions.update(prev.VersionId, { EffectiveTo: plan.previousVersionEffectiveTo });
    await store.controls.update(control.ControlId, plan.controlPatch, { expectedRowVersion: expectedControlRowVersion });
    for (const u of plan.runUpdates) await store.runs.update(u.runId, u.patch, { expectedRowVersion: u.expectedRowVersion });
    await store.runs.bulkPut(plan.runCreates);
    await store.audit.appendMany(auditEntries);
    // Upozornění na změnu přidělení (FLOW-06)
    const newOwners = new Map<string, number>();
    for (const row of plan.rows) if ((row.action === 'update' || row.action === 'create') && row.newOwner && row.newOwner !== row.oldOwner) newOwners.set(row.newOwner, (newOwners.get(row.newOwner) ?? 0) + 1);
    for (const [email, count] of newOwners)
      await notifyEvent(ctx, {
        type: 'Assignment',
        runId: null,
        controlId: control.ControlId,
        recipient: email,
        subject: `Přidělení kontroly ${control.ControlCode} od ${plan.newVersion.EffectiveFrom}`,
        body: `Od ${plan.newVersion.EffectiveFrom} odpovídáte za kontrolu ${control.ControlCode} ${plan.newVersion.ControlName} (${count} výskytů). Důvod: ${reason}`,
        reason: `Událost: nová verze v${plan.newVersion.VersionNumber} definice (FLOW-06).`,
        dedupKey: dedupKey([control.ControlId, 'Assignment', plan.newVersion.VersionNumber, email]),
      });
  });
}

/** Úprava zařazení kontroly bez nové verze plánu (útvar, oblast) – projeví se v otevřených bězích. */
export async function archiveControl(ctx: ServiceContext, controlId: string, reason: string, expectedRowVersion: number) {
  requireManage(ctx);
  const store = ctx.store;
  const control = store.controls.get(controlId);
  if (!control) throw new ServiceError('Kontrola nebyla nalezena.');
  if (!control.IsActive) throw new ServiceError('Kontrola je již archivována.');
  if (reason.trim().length < 5) throw new ServiceError('Uveďte důvod archivace.');
  const now = nowIso(store);
  const plan = planArchive(store.runs.filter((r) => r.ControlId === controlId), today(store));
  await store.bus.batch(async () => {
    await store.controls.update(controlId, { IsActive: false, ArchivedAt: now, ArchiveReason: reason.trim(), ModifiedAt: now, ModifiedBy: ctx.session.user.Email }, { expectedRowVersion });
    for (const r of plan.toCancel)
      await store.runs.update(r.RunId, {
        WorkflowState: 'Cancelled',
        IsOpen: false,
        IsSuperseded: true,
        OccurrenceKey: supersededKey(r),
        ExceptionReason: `Kontrola archivována: ${reason.trim()}`,
        ModifiedAt: now,
        ModifiedBy: ctx.session.user.Email,
      });
    await audit(ctx, { EntityType: 'Control', EntityId: controlId, ControlId: controlId, Action: 'Archivace kontroly', FieldName: 'IsActive', OldValue: true, NewValue: false, ChangeReason: `${reason.trim()} (zrušeno ${plan.toCancel.length} budoucích výskytů, ponecháno otevřených ${plan.remainOpen.length})` });
  });
  return plan;
}

export async function reactivateControl(ctx: ServiceContext, controlId: string, reason: string, expectedRowVersion: number) {
  requireManage(ctx);
  const store = ctx.store;
  const control = store.controls.get(controlId);
  if (!control) throw new ServiceError('Kontrola nebyla nalezena.');
  if (control.IsActive) throw new ServiceError('Kontrola je aktivní.');
  if (reason.trim().length < 5) throw new ServiceError('Uveďte důvod reaktivace.');
  const now = nowIso(store);
  await store.controls.update(controlId, { IsActive: true, ArchivedAt: null, ArchiveReason: null, ModifiedAt: now, ModifiedBy: ctx.session.user.Email }, { expectedRowVersion });
  await audit(ctx, { EntityType: 'Control', EntityId: controlId, ControlId: controlId, Action: 'Reaktivace kontroly', FieldName: 'IsActive', OldValue: false, NewValue: true, ChangeReason: reason });
  return generateOccurrences(ctx, { controlIds: [controlId], trigger: 'Reaktivace kontroly' });
}

/** FLOW-01 GenerateRecurringControls – idempotentní doplnění výskytů na plánovací horizont. */
export async function generateOccurrences(ctx: ServiceContext, opts: { controlIds?: string[]; trigger?: string; silent?: boolean } = {}) {
  const store = ctx.store;
  if (!opts.silent && !can(ctx.session, 'simulateAutomation') && !can(ctx.session, 'manageControls'))
    throw new PermissionError('Generování výskytů smí spustit Koordinátor nebo Administrátor.');
  const started = new Date().toISOString();
  const day = today(store);
  const now = nowIso(store);
  const to = horizonEnd(day, store.settings.get().planningHorizonMonths);
  const controls = store.controls.filter((c) => c.IsActive && (!opts.controlIds || opts.controlIds.includes(c.ControlId)));
  let created = 0;
  let skipped = 0;
  const creates: ControlRun[] = [];
  for (const control of controls) {
    const res = planGeneration({
      control,
      versions: store.versions.filter((v) => v.ControlId === control.ControlId),
      runs: store.runs.filter((r) => r.ControlId === control.ControlId),
      from: addDays(day, 0),
      to,
      now,
      actor: 'flow-01@system',
      cal: calendar(store),
    });
    created += res.creates.length;
    skipped += res.skippedExisting;
    creates.push(...res.creates);
  }
  await store.bus.batch(async () => {
    await store.runs.bulkPut(creates);
    await logAutomation(store, {
      FlowName: 'FLOW-01 GenerateRecurringControls',
      StartedAt: started,
      Status: 'Succeeded',
      ItemsProcessed: controls.length,
      ItemsCreated: created,
      ItemsSkipped: skipped,
      ErrorCount: 0,
      Message: `${opts.trigger ?? 'Ruční spuštění'}: horizont do ${to}. Existující výskyty přeskočeny (idempotence přes OccurrenceKey).`,
      TriggeredBy: opts.silent ? 'Plánovač (simulace)' : ctx.session.user.Email,
    });
    await store.settings.update({ lastGenerationDate: day });
  });
  return { controls: controls.length, created, skipped, horizon: to };
}

export function ownerLabel(ctx: ServiceContext, email: string) {
  return displayName(ctx.store, email);
}
