import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Gauge, History, Hourglass, ShieldAlert, Send, Sun, Users } from 'lucide-react';
import { addDays, diffDays, monthIndex, monthIndexToYM, makeISODate } from '../../domain/dates';
import { computeKpis, groupKpis, matchesFilter, monthlyTrend, operationalCounts, statusDistribution, topRiskyOpen, RUN_CATEGORY_LABELS, type RunCategory } from '../../domain/metrics';
import { isOwnerPending } from '../../domain/status';
import { ROLE_LABELS } from '../../domain/labels';
import type { ControlRun } from '../../domain/types';
import { useApp } from '../AppContext';
import { useLookups, useScopedRuns, useUsers } from '../hooks';
import { drillHref, periodFromPreset, PERIOD_LABELS, type DrillView } from '../drilldown';
import { EMPTY_FILTERS, FilterBar, type FilterState } from '../components/FilterBar';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Segmented, cx } from '../components/ui';
import { Donut, RateBars, StackedBars, VIZ } from '../components/Charts';
import { RiskBadge, RunStatus } from '../components/StatusBadges';
import { PaRef } from '../components/PaRef';
import { fmtDate, fmtDateTime, fmtPct, fmtRelative } from '../format';

const CAT_COLOR: Record<RunCategory, string> = {
  onTime: VIZ.onTime,
  late: VIZ.late,
  pendingApproval: VIZ.pending,
  overdue: VIZ.overdue,
  inProgress: VIZ.progress,
  returned: VIZ.returned,
  open: VIZ.open,
  planned: VIZ.planned,
  cancelled: VIZ.cancelled,
};
const CAT_DRILL: Record<RunCategory, DrillView> = {
  onTime: 'onTime',
  late: 'late',
  pendingApproval: 'pending',
  overdue: 'overdue',
  inProgress: 'inProgress',
  returned: 'returned',
  open: 'notCompleted',
  planned: 'notCompleted',
  cancelled: 'cancelled',
};

