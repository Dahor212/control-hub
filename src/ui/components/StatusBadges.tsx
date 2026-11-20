/** Stavové štítky – barva je vždy doplněna ikonou a textem (nikdy jen barva). */
import {
  AlertOctagon,
  AlertTriangle,
  Archive,
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  FileCheck2,
  Hourglass,
  PlayCircle,
  RotateCcw,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { computeTiming, TIMING_LABELS, type TimingStatus } from '../../domain/status';
import { DELIVERY_LABELS, FINDING_STATUS_LABELS, RESULT_LABELS, RISK_LABELS, SEVERITY_LABELS, WORKFLOW_LABELS } from '../../domain/labels';
import type { ControlRun, DeliveryStatus, FindingSeverity, FindingStatus, ISODate, RiskLevel, RunResult, WorkflowState } from '../../domain/types';
import { Badge, type Tone } from './ui';
import { fmtDays } from '../format';

const WF: Record<WorkflowState, { tone: Tone; icon: typeof Clock }> = {
  Planned: { tone: 'neutral', icon: CircleDashed },
  InProgress: { tone: 'blue', icon: PlayCircle },
  Submitted: { tone: 'violet', icon: Send },
  Returned: { tone: 'orange', icon: RotateCcw },
  Completed: { tone: 'green', icon: CheckCircle2 },
  Cancelled: { tone: 'neutral', icon: Ban },
};

export function WorkflowBadge({ state }: { state: WorkflowState }) {
  const s = WF[state];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {WORKFLOW_LABELS[state]}
    </Badge>
  );
}

const TIMING: Partial<Record<TimingStatus, { tone: Tone; icon: typeof Clock }>> = {
  Overdue: { tone: 'red', icon: AlertTriangle },
  DueToday: { tone: 'amber', icon: Clock },
  DueSoon: { tone: 'amber', icon: Hourglass },
  Late: { tone: 'amber', icon: Clock },
  OnTime: { tone: 'green', icon: CheckCircle2 },
};

/** Časový štítek (dopočítaný) – zobrazí se jen tam, kde nese informaci. */
export function TimingBadge({ run, today, dueSoonDays = 3, showOnTime = false }: { run: ControlRun; today: ISODate; dueSoonDays?: number; showOnTime?: boolean }) {
  const t = computeTiming(run, today, dueSoonDays);
  const s = TIMING[t.status];
  if (!s) {
    if (t.status === 'AwaitingApproval' && t.isLate) return <Badge tone="amber" icon={Clock}>Odesláno po termínu</Badge>;
    return null;
  }
  if (t.status === 'OnTime' && !showOnTime) return null;
  const label = t.status === 'Overdue' ? `Po termínu ${fmtDays(t.daysLate)}` : t.status === 'Late' ? `Pozdě o ${fmtDays(t.daysLate)}` : t.status === 'DueSoon' ? `Termín za ${fmtDays(t.daysToDue)}` : TIMING_LABELS[t.status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {label}
    </Badge>
  );
}

export function RunStatus({ run, today, dueSoonDays }: { run: ControlRun; today: ISODate; dueSoonDays?: number }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <WorkflowBadge state={run.WorkflowState} />
      <TimingBadge run={run} today={today} dueSoonDays={dueSoonDays} />
    </span>
  );
}

const RISK: Record<RiskLevel, Tone> = { Low: 'neutral', Medium: 'blue', High: 'amber', Critical: 'red' };
export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <Badge tone={RISK[risk]} icon={risk === 'Critical' ? ShieldAlert : risk === 'High' ? AlertTriangle : CircleDot}>
      {RISK_LABELS[risk]}
    </Badge>
  );
}

const RESULT: Record<RunResult, { tone: Tone; icon: typeof Clock }> = {
  NoFindings: { tone: 'green', icon: CheckCircle2 },
  WithFindings: { tone: 'amber', icon: AlertTriangle },
  PartiallyMet: { tone: 'amber', icon: CircleDot },
  NotMet: { tone: 'red', icon: XCircle },
  NotAssessable: { tone: 'neutral', icon: CircleDashed },
};
export function ResultBadge({ result }: { result: RunResult | null }) {
  if (!result) return <span className="text-slate-400">—</span>;
  const r = RESULT[result];
  return (
    <Badge tone={r.tone} icon={r.icon}>
      {RESULT_LABELS[result]}
    </Badge>
  );
}

const SEV: Record<FindingSeverity, Tone> = { Low: 'neutral', Medium: 'blue', High: 'amber', Critical: 'red' };
export function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  return (
    <Badge tone={SEV[severity]} icon={severity === 'Critical' ? AlertOctagon : severity === 'High' ? AlertTriangle : CircleDot}>
      {SEVERITY_LABELS[severity]}
    </Badge>
  );
}

export function FindingStatusBadge({ status, overdue }: { status: FindingStatus; overdue?: boolean }) {
  const tone: Tone = status === 'Closed' ? 'green' : overdue ? 'red' : status === 'InProgress' ? 'blue' : 'amber';
  return (
    <Badge tone={tone} icon={status === 'Closed' ? CheckCircle2 : overdue ? AlertTriangle : status === 'InProgress' ? PlayCircle : CalendarClock}>
      {FINDING_STATUS_LABELS[status]}
      {overdue && status !== 'Closed' ? ' · po termínu' : ''}
    </Badge>
  );
}

export function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  const map: Record<DeliveryStatus, { tone: Tone; icon: typeof Clock }> = {
    Sent: { tone: 'green', icon: CheckCircle2 },
    Pending: { tone: 'neutral', icon: Clock },
    Failed: { tone: 'red', icon: XCircle },
    Digested: { tone: 'violet', icon: FileCheck2 },
    Cancelled: { tone: 'neutral', icon: Ban },
  };
  const s = map[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {DELIVERY_LABELS[status]}
    </Badge>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="teal" icon={CheckCircle2}>
      Aktivní
    </Badge>
  ) : (
    <Badge tone="neutral" icon={Archive}>
      Archivováno
    </Badge>
  );
}
