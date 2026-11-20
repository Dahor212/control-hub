/**
 * Simulace notifikací (v produkci Power Automate + Office 365 Outlook).
 * NIC SE NEODESÍLÁ – výsledkem jsou pouze záznamy v IC_Notifications se simulovaným stavem doručení.
 */
import { buildDigest, dedupKey, evaluateDeadlineNotifications, type NotificationCandidate } from '../domain/notifications';
import { newGuid } from '../domain/ids';
import { can } from '../domain/permissions';
import type { NotificationRecord, NotificationType } from '../domain/types';
import { PermissionError, displayName, directoryMap, logAutomation, nowIso, today, type ServiceContext } from './core';

export interface EventNotificationInput {
  type: NotificationType;
  runId: string | null;
  controlId: string | null;
  recipient: string;
  subject: string;
  body: string;
  reason: string;
  dedupKey: string;
}

function record(ctx: ServiceContext, c: EventNotificationInput, status: NotificationRecord['DeliveryStatus'], now: string): NotificationRecord {
  return {
    NotificationId: newGuid(),
    RunId: c.runId,
    ControlId: c.controlId,
    RecipientEmail: c.recipient,
    NotificationType: c.type,
    Subject: c.subject,
    Body: c.body,
    Reason: c.reason,
    PlannedSendAt: now,
    SentAt: status === 'Sent' ? now : null,
    DeliveryStatus: status,
    DeduplicationKey: c.dedupKey,
    RetryCount: 0,
    ErrorMessage: null,
    DigestId: null,
    ReadAt: null,
    CreatedAt: now,
  };
}

/** Událostní upozornění (FLOW-06, schvalování). Duplicitní klíč = nic se nevytvoří. */
export async function notifyEvent(ctx: ServiceContext, input: EventNotificationInput): Promise<NotificationRecord | null> {
  if (!input.recipient) return null;
  if (ctx.store.notifications.all().some((n) => n.DeduplicationKey === input.dedupKey)) return null;
  const now = nowIso(ctx.store);
  return ctx.store.notifications.create(record(ctx, input, 'Sent', now));
}

const SIMULATED_ERRORS = [
  'Simulovaná chyba: 429 Too Many Requests (Office 365 Outlook – limit volání)',
  'Simulovaná chyba: 503 Service Unavailable (Exchange Online)',
  'Simulovaná chyba: časový limit akce Send an email (V2) vypršel',
];

export interface DeadlineCheckResult {
  runDate: string;
  evaluatedRuns: number;
  created: NotificationRecord[];
  duplicates: NotificationCandidate[];
  failed: number;
  digests: number;
}

/** FLOW-02 + FLOW-03: denní kontrola termínů. Idempotentní – opakované spuštění nevytvoří duplicity. */
export async function runDailyDeadlineCheck(ctx: ServiceContext, opts: { random?: () => number } = {}): Promise<DeadlineCheckResult> {
  if (!can(ctx.session, 'simulateAutomation')) throw new PermissionError('Simulaci automatizací smí spustit Administrátor nebo Koordinátor.');
  const store = ctx.store;
  const settings = store.settings.get();
  const rnd = opts.random ?? Math.random;
  const day = today(store);
  const now = nowIso(store);
  const started = new Date().toISOString();
  const existingKeys = new Set(store.notifications.all().map((n) => n.DeduplicationKey));
  const versionsById = new Map(store.versions.all().map((v) => [v.VersionId, v]));
  const activeControls = new Set(store.controls.filter((c) => c.IsActive).map((c) => c.ControlId));
  const evaluation = evaluateDeadlineNotifications({
    runs: store.runs.filter((r) => activeControls.has(r.ControlId) && r.IsOpen),
    versionsById,
    today: day,
    settings,
    departments: store.lookups.all(),
    directory: directoryMap(store),
    existingKeys,
  });

  const created: NotificationRecord[] = [];
  let failed = 0;
  let digests = 0;
  const deliver = (rec: NotificationRecord) => {
    if (rnd() < settings.simulatedFailureRate) {
      rec.DeliveryStatus = 'Failed';
      rec.SentAt = null;
      rec.ErrorMessage = SIMULATED_ERRORS[Math.floor(rnd() * SIMULATED_ERRORS.length)];
      failed++;
    } else {
      rec.DeliveryStatus = 'Sent';
      rec.SentAt = now;
    }
  };

  if (settings.digestMode === 'DailyDigest') {
    const byRecipient = new Map<string, NotificationCandidate[]>();
    for (const c of evaluation.candidates) byRecipient.set(c.recipient, [...(byRecipient.get(c.recipient) ?? []), c]);
    for (const [recipient, items] of byRecipient) {
      const digestId = newGuid();
      for (const c of items) {
        const rec = record(ctx, { ...c, runId: c.runId, controlId: c.controlId, dedupKey: c.dedupKey }, 'Digested', now);
        rec.DigestId = digestId;
        created.push(rec);
      }
      const n = store.notifications.filter((x) => x.NotificationType === 'DailyDigest' && x.RecipientEmail === recipient && x.DeduplicationKey.includes(`|${day}|`)).length;
      const d = buildDigest(displayName(store, recipient), items, day);
      const digest = record(
        ctx,
        {
          type: 'DailyDigest',
          runId: null,
          controlId: null,
          recipient,
          subject: d.subject,
          body: d.body,
          reason: `Režim denního souhrnu: ${items.length} položek sloučeno do jedné zprávy.`,
          dedupKey: dedupKey([recipient, 'DailyDigest', day, n + 1]),
        },
        'Pending',
        now,
      );
      digest.NotificationId = digestId;
      deliver(digest);
      created.push(digest);
      digests++;
    }
  } else {
    for (const c of evaluation.candidates) {
      const rec = record(ctx, c, 'Pending', now);
      deliver(rec);
      created.push(rec);
    }
  }

  await store.bus.batch(async () => {
    await store.notifications.bulkPut(created);
    const reminders = created.filter((c) => c.NotificationType === 'DueReminder' || c.NotificationType === 'ApprovalPending' || c.NotificationType === 'DailyDigest').length;
    const overdue = created.filter((c) => c.NotificationType === 'Overdue' || c.NotificationType === 'Escalation').length;
    await logAutomation(store, {
      FlowName: 'FLOW-02 SendDueDateReminders',
      StartedAt: started,
      Status: failed ? 'PartiallySucceeded' : 'Succeeded',
      ItemsProcessed: evaluation.evaluatedRuns,
      ItemsCreated: reminders,
      ItemsSkipped: evaluation.duplicates.filter((d) => d.type === 'DueReminder' || d.type === 'ApprovalPending').length,
      ErrorCount: created.filter((c) => c.DeliveryStatus === 'Failed' && (c.NotificationType === 'DueReminder' || c.NotificationType === 'ApprovalPending' || c.NotificationType === 'DailyDigest')).length,
      Message: `Simulace k ${day}. Žádné e-maily nebyly skutečně odeslány.`,
      TriggeredBy: ctx.session.user.Email,
    });
    await logAutomation(store, {
      FlowName: 'FLOW-03 EscalateOverdueControls',
      StartedAt: started,
      Status: 'Succeeded',
      ItemsProcessed: evaluation.evaluatedRuns,
      ItemsCreated: overdue,
      ItemsSkipped: evaluation.duplicates.filter((d) => d.type === 'Overdue' || d.type === 'Escalation').length,
      ErrorCount: created.filter((c) => c.DeliveryStatus === 'Failed' && (c.NotificationType === 'Overdue' || c.NotificationType === 'Escalation')).length,
      Message: `Simulace k ${day}.`,
      TriggeredBy: ctx.session.user.Email,
    });
    await store.settings.update({ lastDeadlineCheckDate: day });
  });

  return { runDate: day, evaluatedRuns: evaluation.evaluatedRuns, created, duplicates: evaluation.duplicates, failed, digests };
}

