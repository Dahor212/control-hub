import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BookOpenCheck, Clock, Gauge, PieChart, Repeat, RotateCcw, ShieldAlert, Users } from 'lucide-react';
import { computeKpis, findingsTrend, groupKpis, isFindingOverdue, lastMonths, monthPeriod, problemControls, type KpiSet } from '../../domain/metrics';
import { METRIC_DEFINITIONS } from '../../domain/reports';
import { RISK_LABELS, SEVERITY_LABELS } from '../../domain/labels';
import { departmentScope } from '../../domain/permissions';
import type { RiskLevel } from '../../domain/types';
import { useApp } from '../AppContext';
import { useLookups, useScopedRuns, useUsers } from '../hooks';
import { drillHref, periodFromPreset, PERIOD_LABELS, type DrillView, type PeriodPreset } from '../drilldown';
import { DataTable } from '../components/DataTable';
import { MultiSelect } from '../components/Popover';
import { PaRef } from '../components/PaRef';
import { RateBars, RateLines, SEVERITY_RAMP, StackedBars, VIZ } from '../components/Charts';
import { RiskBadge } from '../components/StatusBadges';
import { Card, CardHeader, PageHeader, Select, cx } from '../components/ui';
import { fmtDate, fmtNum, fmtPct } from '../format';