export function DashboardPage() {
  const { session, today, store, version } = useApp();
  const nav = useNavigate();
  const { departments, deptLabel } = useLookups();
  const { name } = useUsers();
  const scoped = useScopedRuns();
  const [filters, setFilters] = useState<FilterState>(() => EMPTY_FILTERS(today));
  const isManager = session.activeRole === 'Manager';
  const [view, setView] = useState<'team' | 'mine'>('team');
  const me = session.user.Email;

  const base = useMemo(() => {
    let r = scoped;
    if (isManager && view === 'mine') r = r.filter((x) => x.AssignedOwnerEmail === me || x.BackupOwnerEmail === me || x.ReviewerEmail === me);
    return r.filter((x) => matchesFilter(x, filters));
  }, [scoped, filters, isManager, view, me]);

  const period = periodFromPreset(filters.preset, today, filters.custom);
  const k = useMemo(() => computeKpis(base, period, today), [base, period.from, period.to, today]);
  const ops = useMemo(() => operationalCounts(base, today), [base, today]);
  const trendEnd = period.to > today ? today : period.to;
  const trend = useMemo(() => monthlyTrend(base, trendEnd, 6, today), [base, trendEnd, today]);
  const dist = useMemo(() => statusDistribution(base, period, today), [base, period.from, period.to, today]);
  const byDept = useMemo(() => groupKpis(base, period, today, (r) => r.Department), [base, period.from, period.to, today]);
  const risky = useMemo(() => topRiskyOpen(base, today, 6), [base, today]);

  const drillBase = {
    from: period.from,
    to: period.to,
    departments: filters.departments,
    owners: filters.owners,
    states: filters.states,
    recurrenceTypes: filters.recurrenceTypes,
    categories: filters.categories,
    riskLevels: filters.riskLevels,
    mine: isManager && view === 'mine' ? me : undefined,
  };
  const go = (v: DrillView, noPeriod = false) => nav(drillHref({ ...drillBase, view: v, ...(noPeriod ? { from: undefined, to: undefined } : {}) }));

  const myRuns = useMemo(() => scoped.filter((r) => r.AssignedOwnerEmail === me || r.BackupOwnerEmail === me), [scoped, me]);
  const todayTasks = myRuns
    .filter((r) => isOwnerPending(r.WorkflowState) && r.ScheduledDate <= today)
    .sort((a, b) => a.DueDate.localeCompare(b.DueDate))
    .slice(0, 6);
  const next7 = base
    .filter((r) => isOwnerPending(r.WorkflowState) && r.DueDate >= today && r.DueDate <= addDays(today, 7))
    .sort((a, b) => a.DueDate.localeCompare(b.DueDate));
  const overdue = base.filter((r) => isOwnerPending(r.WorkflowState) && r.DueDate < today).sort((a, b) => a.DueDate.localeCompare(b.DueDate));
  const recentDone = base
    .filter((r) => r.WorkflowState === 'Completed' && r.CompletedAt)
    .sort((a, b) => b.CompletedAt!.localeCompare(a.CompletedAt!))
    .slice(0, 6);
  const scopedIds = useMemo(() => new Set(scoped.map((r) => r.ControlId)), [scoped]);
  const recentChanges = useMemo(
    () =>
      store.audit
        .filter((a) => !!a.ControlId && scopedIds.has(a.ControlId))
        .sort((a, b) => b.ChangedAt.localeCompare(a.ChangedAt))
        .slice(0, 7),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version, scopedIds],
  );
  const controlsById = useMemo(() => new Map(store.controls.all().map((c) => [c.ControlId, c])), [store, version]);

  const greeting = new Date().getHours() < 11 ? 'Dobré ráno' : 'Dobrý den';
  const evaluableHint = `včas ${k.onTime} z ${k.evaluable} vyhodnotitelných`;

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${session.user.DisplayName.split(' ')[0]}`}
        subtitle={
          <>
            Přehled interních kontrol · {ROLE_LABELS[session.activeRole]}
            {session.activeRole === 'ControlOwner' ? ' – zobrazeny vaše přidělené kontroly' : ''} · stav k {fmtDate(today)}
          </>
        }
        actions={
          isManager ? (
            <PaRef id="dash.viewToggle" inline>
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'mine', label: 'Můj pohled', icon: Sun },
                  { value: 'team', label: 'Celý tým', icon: Users },
                ]}
              />
            </PaRef>
          ) : undefined
        }
      />
      <PaRef id="dash.filters">
        <FilterBar value={filters} onChange={setFilters} onReset={() => setFilters(EMPTY_FILTERS(today))} hide={session.activeRole === 'ControlOwner' ? ['owners'] : []} />
      </PaRef>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi icon={ClipboardList} label="Naplánováno v období" value={k.planned} hint={k.cancelled ? `+ ${k.cancelled} zrušeno (mimo plán)` : PERIOD_LABELS[filters.preset]} onClick={() => go('planned')} tone="blue" />
        <Kpi icon={CheckCircle2} label="Dokončené kontroly" value={k.completed} hint={`${fmtPct(k.completionRate)} plánu · v období dokončeno ${k.completedDuringPeriod}`} onClick={() => go('completed')} tone="green" />
        <Kpi icon={AlertTriangle} label="Po termínu" value={k.overdueOpen} hint={k.avgOverdueDays ? `průměrně ${String(k.avgOverdueDays).replace('.', ',')} dne po termínu` : 'nedokončené s uplynulým termínem'} onClick={() => go('overdue')} tone={k.overdueOpen ? 'red' : 'neutral'} />
        <Kpi icon={Hourglass} label="Blížící se termín" value={ops.dueSoon} hint="termín v následujících 7 dnech" onClick={() => go('dueSoon', true)} tone="amber" />
        <Kpi icon={Gauge} label="Míra včasného plnění" value={fmtPct(k.onTimeRate, 1)} hint={evaluableHint} onClick={() => go('evaluable')} tone={k.onTimeRate === null ? 'neutral' : k.onTimeRate >= 0.95 ? 'green' : k.onTimeRate >= 0.85 ? 'amber' : 'red'} />
        <Kpi icon={Send} label="Čeká na schválení" value={ops.pendingApproval} hint="odesláno, čeká na schvalovatele" onClick={() => go('pending', true)} tone="violet" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <PaRef id="dash.trend">
            <CardHeader title="Trend plnění za posledních 6 měsíců" subtitle="Běhy podle měsíce termínu splnění · klikněte na sloupec pro seznam" />
            <StackedBars
              data={trend.map((t) => ({ ...t }))}
              xKey="label"
              series={[
                { key: 'onTime', label: 'Dokončeno včas', color: VIZ.onTime },
                { key: 'late', label: 'Dokončeno pozdě', color: VIZ.late },
                { key: 'notCompleted', label: 'Nedokončeno', color: VIZ.open },
              ]}
              extraTooltip={(row) => <>Míra včasného plnění: <b>{fmtPct(row.onTimeRate as number | null, 1)}</b></>}
              onClick={(row) => {
                const mk = row.monthKey as string;
                const [y, m] = mk.split('-').map(Number);
                const next = monthIndexToYM(monthIndex(makeISODate(y, m, 1)) + 1);
                nav(drillHref({ ...drillBase, view: 'all', from: `${mk}-01`, to: addDays(makeISODate(next.y, next.m, 1), -1) }));
              }}
            />
          </PaRef>
        </Card>
        <Card>
          <PaRef id="dash.status">
            <CardHeader title="Rozdělení podle stavů" subtitle={`${PERIOD_LABELS[filters.preset]} · ${fmtDate(period.from)} – ${fmtDate(period.to)}`} />
            {dist.length ? (
              <Donut height={180} data={dist.map((d) => ({ key: d.category, label: RUN_CATEGORY_LABELS[d.category], value: d.count, color: CAT_COLOR[d.category] }))} onClick={(key) => go(CAT_DRILL[key as RunCategory])} centerLabel="běhů" />
            ) : (
              <EmptyState title="V období nejsou žádné běhy" />
            )}
          </PaRef>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <PaRef id="dash.dept">
            <CardHeader title="Plnění podle útvarů" subtitle="Míra včasného plnění v období" />
            <RateBars
              data={departments
                .map((d) => {
                  const g = byDept.find((x) => x.key === d.Code)?.kpi;
                  return { key: d.Code, label: d.Label, value: g?.onTimeRate ?? null, sub: g ? `${g.onTime}/${g.evaluable}` : '0/0' };
                })
                .filter((d) => d.sub !== '0/0' || session.activeRole !== 'ControlOwner')}
              onClick={(code) => nav(drillHref({ ...drillBase, view: 'evaluable', departments: [code] }))}
            />
          </PaRef>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Nejrizikovější nedokončené kontroly" subtitle="Pořadí podle rizikovosti a prodlení" icon={ShieldAlert} />
          {risky.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Žádné rizikové nedokončené kontroly" />
          ) : (
            <ul className="divide-y divide-line">
              {risky.map(({ run, daysLate }) => (
                <li key={run.RunId}>
                  <Link to={`/runs/${run.RunId}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50/70">
                    <RiskBadge risk={run.RiskLevel} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-slate-800">
                        <span className="font-mono text-xs text-slate-500">{run.ControlCode}</span> {run.ControlName}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {run.RunCode} · {name(run.AssignedOwnerEmail)} · {deptLabel(run.Department)}
                      </span>
                    </span>
                    <span className="text-right">
                      <RunStatus run={run} today={today} />
                      <span className="block text-[11px] text-slate-400">{daysLate ? `termín ${fmtDate(run.DueDate)}` : `termín ${fmtRelative(run.DueDate, today)}`}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <ListCard title="Moje dnešní úkoly" icon={Sun} to="/my" empty="Na dnešek nemáte žádné úkoly." runs={todayTasks} today={today} />
        <ListCard title="Termín v následujících 7 dnech" icon={CalendarClock} onMore={() => go('dueSoon', true)} empty="Žádné termíny v příštích 7 dnech." runs={next7.slice(0, 6)} total={next7.length} today={today} />
        <ListCard title="Kontroly po termínu" icon={AlertTriangle} onMore={() => go('overdue', true)} empty="Žádné kontroly po termínu." runs={overdue.slice(0, 6)} total={overdue.length} today={today} tone="red" />
        <ListCard title="Poslední dokončené kontroly" icon={CheckCircle2} empty="Zatím nic dokončeno." runs={recentDone} today={today} showCompleted />
        <Card className="2xl:col-span-2">
          <CardHeader title="Nedávné změny" subtitle="Auditní záznamy ke kontrolám ve vašem rozsahu" icon={History} />
          <ul className="space-y-2.5">
            {recentChanges.map((a) => (
              <li key={a.AuditId} className="flex gap-3 text-[13px]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-800">{a.Action}</span>
                  {a.ControlId && controlsById.get(a.ControlId) && (
                    <Link to={`/controls/${a.ControlId}`} className="ml-1.5 font-mono text-xs text-brand-700 hover:underline">
                      {controlsById.get(a.ControlId)!.ControlCode}
                    </Link>
                  )}
                  {a.FieldName && a.NewValue && a.NewValue.length < 60 && (
                    <span className="text-slate-500">
                      {' '}
                      · {a.FieldName}: {a.OldValue ? `${a.OldValue} → ` : ''}
                      {a.NewValue}
                    </span>
                  )}
                  {a.ChangeReason && <span className="block truncate text-xs text-slate-500">Důvod: {a.ChangeReason}</span>}
                </span>
                <span className="shrink-0 text-right text-xs text-slate-400">
                  {name(a.ChangedBy)}
                  <br />
                  {fmtDateTime(a.ChangedAt)}
                </span>
              </li>
            ))}
            {recentChanges.length === 0 && <li className="text-[13px] text-slate-500">Žádné změny.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, onClick, tone }: { icon: typeof Gauge; label: string; value: number | string; hint: string; onClick: () => void; tone: 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'neutral' }) {
  const t = {
    blue: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    neutral: 'bg-slate-100 text-slate-500',
  }[tone];
  return (
    <PaRef id="dash.kpi">
      <button type="button" onClick={onClick} className="group flex h-full w-full flex-col rounded-xl border border-line bg-white p-4 text-left shadow-[var(--shadow-card)] transition hover:border-brand-300 hover:shadow-md">
        <div className="mb-3 flex items-center justify-between">
          <span className={cx('flex size-8 items-center justify-center rounded-lg', t)}>
            <Icon className="size-4" />
          </span>
          <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
        </div>
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-[26px] leading-tight font-semibold tracking-tight text-slate-900 tabular">{value}</p>
        <p className="mt-1 text-xs leading-snug text-slate-500">{hint}</p>
      </button>
    </PaRef>
  );
}

