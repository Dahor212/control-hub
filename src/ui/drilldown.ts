/**
 * Proklik ze statistik do seznamu běhů. Výběr používá stejné definice jako KPI (metrics.ts),
 * takže počet na kartě vždy odpovídá počtu řádků v seznamu.
 */
import { addDays, endOfMonth, makeISODate, monthIndex, monthIndexToYM, parseISODate, startOfMonth, toPragueDate } from '../domain/dates';
import { inPeriod, matchesFilter, type Period, type RunFilter } from '../domain/metrics';
import { computeTiming, isOwnerPending } from '../domain/status';
import type { ControlRun, ISODate } from '../domain/types';

export type DrillView =
  | 'all'
  | 'planned'
  | 'completed'
  | 'onTime'
  | 'late'
  | 'overdue'
  | 'dueSoon'
  | 'pending'
  | 'inProgress'
  | 'returned'
  | 'notCompleted'
  | 'cancelled'
  | 'completedDuring'
  | 'repeatLate'
  | 'returnedAny'
  | 'evaluable';

export const DRILL_LABELS: Record<DrillView, string> = {
  all: 'Všechny běhy v období',
  planned: 'Naplánované běhy v období',
  completed: 'Dokončené běhy (z plánu období)',
  onTime: 'Dokončeno včas',
  late: 'Dokončeno po termínu',
  overdue: 'Běhy po termínu',
  dueSoon: 'Termín v následujících 7 dnech',
  pending: 'Čekající na schválení',
  inProgress: 'Rozpracované běhy',
  returned: 'Vrácené k doplnění',
  notCompleted: 'Nedokončené běhy v období',
  cancelled: 'Zrušené běhy v období',
  completedDuring: 'Dokončené během období (bez ohledu na termín)',
  repeatLate: 'Opakovaně opožděné kontroly',
  returnedAny: 'Běhy vrácené ke schválení',
  evaluable: 'Vyhodnotitelné běhy (základ míry včasnosti)',
};

export type PeriodPreset = 'thisMonth' | 'lastMonth' | 'last30' | 'thisQuarter' | 'last6m' | 'thisYear' | 'custom';

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  thisMonth: 'Tento měsíc',
  lastMonth: 'Minulý měsíc',
  last30: 'Posledních 30 dní',
  thisQuarter: 'Toto čtvrtletí',
  last6m: 'Posledních 6 měsíců',
  thisYear: 'Letos',
  custom: 'Vlastní období',
};

export function periodFromPreset(preset: PeriodPreset, today: ISODate, custom?: Period): Period {
  const { y, m } = parseISODate(today);
  switch (preset) {
    case 'lastMonth': {
      const p = monthIndexToYM(monthIndex(today) - 1);
      const s = makeISODate(p.y, p.m, 1);
      return { from: s, to: endOfMonth(s) };
    }
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'thisQuarter': {
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      const s = makeISODate(y, qm, 1);
      const e = monthIndexToYM(monthIndex(s) + 2);
      return { from: s, to: endOfMonth(makeISODate(e.y, e.m, 1)) };
    }
    case 'last6m': {
      const p = monthIndexToYM(monthIndex(today) - 5);
      return { from: makeISODate(p.y, p.m, 1), to: endOfMonth(today) };
    }
    case 'thisYear':
      return { from: makeISODate(y, 1, 1), to: makeISODate(y, 12, 31) };
    case 'custom':
      return custom ?? { from: startOfMonth(today), to: endOfMonth(today) };
    case 'thisMonth':
    default:
      return { from: startOfMonth(today), to: endOfMonth(today) };
  }
}

export interface DrillParams extends RunFilter {
  view: DrillView;
  from?: string;
  to?: string;
  mine?: string;
  title?: string;
}

const LIST_KEYS: Array<keyof RunFilter> = ['departments', 'owners', 'states', 'recurrenceTypes', 'categories', 'riskLevels', 'controlIds'];

export function drillHref(p: DrillParams): string {
  const sp = new URLSearchParams();
  sp.set('view', p.view);
  if (p.from) sp.set('from', p.from);
  if (p.to) sp.set('to', p.to);
  if (p.mine) sp.set('mine', p.mine);
  if (p.title) sp.set('title', p.title);
  for (const k of LIST_KEYS) {
    const v = p[k];
    if (v && v.length) sp.set(k, v.join(','));
  }
  return `/runs?${sp.toString()}`;
}

export function parseDrill(sp: URLSearchParams): DrillParams {
  const list = (k: string) => (sp.get(k) ? sp.get(k)!.split(',').filter(Boolean) : []);
  return {
    view: (sp.get('view') as DrillView) || 'all',
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    mine: sp.get('mine') ?? undefined,
    title: sp.get('title') ?? undefined,
    departments: list('departments'),
    owners: list('owners'),
    states: list('states'),
    recurrenceTypes: list('recurrenceTypes'),
    categories: list('categories'),
    riskLevels: list('riskLevels'),
    controlIds: list('controlIds'),
  };
}

export function selectRuns(runs: ControlRun[], p: DrillParams, today: ISODate): ControlRun[] {
  const base = runs.filter((r) => !r.IsSuperseded && matchesFilter(r, p) && (!p.mine || r.AssignedOwnerEmail === p.mine || r.BackupOwnerEmail === p.mine));
  const period: Period | null = p.from && p.to ? { from: p.from, to: p.to } : null;
  const inP = (r: ControlRun) => !period || inPeriod(r.DueDate, period);
  const P = base.filter((r) => inP(r) && r.WorkflowState !== 'Cancelled');
  const late = (r: ControlRun) => computeTiming(r, today).isLate;
  switch (p.view) {
    case 'planned':
      return P;
    case 'completed':
      return P.filter((r) => r.WorkflowState === 'Completed');
    case 'onTime':
      return P.filter((r) => r.WorkflowState === 'Completed' && !late(r));
    case 'late':
      return P.filter((r) => r.WorkflowState === 'Completed' && late(r));
    case 'overdue':
      return P.filter((r) => isOwnerPending(r.WorkflowState) && r.DueDate < today);
    case 'evaluable':
      return P.filter((r) => r.WorkflowState === 'Completed' || r.DueDate < today);
    case 'dueSoon':
      return base.filter((r) => isOwnerPending(r.WorkflowState) && r.DueDate >= today && r.DueDate <= addDays(today, 7));
    case 'pending':
      return base.filter((r) => r.WorkflowState === 'Submitted');
    case 'inProgress':
      return base.filter((r) => r.WorkflowState === 'InProgress');
    case 'returned':
      return base.filter((r) => r.WorkflowState === 'Returned');
    case 'notCompleted':
      return P.filter((r) => r.WorkflowState !== 'Completed');
    case 'cancelled':
      return base.filter((r) => inP(r) && r.WorkflowState === 'Cancelled');
    case 'completedDuring':
      return base.filter((r) => r.WorkflowState === 'Completed' && r.CompletedAt && (!period || inPeriod(toPragueDate(r.CompletedAt), period)));
    case 'returnedAny':
      return P.filter((r) => r.ReturnCount > 0);
    case 'repeatLate': {
      const bad = P.filter((r) => (r.WorkflowState === 'Completed' && late(r)) || (isOwnerPending(r.WorkflowState) && r.DueDate < today));
      const counts = new Map<string, number>();
      for (const r of bad) counts.set(r.ControlId, (counts.get(r.ControlId) ?? 0) + 1);
      return bad.filter((r) => (counts.get(r.ControlId) ?? 0) >= 2);
    }
    case 'all':
    default:
      return base.filter(inP);
  }
}