export function ManagementPage() {
  const { today, session, store, version } = useApp();
  const nav = useNavigate();
  const scoped = useScopedRuns();
  const { departments, deptLabel } = useLookups();
  const { name } = useUsers();
  const [preset, setPreset] = useState<PeriodPreset>('thisMonth');
  const [depts, setDepts] = useState<string[]>([]);
  const period = periodFromPreset(preset, today);
  const base = useMemo(() => scoped.filter((r) => depts.length === 0 || depts.includes(r.Department)), [scoped, depts]);
  const k = useMemo(() => computeKpis(base, period, today), [base, period.from, period.to, today]);
  const scope = departmentScope(session);
  const findings = useMemo(() => {
    const ids = new Set(base.map((r) => r.RunId));
    return store.findings.filter((f) => ids.has(f.RunId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, base]);
  const openFindings = findings.filter((f) => f.Status !== 'Closed');
  const trendEnd = period.to > today ? today : period.to;
  const trend = useMemo(
    () =>
      lastMonths(trendEnd, 12).map((mk) => {
        const kk = computeKpis(base, monthPeriod(mk), today);
        const [y, m] = mk.split('-').map(Number);
        return { label: `${m}/${String(y).slice(2)}`, onTimeRate: kk.onTimeRate, completionRate: kk.completionRate };
      }),
    [base, trendEnd, today],
  );
  const byDept = useMemo(() => groupKpis(base, period, today, (r) => r.Department), [base, period.from, period.to, today]);
  const byOwner = useMemo(() => groupKpis(base, period, today, (r) => r.AssignedOwnerEmail).filter((g) => g.kpi.planned > 0), [base, period.from, period.to, today]);
  const byRisk = useMemo(() => groupKpis(base, period, today, (r) => r.RiskLevel), [base, period.from, period.to, today]);
  const problems = useMemo(() => problemControls(base, period, today, 10), [base, period.from, period.to, today]);
  const fTrend = useMemo(() => findingsTrend(findings, trendEnd, 6), [findings, trendEnd]);
  const drill = (view: DrillView, extra: Record<string, unknown> = {}) => nav(drillHref({ view, from: period.from, to: period.to, departments: depts, ...extra }));

  const metrics: Array<{ label: string; value: string; hint: string; icon: typeof Gauge; onClick: () => void; tone?: 'red' | 'amber' | 'green' }> = [
    { label: 'Míra včasného dokončení', value: fmtPct(k.onTimeRate, 1), hint: `${k.onTime} včas z ${k.evaluable} vyhodnotitelných`, icon: Gauge, onClick: () => drill('evaluable'), tone: k.onTimeRate === null ? undefined : k.onTimeRate >= 0.95 ? 'green' : k.onTimeRate >= 0.85 ? 'amber' : 'red' },
    { label: 'Podíl dokončených', value: fmtPct(k.completionRate, 1), hint: `${k.completed} z ${k.planned} naplánovaných (zrušeno ${k.cancelled})`, icon: PieChart, onClick: () => drill('completed') },
    { label: 'Po termínu', value: String(k.overdueOpen), hint: 'nedokončené s uplynulým termínem', icon: AlertTriangle, onClick: () => drill('overdue'), tone: k.overdueOpen ? 'red' : undefined },
    { label: 'Průměrné prodlení', value: k.avgDelayDays === null ? '–' : `${fmtNum(k.avgDelayDays)} dne`, hint: `u ${k.late} kontrol dokončených pozdě`, icon: Clock, onClick: () => drill('late') },
    { label: 'Opakovaně opožděné', value: String(k.repeatedlyLateControls), hint: 'kontroly s ≥ 2 pozdními / prošlými běhy', icon: Repeat, onClick: () => drill('repeatLate', { title: 'Běhy opakovaně opožděných kontrol' }), tone: k.repeatedlyLateControls ? 'amber' : undefined },
    { label: 'Vrácené ke schválení', value: String(k.returnedRuns), hint: 'běhy alespoň jednou vrácené k doplnění', icon: RotateCcw, onClick: () => drill('returnedAny') },
    { label: 'Otevřená nápravná opatření', value: String(openFindings.length), hint: `${openFindings.filter((f) => isFindingOverdue(f, today)).length} po termínu nápravy`, icon: ShieldAlert, onClick: () => nav('/findings?status=open'), tone: openFindings.some((f) => isFindingOverdue(f, today)) ? 'red' : undefined },
  ];

  return (
    <div>
      <PageHeader
        title="Manažerský přehled"
        subtitle={`Plní útvar plánované kontroly? ${scope !== 'ALL' && session.activeRole === 'Manager' ? `Rozsah: ${deptLabel(scope)}.` : 'Rozsah: všechny útvary.'} Období ${fmtDate(period.from)} – ${fmtDate(period.to)}.`}
        actions={
          <>
            <Select className="w-auto" value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)} aria-label="Období">
              {(['thisMonth', 'lastMonth', 'thisQuarter', 'last6m', 'thisYear'] as PeriodPreset[]).map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </Select>
            <MultiSelect label="Útvar" value={depts} onChange={setDepts} options={departments.map((d) => ({ value: d.Code, label: d.Label }))} />
          </>
        }
      />
      <PaRef id="mgmt.metrics">
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {metrics.map((m) => (
            <button key={m.label} onClick={m.onClick} className="rounded-xl border border-line bg-white p-4 text-left shadow-[var(--shadow-card)] transition hover:border-brand-300 hover:shadow-md">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-slate-500">
                <m.icon className="size-4 text-slate-400" />
                {m.label}
              </div>
              <p className={cx('mt-2 text-[24px] leading-tight font-semibold tabular', m.tone === 'red' ? 'text-rose-700' : m.tone === 'amber' ? 'text-amber-700' : m.tone === 'green' ? 'text-emerald-700' : 'text-slate-900')}>{m.value}</p>
              <p className="mt-1 text-xs text-slate-500">{m.hint}</p>
            </button>
          ))}
        </div>
      </PaRef>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Porovnání útvarů" subtitle="Míra včasného dokončení v období" icon={Users} />
          <RateBars
            data={departments
              .filter((d) => depts.length === 0 || depts.includes(d.Code))
              .map((d) => {
                const g = byDept.find((x) => x.key === d.Code)?.kpi;
                return { key: d.Code, label: d.Label, value: g?.onTimeRate ?? null, sub: g ? `${g.onTime}/${g.evaluable} · po termínu ${g.overdueOpen}` : '' };
              })
              .filter((x) => x.sub)}
            onClick={(code) => drill('evaluable', { departments: [code] })}
          />
        </Card>
        <Card>
          <CardHeader title="Vývoj plnění v čase" subtitle="12 měsíců podle měsíce termínu splnění" />
          <RateLines
            data={trend}
            series={[
              { key: 'onTimeRate', label: 'Míra včasného dokončení', color: VIZ.primary },
              { key: 'completionRate', label: 'Podíl dokončených', color: '#1baf7a' },
            ]}
          />
        </Card>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-5">
        <PaRef id="mgmt.owners" className="xl:col-span-3">
          <Card>
            <CardHeader title="Odpovědné osoby" subtitle="Kdo má nedokončené úkoly a jak plní termíny" />
            <DataTable
              rows={byOwner}
              rowKey={(g) => g.key}
              dense
              pageSize={10}
              initialSort={{ key: 'overdue', dir: 'desc' }}
              onRowClick={(g) => drill('planned', { owners: [g.key] })}
              columns={[
                { key: 'name', header: 'Osoba', sort: (g) => name(g.key), render: (g) => <span className="font-medium text-slate-800">{name(g.key)}</span> },
                { key: 'planned', header: 'Plán', align: 'right', sort: (g) => g.kpi.planned, render: (g) => g.kpi.planned },
                { key: 'done', header: 'Dokonč.', align: 'right', sort: (g) => g.kpi.completed, render: (g) => g.kpi.completed },
                { key: 'rate', header: 'Včasnost', align: 'right', sort: (g) => g.kpi.onTimeRate ?? -1, render: (g) => <RateCell k={g.kpi} /> },
                { key: 'overdue', header: 'Po termínu', align: 'right', sort: (g) => g.kpi.overdueOpen, render: (g) => <span className={g.kpi.overdueOpen ? 'font-semibold text-rose-700' : ''}>{g.kpi.overdueOpen}</span> },
                { key: 'pending', header: 'Ke schválení', align: 'right', sort: (g) => g.kpi.pendingApproval, render: (g) => g.kpi.pendingApproval },
                { key: 'delay', header: 'Ø prodlení', align: 'right', sort: (g) => g.kpi.avgDelayDays ?? 0, render: (g) => (g.kpi.avgDelayDays === null ? '–' : `${fmtNum(g.kpi.avgDelayDays)} d`) },
              ]}
            />
          </Card>
        </PaRef>
        <Card className="xl:col-span-2">
          <CardHeader title="Rozložení podle rizikovosti" subtitle="Stav běhů v období podle rizika kontroly" />
          <StackedBars
            height={220}
            xKey="label"
            data={(['Critical', 'High', 'Medium', 'Low'] as RiskLevel[]).map((r) => {
              const g = byRisk.find((x) => x.key === r)?.kpi;
              return { label: RISK_LABELS[r], risk: r, onTime: g?.onTime ?? 0, late: g?.late ?? 0, overdue: g?.overdueOpen ?? 0, other: g ? g.planned - g.completed - g.overdueOpen : 0 };
            })}
            series={[
              { key: 'onTime', label: 'Včas', color: VIZ.onTime },
              { key: 'late', label: 'Pozdě', color: VIZ.late },
              { key: 'overdue', label: 'Po termínu', color: VIZ.overdue },
              { key: 'other', label: 'Ostatní otevřené', color: VIZ.open },
            ]}
            onClick={(row) => drill('planned', { riskLevels: [row.risk as string] })}
          />
        </Card>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-5">
        <PaRef id="mgmt.problems" className="xl:col-span-3">
          <Card>
            <CardHeader title="TOP problematické kontroly" subtitle="Skóre = (pozdě + 2 × po termínu + vrácení) × váha rizika" icon={AlertTriangle} />
            <DataTable
              rows={problems}
              rowKey={(p) => p.controlId}
              dense
              pageSize={10}
              emptyTitle="V období nejsou problémové kontroly"
              onRowClick={(p) => drill('all', { controlIds: [p.controlId], title: `Běhy ${p.controlCode} v období` })}
              columns={[
                { key: 'code', header: 'Kontrola', render: (p) => <span><span className="font-mono text-xs text-slate-500">{p.controlCode}</span> <span className="font-medium text-slate-800">{p.name}</span></span> },
                { key: 'risk', header: 'Riziko', render: (p) => <RiskBadge risk={p.riskLevel} /> },
                { key: 'planned', header: 'Plán', align: 'right', render: (p) => p.planned },
                { key: 'late', header: 'Pozdě', align: 'right', render: (p) => p.late },
                { key: 'overdue', header: 'Po termínu', align: 'right', render: (p) => <span className={p.overdue ? 'font-semibold text-rose-700' : ''}>{p.overdue}</span> },
                { key: 'ret', header: 'Vráceno', align: 'right', render: (p) => p.returned },
                { key: 'score', header: 'Skóre', align: 'right', render: (p) => <span className="font-semibold">{p.score}</span> },
              ]}
            />
          </Card>
        </PaRef>
        <Card className="xl:col-span-2">
          <CardHeader title="Trend zjištění" subtitle="Nově založená zjištění podle závažnosti" actions={<Link to="/findings" className="text-[13px] font-medium text-brand-700 hover:underline">Nápravná opatření</Link>} />
          <StackedBars
            height={220}
            xKey="label"
            data={fTrend}
            series={(['Low', 'Medium', 'High', 'Critical'] as const).map((s) => ({ key: s, label: SEVERITY_LABELS[s], color: SEVERITY_RAMP[s] }))}
            extraTooltip={(row) => <>Uzavřeno v měsíci: <b>{row.closed as number}</b></>}
          />
        </Card>
      </div>

      <Card>
        <CardHeader title="Definice ukazatelů" subtitle="Metriky mají jednoznačnou definici – stejnou na dashboardu, v manažerském přehledu i v archivovaném reportu." icon={BookOpenCheck} />
        <ul className="grid gap-x-8 gap-y-2 text-[13px] text-slate-600 md:grid-cols-2">
          {Object.values(METRIC_DEFINITIONS).map((d) => (
            <li key={d} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400" />
              {d}
            </li>
          ))}
          <li className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400" />
            Dokončeno v období (bez ohledu na termín) = {k.completedDuringPeriod} běhů – liší se od „dokončeno z plánu období“ ({k.completed}).
          </li>
        </ul>
      </Card>
    </div>
  );
}

function RateCell({ k }: { k: KpiSet }) {
  const v = k.onTimeRate;
  return <span className={cx('font-medium tabular', v === null ? 'text-slate-400' : v >= 0.95 ? 'text-emerald-700' : v >= 0.85 ? 'text-amber-700' : 'text-rose-700')}>{fmtPct(v, 0)}</span>;
}
