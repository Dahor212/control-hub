/**
 * Manažerské metriky – jednoznačné definice (viz docs/BUSINESS_RULES.md, kap. KPI).
 *
 * Populace období P = nezrušené, nenahrazené běhy s termínem splnění (DueDate) v období.
 *  - Naplánováno v období ........ |P|
 *  - Dokončeno (z plánu) ......... běhy z P ve stavu Completed
 *  - Dokončeno včas .............. Completed a datum provedení ≤ DueDate
 *  - Dokončeno pozdě ............. Completed a datum provedení > DueDate
 *  - Po termínu .................. běhy z P, které nejsou dokončené ani odeslané a DueDate < dnes
 *  - Vyhodnotitelné .............. běhy z P, jejichž termín již uplynul, nebo jsou dokončené
 *  - Míra včasného plnění ........ Dokončeno včas / Vyhodnotitelné
 *  - Podíl dokončených ........... Dokončeno / Naplánováno
 *  - Dokončeno v období .......... běhy, jejichž CompletedAt (pražský den) spadá do období – bez ohledu na termín
 * Zrušené běhy se do jmenovatele nezapočítávají a vykazují se samostatně.
 */
import { addDays, diffDays, monthIndex, monthIndexToYM, makeISODate, daysInMonth, toPragueDate } from './dates';
import { RISK_WEIGHT, monthShortLabel } from './labels';
import { computeTiming, isOwnerPending, performedDate } from './status';
import type { ControlRun, Finding, ISODate, RiskLevel } from './types';

export interface RunFilter {
  departments?: string[];
  owners?: string[];
  states?: string[];
  recurrenceTypes?: string[];
  categories?: string[];
  riskLevels?: string[];
  controlIds?: string[];
}

export function matchesFilter(run: ControlRun, f: RunFilter): boolean {
  const inList = (list: string[] | undefined, v: string | null) => !list || list.length === 0 || (v !== null && list.includes(v));
  return (
    inList(f.departments, run.Department) &&
    (!f.owners || f.owners.length === 0 || f.owners.includes(run.AssignedOwnerEmail) || (run.BackupOwnerEmail !== null && f.owners.includes(run.BackupOwnerEmail))) &&
    inList(f.states, run.WorkflowState) &&
    inList(f.recurrenceTypes, run.RecurrenceType) &&
    inList(f.categories, run.Category) &&
    inList(f.riskLevels, run.RiskLevel) &&
    inList(f.controlIds, run.ControlId)
  );
}

export interface Period {
  from: ISODate;
  to: ISODate;
}

export function inPeriod(date: ISODate, p: Period): boolean {
  return date >= p.from && date <= p.to;
}

export type RunCategory =
  | 'onTime'
  | 'late'
  | 'pendingApproval'
  | 'overdue'
  | 'inProgress'
  | 'returned'
  | 'open'
  | 'planned'
  | 'cancelled';

export const RUN_CATEGORY_LABELS: Record<RunCategory, string> = {
  onTime: 'Dokončeno včas',
  late: 'Dokončeno pozdě',
  pendingApproval: 'Čeká na schválení',
  overdue: 'Po termínu',
  inProgress: 'Rozpracováno',
  returned: 'Vráceno k doplnění',
  open: 'K provedení',
  planned: 'Naplánováno',
  cancelled: 'Zrušeno',
};

/** Jednoznačné zařazení běhu do kategorie pro grafy rozdělení stavů. */
export function categorize(run: ControlRun, today: ISODate): RunCategory {
  const t = computeTiming(run, today);
  switch (run.WorkflowState) {
    case 'Cancelled':
      return 'cancelled';
    case 'Completed':
      return t.isLate ? 'late' : 'onTime';
    case 'Submitted':
      return 'pendingApproval';
    default:
      if (t.status === 'Overdue') return 'overdue';
      if (run.WorkflowState === 'InProgress') return 'inProgress';
      if (run.WorkflowState === 'Returned') return 'returned';
      return run.ScheduledDate <= today ? 'open' : 'planned';
  }
}

export interface KpiSet {
  planned: number;
  cancelled: number;
  completed: number;
  onTime: number;
  late: number;
  overdueOpen: number;
  notCompleted: number;
  pendingApproval: number;
  evaluable: number;
  onTimeRate: number | null;
  completionRate: number | null;
  completedDuringPeriod: number;
  avgDelayDays: number | null;
  avgOverdueDays: number | null;
  repeatedlyLateControls: number;
  returnedRuns: number;
}

