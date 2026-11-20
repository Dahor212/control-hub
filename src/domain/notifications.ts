/**
 * Pravidla upozornění a eskalací (FLOW-02 SendDueDateReminders, FLOW-03 EscalateOverdueControls).
 *
 * Idempotence: každé upozornění má DeduplicationKey. Před vytvořením se ověří, zda klíč už
 * existuje – pokud ano, upozornění se nevytvoří (ani při opakovaném spuštění téhož dne).
 *
 * Politika dohánění (catch-up): pokud denní kontrola neproběhla několik dní, neposílá se
 * „lavina“ zmeškaných připomínek. Před termínem se pošle jen nejrelevantnější (nejbližší)
 * připomínka, po termínu jen nejvyšší dosažený práh.
 */
import { diffDays, toPragueDate } from './dates';
import { isOwnerPending } from './status';
import { WORKFLOW_LABELS } from './labels';
import type {
  AppSettings,
  ControlRun,
  ControlVersion,
  DirectoryUser,
  Email,
  ISODate,
  LookupItem,
  NotificationType,
  ReminderPolicy,
} from './types';

export interface NotificationCandidate {
  runId: string;
  controlId: string;
  recipient: Email;
  type: NotificationType;
  dedupKey: string;
  subject: string;
  body: string;
  reason: string;
}

export interface EvaluationResult {
  candidates: NotificationCandidate[];
  duplicates: NotificationCandidate[];
  evaluatedRuns: number;
}

export function effectivePolicy(version: ControlVersion | undefined, settings: AppSettings): ReminderPolicy {
  if (version && !version.ReminderPolicy.useGlobal) return version.ReminderPolicy;
  return {
    useGlobal: true,
    daysBefore: settings.reminderDaysBefore,
    overdueDays: settings.overdueDaysAfter,
    escalationAfterDays: settings.escalationAfterDays,
  };
}

const fmt = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number);
  return `${day}. ${m}. ${y}`;
};

export function dedupKey(parts: Array<string | number>): string {
  return parts.join('|');
}