/** Opakování neúspěšných doručení (retry). Po vyčerpání pokusů upozorní administrátora (FLOW-07). */
export async function retryFailedNotifications(ctx: ServiceContext, opts: { random?: () => number } = {}) {
  if (!can(ctx.session, 'simulateAutomation')) throw new PermissionError('Opakování odeslání smí spustit Administrátor nebo Koordinátor.');
  const store = ctx.store;
  const settings = store.settings.get();
  const rnd = opts.random ?? Math.random;
  const now = nowIso(store);
  const failed = store.notifications.filter((n) => n.DeliveryStatus === 'Failed' && n.RetryCount < settings.maxRetries);
  let sent = 0;
  let stillFailed = 0;
  await store.bus.batch(async () => {
    for (const n of failed) {
      const ok = rnd() >= settings.simulatedFailureRate * 2;
      const retry = n.RetryCount + 1;
      if (ok) {
        sent++;
        await store.notifications.update(n.NotificationId, { DeliveryStatus: 'Sent', SentAt: now, RetryCount: retry, ErrorMessage: null });
      } else {
        stillFailed++;
        await store.notifications.update(n.NotificationId, { RetryCount: retry, ErrorMessage: `${n.ErrorMessage ?? 'Chyba'} (pokus ${retry})` });
        if (retry >= settings.maxRetries && settings.adminEmail)
          await notifyEvent(ctx, {
            type: 'AutomationFailure',
            runId: n.RunId,
            controlId: n.ControlId,
            recipient: settings.adminEmail,
            subject: 'FLOW-07: Upozornění se nepodařilo doručit',
            body: `Zprávu „${n.Subject}“ pro ${displayName(store, n.RecipientEmail)} se nepodařilo doručit ani po ${retry} pokusech.`,
            reason: `Vyčerpán maximální počet pokusů (${settings.maxRetries}).`,
            dedupKey: dedupKey([n.NotificationId, 'AutomationFailure']),
          });
      }
    }
    await logAutomation(store, {
      FlowName: 'FLOW-07 MonitorAutomationFailures',
      StartedAt: now,
      Status: stillFailed ? 'PartiallySucceeded' : 'Succeeded',
      ItemsProcessed: failed.length,
      ItemsCreated: sent,
      ItemsSkipped: 0,
      ErrorCount: stillFailed,
      Message: 'Opakování neúspěšných doručení (simulace).',
      TriggeredBy: ctx.session.user.Email,
    });
  });
  return { attempted: failed.length, sent, stillFailed };
}

export async function markNotificationsRead(ctx: ServiceContext, ids: string[]) {
  const now = nowIso(ctx.store);
  await ctx.store.bus.batch(async () => {
    for (const id of ids) {
      const n = ctx.store.notifications.get(id);
      if (n && !n.ReadAt && n.RecipientEmail === ctx.session.user.Email) await ctx.store.notifications.update(id, { ReadAt: now });
    }
  });
}

/** Po dokončení / zrušení běhu se nevyřízená upozornění k běhu zastaví. */
export async function cancelPendingForRun(ctx: ServiceContext, runId: string) {
  const pending = ctx.store.notifications.filter((n) => n.RunId === runId && n.DeliveryStatus === 'Pending');
  for (const n of pending) await ctx.store.notifications.update(n.NotificationId, { DeliveryStatus: 'Cancelled', ErrorMessage: 'Běh byl uzavřen – upozornění zastaveno.' });
}
