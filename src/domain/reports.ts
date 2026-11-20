/**
 * Měsíční manažerský report (FLOW-05).
 * Výsledkem je neměnný snapshot metrik k okamžiku vytvoření. Archivovaný report se
 * nepřepočítává podle aktuálního stavu databáze – nová verze vzniká jen novým vygenerováním.
 */
import { endOfMonth, makeISODate, monthIndex, monthIndexToYM, toPragueDate } from './dates';
import { MONTH_SHORT } from './labels';
import { computeKpis, isFindingOverdue, lastMonths, monthPeriod, problemControls, type KpiSet } from './metrics';
import { runAsOf } from './status';
import type { ControlRun, DirectoryUser, Finding, ISODate, ISODateTime, LookupItem, MonthlyReportData, PersonRef, ReportMetricsRow } from './types';

export const METRIC_DEFINITIONS: Record<string, string> = {
  planned: 'Naplánováno = nezrušené běhy s termínem splnění (DueDate) v reportovaném měsíci.',
  completed: 'Dokončeno = běhy z plánu ve stavu Dokončeno (u schvalovaných kontrol po schválení).',
  onTime: 'Včas = dokončené běhy, jejichž datum provedení (poslední odeslání) ≤ termín splnění.',
  late: 'Opožděně = dokončené běhy s datem provedení po termínu splnění.',
  notCompleted: 'Nedokončeno = běhy z plánu, které k datu reportu nejsou dokončeny (včetně čekajících na schválení).',
  onTimeRate: 'Míra včasného plnění = Včas / Vyhodnotitelné; vyhodnotitelné = běhy s uplynulým termínem nebo dokončené.',
  cancelled: 'Zrušené běhy se do plánu ani do míry plnění nezapočítávají; vykazují se samostatně.',
  asOf: 'Stav běhů je rekonstruován k datu vytvoření reportu z časových značek workflow.',
};

function row(key: string, label: string, k: KpiSet): ReportMetricsRow {
  return {
    key,
    label,
    planned: k.planned,
    completed: k.completed,
    onTime: k.onTime,
    late: k.late,
    notCompleted: k.notCompleted,
    overdueOpen: k.overdueOpen,
    pendingApproval: k.pendingApproval,
    cancelled: k.cancelled,
    evaluable: k.evaluable,
    onTimeRate: k.onTimeRate,
    completionRate: k.completionRate,
  };
}

/** Uzavřené měsíce, které lze reportovat k danému dni (aktuální měsíc ne). */
export function closedMonths(today: ISODate, count = 12): string[] {
  const idx = monthIndex(today) - 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const { y, m } = monthIndexToYM(idx - i);
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

export function buildMonthlyReport(p: {
  year: number;
  month: number;
  scope: string;
  runs: ControlRun[];
  findings: Finding[];
  departments: LookupItem[];
  directory: Map<string, DirectoryUser>;
  asOfDate: ISODate;
  generatedAt: ISODateTime;
  generatedBy: PersonRef;
}): MonthlyReportData {
  const mk = `${p.year}-${String(p.month).padStart(2, '0')}`;
  const period = monthPeriod(mk);
  const deptList = p.departments.filter((d) => d.LookupType === 'Department' && (p.scope === 'ALL' || d.Code === p.scope)).sort((a, b) => a.SortOrder - b.SortOrder);
  const scoped = p.runs.filter((r) => !r.IsSuperseded && (p.scope === 'ALL' || r.Department === p.scope)).map((r) => runAsOf(r, p.asOfDate));
  const total = computeKpis(scoped, period, p.asOfDate);
  const departments = deptList.map((d) => row(d.Code, d.Label, computeKpis(scoped.filter((r) => r.Department === d.Code), period, p.asOfDate)));
  const name = (e: string) => p.directory.get(e)?.DisplayName ?? e;
  const scopedFindings = p.findings.filter((f) => p.scope === 'ALL' || f.Department === p.scope);
  const createdIn = (f: Finding) => toPragueDate(f.CreatedAt).startsWith(mk);
  const day = (v: string) => toPragueDate(v);
  const significant = scopedFindings
    .filter((f) => createdIn(f) && (f.Severity === 'High' || f.Severity === 'Critical'))
    .map((f) => ({ code: f.FindingCode, controlCode: f.ControlCode, description: f.FindingDescription, severity: f.Severity, status: f.Status, responsible: name(f.ResponsiblePerson), dueDate: f.DueDate }));
  const openAsOf = scopedFindings
    .filter((f) => day(f.CreatedAt) <= p.asOfDate && (f.Status !== 'Closed' || (f.ClosedAt && day(f.ClosedAt) > p.asOfDate)))
    .map((f) => ({ code: f.FindingCode, controlCode: f.ControlCode, description: f.FindingDescription, severity: f.Severity, responsible: name(f.ResponsiblePerson), dueDate: f.DueDate, overdue: isFindingOverdue({ ...f, Status: 'Open' }, p.asOfDate) }));
  const problems = problemControls(scoped, period, p.asOfDate, 10).map((pc) => ({
    controlCode: pc.controlCode,
    name: pc.name,
    department: pc.department,
    late: pc.late,
    notCompleted: pc.overdue,
    planned: pc.planned,
  }));
  const trend = lastMonths(makeISODate(p.year, p.month, 1), 6).map((m) => {
    const k = computeKpis(scoped, monthPeriod(m), p.asOfDate);
    const [yy, mm] = m.split('-').map(Number);
    return { monthKey: m, label: `${MONTH_SHORT[mm - 1]} ${yy}`, planned: k.planned, onTime: k.onTime, late: k.late, notCompleted: k.notCompleted, onTimeRate: k.onTimeRate };
  });
  const scopeLabel = p.scope === 'ALL' ? 'Všechny útvary backoffice' : deptList[0]?.Label ?? p.scope;
  return {
    schema: 'control-hub/monthly-report@1',
    reportingYear: p.year,
    reportingMonth: p.month,
    periodFrom: period.from,
    periodTo: endOfMonth(period.from),
    asOfDate: p.asOfDate,
    generatedAt: p.generatedAt,
    generatedBy: p.generatedBy,
    scope: p.scope,
    scopeLabel,
    total: row('TOTAL', 'Celkem', total),
    departments,
    significantFindings: significant,
    openFindings: openAsOf,
    problemControls: problems,
    trend,
    definitions: METRIC_DEFINITIONS,
  };
}
