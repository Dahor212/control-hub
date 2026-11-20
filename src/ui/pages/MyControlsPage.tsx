import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, FileSignature, Inbox, Play, RotateCcw, Send, UserCheck } from 'lucide-react';
import { addDays, diffDays } from '../../domain/dates';
import { computeTiming } from '../../domain/status';
import type { ControlRun } from '../../domain/types';
import { useApp } from '../AppContext';
import { useLookups, useUsers } from '../hooks';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Tabs, cx } from '../components/ui';
import { RiskBadge, RunStatus } from '../components/StatusBadges';
import { PaRef } from '../components/PaRef';
import { fmtDate, fmtDateTime, fmtPeriod, fmtRelative } from '../format';
import { RECURRENCE_LABELS } from '../../domain/labels';

type Bucket = 'todo' | 'today' | 'soon' | 'overdue' | 'progress' | 'pending' | 'returned' | 'review' | 'done' | 'planned';

export function MyControlsPage() {
  const { store, session, today, version, settings } = useApp();
  const nav = useNavigate();
  const me = session.user.Email;
  const isReviewer = session.activeRole === 'Reviewer';
  const mine = useMemo(() => store.runs.filter((r) => !r.IsSuperseded && (r.AssignedOwnerEmail === me || r.BackupOwnerEmail === me)), [store, version, me]);
  const toReview = useMemo(() => store.runs.filter((r) => r.WorkflowState === 'Submitted' && r.ReviewerEmail === me), [store, version, me]);

  const buckets = useMemo(() => {
    const open = mine.filter((r) => ['Planned', 'InProgress', 'Returned'].includes(r.WorkflowState));
    const avail = open.filter((r) => r.ScheduledDate <= today);
    const b: Record<Bucket, ControlRun[]> = {
      todo: avail.filter((r) => r.DueDate >= today),
      today: open.filter((r) => r.DueDate === today),
      soon: open.filter((r) => r.DueDate > today && diffDays(today, r.DueDate) <= settings.dueSoonDays + 4),
      overdue: open.filter((r) => r.DueDate < today),
      progress: mine.filter((r) => r.WorkflowState === 'InProgress'),
      pending: mine.filter((r) => r.WorkflowState === 'Submitted'),
      returned: mine.filter((r) => r.WorkflowState === 'Returned'),
      review: toReview,
      done: mine.filter((r) => r.WorkflowState === 'Completed' && r.CompletedAt && r.CompletedAt.slice(0, 10) >= addDays(today, -60)),
      planned: open.filter((r) => r.ScheduledDate > today && r.ScheduledDate <= addDays(today, 45)),
    };
    for (const k of Object.keys(b) as Bucket[]) b[k].sort((x, y) => (k === 'done' ? (y.CompletedAt ?? '').localeCompare(x.CompletedAt ?? '') : x.DueDate.localeCompare(y.DueDate)));
    return b;
  }, [mine, toReview, today, settings.dueSoonDays]);

  const [tab, setTab] = useState<Bucket>(() => (isReviewer && toReview.length ? 'review' : buckets.overdue.length ? 'overdue' : 'todo'));
  const list = buckets[tab];
  const tabs: Array<{ value: Bucket; label: string; count: number; icon: typeof Inbox; hidden?: boolean }> = [
    { value: 'review', label: 'Ke schválení', count: buckets.review.length, icon: FileSignature, hidden: !isReviewer && buckets.review.length === 0 },
    { value: 'todo', label: 'K provedení', count: buckets.todo.length, icon: Inbox },
    { value: 'today', label: 'Dnes', count: buckets.today.length, icon: CalendarClock },
    { value: 'soon', label: 'Blížící se termín', count: buckets.soon.length, icon: CalendarClock },
    { value: 'overdue', label: 'Po termínu', count: buckets.overdue.length, icon: CalendarClock },
    { value: 'progress', label: 'Rozpracované', count: buckets.progress.length, icon: Play },
    { value: 'pending', label: 'Čekající na schválení', count: buckets.pending.length, icon: Send },
    { value: 'returned', label: 'Vrácené k doplnění', count: buckets.returned.length, icon: RotateCcw },
    { value: 'done', label: 'Dokončené', count: buckets.done.length, icon: CheckCircle2 },
    { value: 'planned', label: 'Naplánované', count: buckets.planned.length, icon: CalendarClock },
  ];

  return (
    <div>
      <PageHeader
        title="Moje kontroly"
        subtitle="Vaše přidělené kontroly a úkoly. Otevřete běh, seznamte se s metodikou a proveďte jej."
        actions={
          <div className="flex gap-2">
            <Stat label="Po termínu" value={buckets.overdue.length} tone={buckets.overdue.length ? 'red' : 'neutral'} />
            <Stat label="K provedení" value={buckets.todo.length} tone="blue" />
            {isReviewer && <Stat label="Ke schválení" value={buckets.review.length} tone="violet" />}
          </div>
        }
      />
      {session.activeRole === 'Auditor' && <Notice className="mb-4">Role Auditor nemá přidělené kontroly – má přístup ke všem záznamům pouze pro čtení.</Notice>}
      <PaRef id="my.tabs">
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
      </PaRef>
      {tab === 'review' && (
        <Notice tone="violet" icon={UserCheck} className="mb-4" title="Princip čtyř očí">
          Schválit můžete jen běhy, které jste sami neprováděli. U vlastních běhů je tlačítko Schválit zablokováno.
        </Notice>
      )}
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardCheck} title="V této skupině nemáte žádné kontroly" description="Skupiny se počítají z termínů a stavu workflow k dnešnímu dni." />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {list.map((r) => (
            <RunRow key={r.RunId} run={r} today={today} me={me} review={tab === 'review'} onOpen={() => nav(`/runs/${r.RunId}${tab === 'review' || ['InProgress', 'Returned', 'Planned'].includes(r.WorkflowState) ? '?tab=execution' : ''}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'red' | 'blue' | 'violet' | 'neutral' }) {
  const t = { red: 'text-rose-700 bg-rose-50 ring-rose-200', blue: 'text-brand-700 bg-brand-50 ring-brand-200', violet: 'text-violet-700 bg-violet-50 ring-violet-200', neutral: 'text-slate-600 bg-white ring-slate-200' }[tone];
  return (
    <div className={cx('rounded-lg px-3 py-1.5 text-center ring-1 ring-inset', t)}>
      <p className="text-lg leading-tight font-semibold tabular">{value}</p>
      <p className="text-[11px]">{label}</p>
    </div>
  );
}

function RunRow({ run, today, me, review, onOpen }: { run: ControlRun; today: string; me: string; review: boolean; onOpen: () => void }) {
  const { name } = useUsers();
  const { deptLabel } = useLookups();
  const t = computeTiming(run, today);
  const isBackup = run.BackupOwnerEmail === me && run.AssignedOwnerEmail !== me;
  const action = review
    ? { label: run.CompletedBy === me ? 'Otevřít' : 'Posoudit', icon: FileSignature, variant: 'primary' as const }
    : run.WorkflowState === 'Planned' && run.ScheduledDate <= today
      ? { label: 'Zahájit', icon: Play, variant: 'primary' as const }
      : run.WorkflowState === 'InProgress'
        ? { label: 'Pokračovat', icon: ArrowRight, variant: 'primary' as const }
        : run.WorkflowState === 'Returned'
          ? { label: 'Doplnit', icon: RotateCcw, variant: 'primary' as const }
          : { label: 'Otevřít', icon: ArrowRight, variant: 'secondary' as const };
  return (
    <div className={cx('flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center', t.status === 'Overdue' ? 'border-rose-200' : 'border-line')}>
      <div className={cx('hidden w-1 self-stretch rounded-full sm:block', t.status === 'Overdue' ? 'bg-rose-500' : t.status === 'DueToday' || t.status === 'DueSoon' ? 'bg-amber-400' : run.WorkflowState === 'Completed' ? 'bg-emerald-500' : 'bg-brand-200')} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-500">{run.ControlCode}</span>
          <span className="font-mono text-xs text-slate-400">{run.RunCode}</span>
          <RiskBadge risk={run.RiskLevel} />
          {isBackup && <Badge tone="teal">Zástup</Badge>}
          {run.IsOneTimeOverride && <Badge tone="neutral">Upravený výskyt</Badge>}
        </div>
        <p className="mt-1 text-[15px] font-semibold text-slate-900">{run.ControlName}</p>
        <p className="mt-0.5 text-[13px] text-slate-500">
          Období {fmtPeriod(run.PeriodFrom, run.PeriodTo)} · {RECURRENCE_LABELS[run.RecurrenceType]} · {deptLabel(run.Department)}
          {review && <> · provedl(a) {name(run.CompletedBy)} {fmtDateTime(run.SubmittedAt)}</>}
        </p>
        {run.WorkflowState === 'Returned' && run.ReturnComment && <p className="mt-1.5 rounded-md bg-orange-50 px-2.5 py-1.5 text-[13px] text-orange-800">Vráceno: {run.ReturnComment}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
        <RunStatus run={run} today={today} />
        <p className="text-xs text-slate-500">
          Termín <span className="font-medium text-slate-700">{fmtDate(run.DueDate)}</span> ({fmtRelative(run.DueDate, today)})
        </p>
      </div>
      <PaRef id="my.action" inline>
        <Button variant={action.variant} icon={action.icon} onClick={onOpen} className="shrink-0">
          {action.label}
        </Button>
      </PaRef>
    </div>
  );
}