function ListCard({ title, icon, runs, today, empty, to, onMore, total, tone, showCompleted }: { title: string; icon: typeof Gauge; runs: ControlRun[]; today: string; empty: string; to?: string; onMore?: () => void; total?: number; tone?: 'red'; showCompleted?: boolean }) {
  const { name } = useUsers();
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            {total !== undefined && total > 0 && <Badge tone={tone === 'red' ? 'red' : 'neutral'}>{total}</Badge>}
          </span>
        }
        icon={icon}
        actions={
          to ? (
            <Link to={to} className="text-[13px] font-medium text-brand-700 hover:underline">
              Zobrazit vše
            </Link>
          ) : onMore && (total ?? 0) > 0 ? (
            <button onClick={onMore} className="text-[13px] font-medium text-brand-700 hover:underline">
              Zobrazit vše
            </button>
          ) : undefined
        }
      />
      {runs.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-slate-500">{empty}</p>
      ) : (
        <ul className="-mx-2 divide-y divide-line">
          {runs.map((r) => (
            <li key={r.RunId}>
              <Link to={`/runs/${r.RunId}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-800">{r.ControlName}</span>
                  <span className="block truncate text-xs text-slate-500">
                    <span className="font-mono">{r.ControlCode}</span> · {r.RunCode} · {name(r.AssignedOwnerEmail)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <RunStatus run={r} today={today} />
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {showCompleted ? `dokončeno ${fmtDateTime(r.CompletedAt)}` : diffDays(today, r.DueDate) < 0 ? `termín ${fmtDate(r.DueDate)}` : `termín ${fmtRelative(r.DueDate, today)}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
