/** Kalendář běhů – měsíc / týden / seznam. Bez drag-and-drop: změna termínu jde přes dialog s volbou rozsahu. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, List, PenLine, Rows3 } from 'lucide-react';
import { addDays, addMonthsClamped, dayOfWeek, endOfMonth, mondayOf, parseISODate, startOfMonth, datesInRange } from '../../domain/dates';
import { categorize, RUN_CATEGORY_LABELS, type RunCategory } from '../../domain/metrics';
import { canReschedule } from '../../domain/permissions';
import { MONTH_NAMES, RISK_WEIGHT, WEEKDAY_SHORT } from '../../domain/labels';
import type { ControlRun } from '../../domain/types';
import { calendar } from '../../services/core';
import { useApp } from '../AppContext';
import { useLookups, useScopedRuns, useUsers } from '../hooks';
import { Dialog } from '../components/Dialog';
import { MultiSelect } from '../components/Popover';
import { PaRef } from '../components/PaRef';
import { RiskBadge, RunStatus } from '../components/StatusBadges';
import { Button, Card, Checkbox, DescriptionList, PageHeader, Segmented, cx } from '../components/ui';
import { VIZ, Legend } from '../components/Charts';
import { RunEditDialog } from '../dialogs/RunDialogs';
import { fmtDate, fmtPeriod } from '../format';

const CAT_COLOR: Record<RunCategory, string> = {
  onTime: VIZ.onTime,
  late: VIZ.late,
  pendingApproval: VIZ.pending,
  overdue: VIZ.overdue,
  inProgress: VIZ.progress,
  returned: VIZ.returned,
  open: VIZ.open,
  planned: '#b8c1cd',
  cancelled: '#d8dde4',
};

export function CalendarPage() {
  const { today, store, session } = useApp();
  const scoped = useScopedRuns();
  const { departments, deptLabel } = useLookups();
  const { users, name } = useUsers();
  const nav = useNavigate();
  const [view, setView] = useState<'month' | 'week' | 'list'>('month');
  const [anchor, setAnchor] = useState(today);
  const [by, setBy] = useState<'scheduled' | 'due'>('scheduled');
  const [owners, setOwners] = useState<string[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [hideDaily, setHideDaily] = useState(false);
  const [selected, setSelected] = useState<ControlRun | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [editRun, setEditRun] = useState<ControlRun | null>(null);
  const cal = calendar(store);

  const range = useMemo(() => {
    if (view === 'week') {
      const s = mondayOf(anchor);
      return { from: s, to: addDays(s, 6) };
    }
    if (view === 'list') return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    const s = mondayOf(startOfMonth(anchor));
    return { from: s, to: addDays(s, 41) };
  }, [view, anchor]);

  const dateOf = (r: ControlRun) => (by === 'due' ? r.DueDate : r.ScheduledDate);
  const events = useMemo(() => {
    const map = new Map<string, ControlRun[]>();
    for (const r of scoped) {
      if (r.WorkflowState === 'Cancelled') continue;
      const d = dateOf(r);
      if (d < range.from || d > range.to) continue;
      if (owners.length && !owners.includes(r.AssignedOwnerEmail)) continue;
      if (depts.length && !depts.includes(r.Department)) continue;
      if (hideDaily && (r.RecurrenceType === 'Daily' || r.RecurrenceType === 'Workday')) continue;
      if (cats.length && !cats.includes(categorize(r, today))) continue;
      map.set(d, [...(map.get(d) ?? []), r]);
    }
    for (const list of map.values())
      list.sort((a, b) => {
        const oa = categorize(a, today) === 'overdue' ? 0 : 1;
        const ob = categorize(b, today) === 'overdue' ? 0 : 1;
        const da = a.RecurrenceType === 'Daily' || a.RecurrenceType === 'Workday' ? 1 : 0;
        const db = b.RecurrenceType === 'Daily' || b.RecurrenceType === 'Workday' ? 1 : 0;
        return oa - ob || da - db || RISK_WEIGHT[b.RiskLevel] - RISK_WEIGHT[a.RiskLevel] || a.ControlCode.localeCompare(b.ControlCode);
      });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, range.from, range.to, owners, depts, cats, hideDaily, by, today]);

  const move = (dir: -1 | 1) => setAnchor(view === 'week' ? addDays(anchor, 7 * dir) : addMonthsClamped(startOfMonth(anchor), dir));
  const { y, m } = parseISODate(anchor);
  const title = view === 'week' ? `${fmtDate(range.from)} – ${fmtDate(range.to)}` : `${MONTH_NAMES[m - 1][0].toUpperCase()}${MONTH_NAMES[m - 1].slice(1)} ${y}`;
  const total = [...events.values()].reduce((a, b) => a + b.length, 0);
  const overdueCount = [...events.values()].flat().filter((r) => categorize(r, today) === 'overdue').length;

  const Chip = ({ r }: { r: ControlRun }) => {
    const c = categorize(r, today);
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setSelected(r);
        }}
        title={`${r.ControlCode} ${r.ControlName} – ${RUN_CATEGORY_LABELS[c]}`}
        className={cx('flex w-full items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-left text-[11.5px] hover:bg-slate-100', c === 'overdue' ? 'bg-rose-50 font-medium text-rose-800' : 'text-slate-700')}
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: CAT_COLOR[c] }} />
        <span className="font-mono text-[10.5px] text-slate-500">{r.ControlCode.replace('CTRL-', '')}</span>
        <span className="truncate">{r.ControlName}</span>
      </button>
    );
  };

  return (
    <div>
      <PageHeader
        title="Kalendář kontrol"
        subtitle="Konkrétní běhy podle plánovaného data nebo termínu splnění. Termín změníte z detailu události – u opakovaných kontrol s volbou rozsahu změny."
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'month', label: 'Měsíc', icon: CalendarDays },
              { value: 'week', label: 'Týden', icon: Rows3 },
              { value: 'list', label: 'Seznam', icon: List },
            ]}
          />
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-1">
          <button className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100" onClick={() => move(-1)} aria-label="Předchozí">
            <ChevronLeft className="size-4.5" />
          </button>
          <button className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100" onClick={() => move(1)} aria-label="Další">
            <ChevronRight className="size-4.5" />
          </button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>
            Dnes
          </Button>
          <span className="ml-2 text-[15px] font-semibold text-slate-900">{title}</span>
        </div>
        <span className="mx-2 h-6 w-px bg-line" />
        <Segmented
          size="sm"
          value={by}
          onChange={setBy}
          options={[
            { value: 'scheduled', label: 'Plánované datum' },
            { value: 'due', label: 'Termín splnění' },
          ]}
        />
        {session.activeRole !== 'ControlOwner' && <MultiSelect label="Osoba" value={owners} onChange={setOwners} options={users.map((u) => ({ value: u.Email, label: u.DisplayName }))} />}
        <MultiSelect label="Útvar" value={depts} onChange={setDepts} options={departments.map((d) => ({ value: d.Code, label: d.Label }))} />
        <MultiSelect label="Stav" value={cats} onChange={setCats} options={(Object.keys(RUN_CATEGORY_LABELS) as RunCategory[]).filter((c) => c !== 'cancelled').map((c) => ({ value: c, label: RUN_CATEGORY_LABELS[c] }))} />
        <Checkbox label="Skrýt denní kontroly" checked={hideDaily} onChange={setHideDaily} />
        <span className="ml-auto text-[13px] text-slate-500">
          {total} běhů{overdueCount ? <span className="ml-1 font-medium text-rose-600">· {overdueCount} po termínu</span> : null}
        </span>
      </div>
      <div className="mb-3">
        <Legend items={(['overdue', 'open', 'inProgress', 'returned', 'pendingApproval', 'onTime', 'late', 'planned'] as RunCategory[]).map((c) => ({ color: CAT_COLOR[c], label: RUN_CATEGORY_LABELS[c] }))} />
      </div>

      <PaRef id="cal.view">
        {view === 'month' && (
          <Card padded={false} className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line bg-slate-50/80 text-center text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {WEEKDAY_SHORT.map((w) => (
                <div key={w} className="py-2">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {datesInRange(range.from, range.to).map((d) => {
                const list = events.get(d) ?? [];
                const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
                const holiday = cal.holidayName(d);
                const weekend = dayOfWeek(d) >= 6;
                const overdue = list.filter((r) => categorize(r, today) === 'overdue').length;
                return (
                  <div
                    key={d}
                    onClick={() => list.length && setDayOpen(d)}
                    className={cx('min-h-[118px] border-r border-b border-line/80 p-1.5 [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-slate-50/60', (weekend || holiday) && inMonth && 'bg-slate-50/40', list.length > 0 && 'cursor-pointer hover:bg-brand-50/30')}
                  >
                    <div className="mb-1 flex items-center justify-between gap-1 px-0.5">
                      <span className={cx('flex size-6 items-center justify-center rounded-full text-[12px] font-medium tabular', d === today ? 'bg-brand-600 text-white' : inMonth ? 'text-slate-700' : 'text-slate-400')}>{parseISODate(d).d}</span>
                      <span className="flex items-center gap-1">
                        {overdue > 0 && <span className="rounded bg-rose-100 px-1 text-[10px] font-semibold text-rose-700" title="po termínu">{overdue}!</span>}
                        {list.length > 0 && <span className="rounded bg-slate-100 px-1.5 text-[10.5px] font-medium text-slate-600 tabular">{list.length}</span>}
                      </span>
                    </div>
                    {holiday && <p className="mb-0.5 truncate px-1 text-[10px] text-amber-700" title={holiday}>{holiday}</p>}
                    <div className="space-y-0.5">
                      {list.slice(0, holiday ? 2 : 3).map((r) => (
                        <Chip key={r.RunId} r={r} />
                      ))}
                      {list.length > (holiday ? 2 : 3) && <p className="px-1.5 text-[11px] font-medium text-brand-700">+{list.length - (holiday ? 2 : 3)} další</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
        {view === 'week' && (
          <div className="grid gap-3 md:grid-cols-7">
            {datesInRange(range.from, range.to).map((d, i) => {
              const list = events.get(d) ?? [];
              return (
                <Card key={d} padded={false} className={cx('min-h-[260px]', d === today && 'ring-2 ring-brand-400')}>
                  <div className="border-b border-line px-3 py-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase">{WEEKDAY_SHORT[i]}</p>
                    <p className={cx('text-[15px] font-semibold', d === today ? 'text-brand-700' : 'text-slate-900')}>{fmtDate(d)}</p>
                    {cal.holidayName(d) && <p className="text-[11px] text-amber-700">{cal.holidayName(d)}</p>}
                  </div>
                  <div className="space-y-1 p-1.5">
                    {list.map((r) => (
                      <Chip key={r.RunId} r={r} />
                    ))}
                    {list.length === 0 && <p className="px-1.5 py-3 text-center text-[11.5px] text-slate-400">—</p>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        {view === 'list' && (
          <Card>
            {[...events.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([d, list]) => (
                <div key={d} className="border-b border-line py-3 last:border-0">
                  <p className={cx('mb-2 text-[13px] font-semibold', d === today ? 'text-brand-700' : 'text-slate-800')}>
                    {WEEKDAY_SHORT[dayOfWeek(d) - 1]} {fmtDate(d)} {d === today && '· dnes'} {cal.holidayName(d) && <span className="font-normal text-amber-700">· {cal.holidayName(d)}</span>}
                  </p>
                  <ul className="space-y-1">
                    {list.map((r) => (
                      <li key={r.RunId}>
                        <button onClick={() => setSelected(r)} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-slate-50">
                          <span className="size-2 rounded-full" style={{ background: CAT_COLOR[categorize(r, today)] }} />
                          <span className="w-20 font-mono text-xs text-slate-500">{r.ControlCode}</span>
                          <span className="flex-1 truncate text-[13px] text-slate-800">{r.ControlName}</span>
                          <span className="hidden text-xs text-slate-500 md:inline">{name(r.AssignedOwnerEmail)}</span>
                          <RunStatus run={r} today={today} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            {events.size === 0 && <p className="py-8 text-center text-[13px] text-slate-500">V tomto měsíci nejsou žádné běhy odpovídající filtrům.</p>}
          </Card>
        )}
      </PaRef>

      <Dialog open={!!dayOpen} onClose={() => setDayOpen(null)} title={dayOpen ? `Běhy ${fmtDate(dayOpen)}` : ''} size="md">
        <ul className="space-y-1">
          {(dayOpen ? events.get(dayOpen) ?? [] : []).map((r) => (
            <li key={r.RunId}>
              <button
                onClick={() => {
                  setDayOpen(null);
                  setSelected(r);
                }}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-50"
              >
                <span className="size-2 rounded-full" style={{ background: CAT_COLOR[categorize(r, today)] }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-800">{r.ControlName}</span>
                  <span className="block text-xs text-slate-500">
                    {r.ControlCode} · {r.RunCode} · {name(r.AssignedOwnerEmail)}
                  </span>
                </span>
                <RunStatus run={r} today={today} />
              </button>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? selected.ControlName : ''}
        description={selected ? `${selected.ControlCode} · ${selected.RunCode}` : ''}
        size="md"
        footer={
          selected && (
            <>
              <Button variant="ghost" onClick={() => nav(`/controls/${selected.ControlId}`)}>
                Definice kontroly
              </Button>
              <Button icon={PenLine} disabled={!canReschedule(session, selected).allowed} title={canReschedule(session, selected).reason} onClick={() => { setEditRun(selected); setSelected(null); }}>
                Změnit termín
              </Button>
              <Button variant="primary" icon={ExternalLink} onClick={() => nav(`/runs/${selected.RunId}`)}>
                Otevřít záznam
              </Button>
            </>
          )
        }
      >
        {selected && (
          <PaRef id="cal.event">
            <div className="mb-4 flex flex-wrap gap-1.5">
              <RunStatus run={selected} today={today} />
              <RiskBadge risk={selected.RiskLevel} />
            </div>
            <DescriptionList
              items={[
                { label: 'Plánováno', value: fmtDate(selected.ScheduledDate) },
                { label: 'Termín splnění', value: fmtDate(selected.DueDate) },
                { label: 'Kontrolované období', value: fmtPeriod(selected.PeriodFrom, selected.PeriodTo) },
                { label: 'Útvar', value: deptLabel(selected.Department) },
                { label: 'Odpovědná osoba', value: name(selected.AssignedOwnerEmail) },
                { label: 'Schvalovatel', value: selected.ApprovalRequired ? name(selected.ReviewerEmail) : '—' },
              ]}
            />
          </PaRef>
        )}
      </Dialog>
      {editRun && <RunEditDialog run={store.runs.get(editRun.RunId) ?? editRun} open onClose={() => setEditRun(null)} />}
    </div>
  );
}