export function evaluateDeadlineNotifications(ctx: {
  runs: ControlRun[];
  versionsById: Map<string, ControlVersion>;
  today: ISODate;
  settings: AppSettings;
  departments: LookupItem[];
  directory: Map<string, DirectoryUser>;
  existingKeys: Set<string>;
}): EvaluationResult {
  const candidates: NotificationCandidate[] = [];
  const duplicates: NotificationCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: NotificationCandidate) => {
    if (ctx.existingKeys.has(c.dedupKey) || seen.has(c.dedupKey)) duplicates.push(c);
    else {
      seen.add(c.dedupKey);
      candidates.push(c);
    }
  };
  const name = (e: Email | null) => (e ? ctx.directory.get(e)?.DisplayName ?? e : '—');
  let evaluatedRuns = 0;

  for (const run of ctx.runs) {
    if (run.IsSuperseded) continue;
    const version = ctx.versionsById.get(run.VersionId);
    const policy = effectivePolicy(version, ctx.settings);
    const label = `${run.ControlCode} ${run.ControlName} (${run.RunCode})`;
    const daysToDue = diffDays(ctx.today, run.DueDate);

    if (isOwnerPending(run.WorkflowState)) {
      evaluatedRuns++;
      // 1) Připomínky před termínem
      if (daysToDue >= 0) {
        const applicable = policy.daysBefore.filter((o) => o >= daysToDue).sort((a, b) => a - b);
        if (applicable.length) {
          const o = applicable[0];
          push({
            runId: run.RunId,
            controlId: run.ControlId,
            recipient: run.AssignedOwnerEmail,
            type: 'DueReminder',
            dedupKey: dedupKey([run.RunId, 'DueReminder', o, run.AssignedOwnerEmail]),
            subject: daysToDue === 0 ? `Dnes je termín kontroly ${run.ControlCode}` : `Za ${daysToDue} dní termín kontroly ${run.ControlCode}`,
            body: `Kontrola ${label} má termín splnění ${fmt(run.DueDate)}. Stav: ${WORKFLOW_LABELS[run.WorkflowState]}.`,
            reason: `Pravidlo „${o === 0 ? 'v den termínu' : `${o} dní před termínem`}“ (${policy.useGlobal ? 'globální' : 'individuální'} nastavení); do termínu zbývá ${daysToDue} dní.`,
          });
        }
      }
      // 2) Po termínu
      if (daysToDue < 0) {
        const overdue = -daysToDue;
        const reached = policy.overdueDays.filter((t) => t <= overdue).sort((a, b) => b - a);
        if (reached.length) {
          const t = reached[0];
          push({
            runId: run.RunId,
            controlId: run.ControlId,
            recipient: run.AssignedOwnerEmail,
            type: 'Overdue',
            dedupKey: dedupKey([run.RunId, 'Overdue', t, run.AssignedOwnerEmail]),
            subject: `Kontrola ${run.ControlCode} je ${overdue} dní po termínu`,
            body: `Kontrola ${label} měla termín ${fmt(run.DueDate)} a dosud nebyla provedena.`,
            reason: `Práh „${t}. den po termínu“ dosažen (aktuálně ${overdue} dní po termínu).`,
          });
        }
        // 3) Eskalace
        if (overdue >= policy.escalationAfterDays) {
          const recipients = new Set<Email>();
          const dept = ctx.departments.find((d) => d.LookupType === 'Department' && d.Code === run.Department);
          if (ctx.settings.escalateToManager && dept?.ManagerEmail) recipients.add(dept.ManagerEmail);
          if (ctx.settings.escalateToCoordinator && ctx.settings.coordinatorEmail) recipients.add(ctx.settings.coordinatorEmail);
          recipients.delete(run.AssignedOwnerEmail);
          for (const rcp of recipients)
            push({
              runId: run.RunId,
              controlId: run.ControlId,
              recipient: rcp,
              type: 'Escalation',
              dedupKey: dedupKey([run.RunId, 'Escalation', rcp]),
              subject: `ESKALACE: ${run.ControlCode} ${overdue} dní po termínu`,
              body: `Kontrola ${label} (odpovídá ${name(run.AssignedOwnerEmail)}) je ${overdue} dní po termínu ${fmt(run.DueDate)}.`,
              reason: `Prodlení ${overdue} dní ≥ eskalační práh ${policy.escalationAfterDays} dní; příjemce: ${rcp === ctx.settings.coordinatorEmail ? 'koordinátor' : 'vedoucí útvaru'}.`,
            });
        }
      }
    } else if (run.WorkflowState === 'Submitted' && run.ReviewerEmail && run.SubmittedAt) {
      evaluatedRuns++;
      const waiting = diffDays(toPragueDate(run.SubmittedAt), ctx.today);
      if (waiting >= ctx.settings.approvalReminderDays)
        push({
          runId: run.RunId,
          controlId: run.ControlId,
          recipient: run.ReviewerEmail,
          type: 'ApprovalPending',
          dedupKey: dedupKey([run.RunId, 'ApprovalPending', run.ReturnCount, run.ReviewerEmail]),
          subject: `Čeká na vaše schválení: ${run.ControlCode}`,
          body: `Kontrola ${label} čeká na schválení ${waiting} dní (provedl/a ${name(run.CompletedBy)}).`,
          reason: `Běh čeká na schválení ${waiting} dní ≥ ${ctx.settings.approvalReminderDays} dny (nastavení).`,
        });
    }
  }
  return { candidates, duplicates, evaluatedRuns };
}

/** Text denního souhrnu pro jednoho příjemce. */
export function buildDigest(recipientName: string, items: NotificationCandidate[], today: ISODate) {
  const byType = (t: NotificationType) => items.filter((i) => i.type === t).length;
  const lines = items.map((i) => `• ${i.subject}`);
  return {
    subject: `Denní souhrn kontrol k ${fmt(today)} (${items.length})`,
    body: `Dobrý den, ${recipientName},\n\nPřehled položek vyžadujících pozornost:\n${lines.join('\n')}\n\nPřipomínky: ${byType('DueReminder')}, po termínu: ${byType('Overdue')}, eskalace: ${byType('Escalation')}, schválení: ${byType('ApprovalPending')}.`,
  };
}