export function periodPopulation(runs: ControlRun[], period: Period): ControlRun[] {
  return runs.filter((r) => !r.IsSuperseded && inPeriod(r.DueDate, period));
}

export function computeKpis(runs: ControlRun[], period: Period, today: ISODate): KpiSet {
  const population = periodPopulation(runs, period);
  const P = population.filter((r) => r.WorkflowState !== 'Cancelled');
  const cancelled = population.length - P.length;
  let completed = 0;
  let onTime = 0;
  let late = 0;
  let overdueOpen = 0;
  let pendingApproval = 0;
  let evaluable = 0;
  let returnedRuns = 0;
  const delays: number[] = [];
  const overdueDays: number[] = [];
  const lateByControl = new Map<string, number>();

  for (const r of P) {
    const t = computeTiming(r, today);
    if (r.ReturnCount > 0) returnedRuns++;
    if (r.WorkflowState === 'Completed') {
      completed++;
      evaluable++;
      if (t.isLate) {
        late++;
        delays.push(t.daysLate);
        lateByControl.set(r.ControlId, (lateByControl.get(r.ControlId) ?? 0) + 1);
      } else onTime++;
      continue;
    }
    if (r.DueDate < today) evaluable++;
    if (r.WorkflowState === 'Submitted') pendingApproval++;
    if (isOwnerPending(r.WorkflowState) && r.DueDate < today) {
      overdueOpen++;
      overdueDays.push(diffDays(r.DueDate, today));
      lateByControl.set(r.ControlId, (lateByControl.get(r.ControlId) ?? 0) + 1);
    }
  }

  const completedDuringPeriod = runs.filter(
    (r) => !r.IsSuperseded && r.WorkflowState === 'Completed' && r.CompletedAt && inPeriod(toPragueDate(r.CompletedAt), period),
  ).length;
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

  return {
    planned: P.length,
    cancelled,
    completed,
    onTime,
    late,
    overdueOpen,
    notCompleted: P.length - completed,
    pendingApproval,
    evaluable,
    onTimeRate: evaluable ? onTime / evaluable : null,
    completionRate: P.length ? completed / P.length : null,
    completedDuringPeriod,
    avgDelayDays: avg(delays),
    avgOverdueDays: avg(overdueDays),
    repeatedlyLateControls: [...lateByControl.values()].filter((n) => n >= 2).length,
    returnedRuns,
  };
}

/** Provozní ukazatele nezávislé na období (aktuální stav k dnešku). */
export function operationalCounts(runs: ControlRun[], today: ISODate, horizonDays = 7) {
  const live = runs.filter((r) => !r.IsSuperseded);
  const limit = addDays(today, horizonDays);
  return {
    overdueNow: live.filter((r) => isOwnerPending(r.WorkflowState) && r.DueDate < today).length,
    dueSoon: live.filter((r) => isOwnerPending(r.WorkflowState) && r.DueDate >= today && r.DueDate <= limit).length,
    pendingApproval: live.filter((r) => r.WorkflowState === 'Submitted').length,
    inProgress: live.filter((r) => r.WorkflowState === 'InProgress').length,
    returned: live.filter((r) => r.WorkflowState === 'Returned').length,
  };
}

export interface TrendPoint {
  monthKey: string;
  label: string;
  planned: number;
  onTime: number;
  late: number;
  notCompleted: number;
  onTimeRate: number | null;
}

export function monthPeriod(monthKeyValue: string): Period {
  const [y, m] = monthKeyValue.split('-').map(Number);
  return { from: makeISODate(y, m, 1), to: makeISODate(y, m, daysInMonth(y, m)) };
}

export function lastMonths(endDate: ISODate, count: number): string[] {
  const end = monthIndex(endDate);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const { y, m } = monthIndexToYM(end - i);
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

export function monthlyTrend(runs: ControlRun[], endDate: ISODate, months: number, today: ISODate): TrendPoint[] {
  return lastMonths(endDate, months).map((mk) => {
    const k = computeKpis(runs, monthPeriod(mk), today);
    return {
      monthKey: mk,
      label: monthShortLabel(mk),
      planned: k.planned,
      onTime: k.onTime,
      late: k.late,
      notCompleted: k.notCompleted,
      onTimeRate: k.onTimeRate,
    };
  });
}

export function groupKpis(
  runs: ControlRun[],
  period: Period,
  today: ISODate,
  keyOf: (r: ControlRun) => string,
): Array<{ key: string; kpi: KpiSet }> {
  const groups = new Map<string, ControlRun[]>();
  for (const r of runs) {
    const k = keyOf(r);
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, kpi: computeKpis(list, period, today) }));
}

export function statusDistribution(runs: ControlRun[], period: Period, today: ISODate): Array<{ category: RunCategory; count: number }> {
  const counts = new Map<RunCategory, number>();
  for (const r of periodPopulation(runs, period)) {
    const c = categorize(r, today);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const order: RunCategory[] = ['onTime', 'late', 'pendingApproval', 'overdue', 'inProgress', 'returned', 'open', 'planned', 'cancelled'];
  return order.filter((c) => counts.get(c)).map((c) => ({ category: c, count: counts.get(c) ?? 0 }));
}

/** Nejrizikovější nedokončené běhy: riziko × prodlení. */
export function topRiskyOpen(runs: ControlRun[], today: ISODate, limit = 8): Array<{ run: ControlRun; score: number; daysLate: number }> {
  return runs
    .filter((r) => !r.IsSuperseded && isOwnerPending(r.WorkflowState) && r.ScheduledDate <= addDays(today, 7))
    .map((r) => {
      const daysLate = Math.max(0, diffDays(r.DueDate, today));
      const daysToDue = diffDays(today, r.DueDate);
      const urgency = daysLate > 0 ? 10 + daysLate : Math.max(0, 7 - daysToDue);
      return { run: r, score: RISK_WEIGHT[r.RiskLevel as RiskLevel] * urgency, daysLate };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface ProblemControl {
  controlId: string;
  controlCode: string;
  name: string;
  department: string;
  riskLevel: RiskLevel;
  planned: number;
  late: number;
  overdue: number;
  returned: number;
  score: number;
}

export function problemControls(runs: ControlRun[], period: Period, today: ISODate, limit = 10): ProblemControl[] {
  const map = new Map<string, ProblemControl>();
  for (const r of periodPopulation(runs, period)) {
    if (r.WorkflowState === 'Cancelled') continue;
    let pc = map.get(r.ControlId);
    if (!pc) {
      pc = { controlId: r.ControlId, controlCode: r.ControlCode, name: r.ControlName, department: r.Department, riskLevel: r.RiskLevel, planned: 0, late: 0, overdue: 0, returned: 0, score: 0 };
      map.set(r.ControlId, pc);
    }
    pc.planned++;
    const t = computeTiming(r, today);
    if (r.WorkflowState === 'Completed' && t.isLate) pc.late++;
    if (isOwnerPending(r.WorkflowState) && r.DueDate < today) pc.overdue++;
    if (r.ReturnCount > 0) pc.returned++;
  }
  return [...map.values()]
    .map((pc) => ({ ...pc, score: (pc.late + pc.overdue * 2 + pc.returned) * RISK_WEIGHT[pc.riskLevel] }))
    .filter((pc) => pc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function findingsTrend(findings: Finding[], endDate: ISODate, months: number) {
  return lastMonths(endDate, months).map((mk) => {
    const inMonth = findings.filter((f) => toPragueDate(f.CreatedAt).startsWith(mk));
    return {
      monthKey: mk,
      label: monthShortLabel(mk),
      Low: inMonth.filter((f) => f.Severity === 'Low').length,
      Medium: inMonth.filter((f) => f.Severity === 'Medium').length,
      High: inMonth.filter((f) => f.Severity === 'High').length,
      Critical: inMonth.filter((f) => f.Severity === 'Critical').length,
      closed: findings.filter((f) => f.ClosedAt && toPragueDate(f.ClosedAt).startsWith(mk)).length,
    };
  });
}

export function isFindingOverdue(f: Finding, today: ISODate): boolean {
  return f.Status !== 'Closed' && f.DueDate < today;
}

export function formatRate(v: number | null, digits = 0): string {
  if (v === null || Number.isNaN(v)) return '–';
  return `${(v * 100).toFixed(digits).replace('.', ',')} %`;
}

export { performedDate };
