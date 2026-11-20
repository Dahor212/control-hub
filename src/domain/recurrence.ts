/**
 * Pravidla opakování kontrol – generování jednotlivých výskytů.
 *
 * Výskyt je určen nominálním datem (datum podle pravidla před posunem na pracovní den).
 * Z nominálního data se odvozuje stabilní OccurrenceKey (`CTRL-0001|2026-11-20`), který
 * zaručuje idempotenci: opakované generování nevytvoří duplicitu. Stejný algoritmus
 * popisuje docs/BUSINESS_RULES.md a FLOW-01 v docs/POWER_AUTOMATE_FLOWS.md.
 */
import {
  addDays,
  addWorkdays,
  applyShift,
  dayOfWeek,
  daysInMonth,
  defaultCalendar,
  diffDays,
  isoWeek,
  makeISODate,
  maxDate,
  minDate,
  mondayOf,
  monthIndex,
  monthIndexToYM,
  nthWorkdayOfMonth,
  parseISODate,
  previousWorkday,
  type WorkCalendar,
  isWorkday,
} from './dates';
import { MONTHLY_MODE_LABELS, WEEKDAY_SHORT } from './labels';
import type { DueDateRule, ISODate, RecurrenceSettings, RecurrenceType } from './types';

export interface ScheduleDefinition {
  ControlCode: string;
  RecurrenceType: RecurrenceType;
  RecurrenceInterval: number;
  RecurrenceSettings: RecurrenceSettings;
  DueDateRule: DueDateRule;
}

export interface Occurrence {
  occurrenceKey: string;
  nominalDate: ISODate;
  scheduledDate: ISODate;
  dueDate: ISODate;
  periodFrom: ISODate;
  periodTo: ISODate;
  runCode: string;
}

const MONTH_STEP: Partial<Record<RecurrenceType, number>> = {
  Monthly: 1,
  Quarterly: 3,
  SemiAnnual: 6,
  Annual: 12,
};

export function isMonthlyFamily(type: RecurrenceType): boolean {
  return MONTH_STEP[type] !== undefined;
}

export function monthStep(def: Pick<ScheduleDefinition, 'RecurrenceType' | 'RecurrenceInterval'>): number {
  const base = MONTH_STEP[def.RecurrenceType] ?? 1;
  return base * Math.max(1, def.RecurrenceInterval || 1);
}

export function occurrenceKeyFor(controlCode: string, nominal: ISODate): string {
  return `${controlCode}|${nominal}`;
}

/** Den v daném měsíci podle pravidla. null = výskyt se v tomto měsíci vynechá. */
export function dayInMonth(
  y: number,
  m: number,
  s: RecurrenceSettings,
  cal: WorkCalendar = defaultCalendar,
): ISODate | null {
  const dim = daysInMonth(y, m);
  switch (s.monthlyMode) {
    case 'LastDayOfMonth':
      return makeISODate(y, m, dim);
    case 'NthWorkday':
      return nthWorkdayOfMonth(y, m, Math.max(1, s.workdayNumber || 1), cal);
    case 'DayOfMonth':
    default: {
      const day = Math.min(Math.max(1, s.dayOfMonth || 1), 31);
      if (day <= dim) return makeISODate(y, m, day);
      return s.invalidDayPolicy === 'Skip' ? null : makeISODate(y, m, dim);
    }
  }
}

/** Nominální data výskytů v intervalu [from, to] (včetně). */
export function nominalDates(
  def: ScheduleDefinition,
  from: ISODate,
  to: ISODate,
  cal: WorkCalendar = defaultCalendar,
): ISODate[] {
  const s = def.RecurrenceSettings;
  const lower = maxDate(from, s.startDate);
  const upper = s.endDate ? minDate(to, s.endDate) : to;
  if (lower > upper) return [];
  const interval = Math.max(1, def.RecurrenceInterval || 1);
  const out: ISODate[] = [];

  switch (def.RecurrenceType) {
    case 'OneTime':
      if (s.startDate >= lower && s.startDate <= upper) out.push(s.startDate);
      break;

    case 'Daily': {
      const offset = diffDays(s.startDate, lower);
      const k = Math.ceil(offset / interval);
      for (let d = addDays(s.startDate, k * interval); d <= upper; d = addDays(d, interval)) out.push(d);
      break;
    }

    case 'Workday':
      for (let d = lower; d <= upper; d = addDays(d, 1)) if (isWorkday(d, cal)) out.push(d);
      break;

    case 'Weekly': {
      const days = (s.daysOfWeek?.length ? [...s.daysOfWeek] : [dayOfWeek(s.startDate)]).sort((a, b) => a - b);
      const anchorMonday = mondayOf(s.startDate);
      for (let monday = mondayOf(lower); monday <= upper; monday = addDays(monday, 7)) {
        const weekIndex = diffDays(anchorMonday, monday) / 7;
        if (weekIndex < 0 || weekIndex % interval !== 0) continue;
        for (const dow of days) {
          const d = addDays(monday, dow - 1);
          if (d >= lower && d <= upper) out.push(d);
        }
      }
      break;
    }

    default: {
      if (!isMonthlyFamily(def.RecurrenceType)) break;
      const step = monthStep(def);
      const startIdx = monthIndex(s.startDate);
      const kStart = Math.max(0, Math.floor((monthIndex(lower) - startIdx) / step) - 1);
      for (let k = kStart; ; k++) {
        const { y, m } = monthIndexToYM(startIdx + k * step);
        if (makeISODate(y, m, 1) > upper) break;
        const d = dayInMonth(y, m, s, cal);
        if (d && d >= lower && d <= upper) out.push(d);
      }
    }
  }
  return out;
}

/** Kontrolované období pro nominální datum. */
export function periodFor(
  def: ScheduleDefinition,
  nominal: ISODate,
  cal: WorkCalendar = defaultCalendar,
): { from: ISODate; to: ISODate } {
  const s = def.RecurrenceSettings;
  const prev = s.periodMode === 'Previous';
  const interval = Math.max(1, def.RecurrenceInterval || 1);
  switch (def.RecurrenceType) {
    case 'OneTime':
      return { from: nominal, to: nominal };
    case 'Daily':
      return prev
        ? { from: addDays(nominal, -interval), to: addDays(nominal, -1) }
        : { from: nominal, to: nominal };
    case 'Workday':
      return prev ? { from: previousWorkday(addDays(nominal, -1), cal), to: addDays(nominal, -1) } : { from: nominal, to: nominal };
    case 'Weekly': {
      const days = s.daysOfWeek?.length ? s.daysOfWeek : [dayOfWeek(s.startDate)];
      if (days.length > 1) {
        if (!prev) return { from: nominal, to: nominal };
        const sorted = [...days].sort((a, b) => a - b);
        const dow = dayOfWeek(nominal);
        const idx = sorted.indexOf(dow);
        const prevDow = idx > 0 ? sorted[idx - 1] : sorted[sorted.length - 1];
        const gap = idx > 0 ? dow - prevDow : dow - prevDow + 7 * interval;
        return { from: addDays(nominal, -gap), to: addDays(nominal, -1) };
      }
      const monday = mondayOf(nominal);
      const span = 7 * interval;
      return prev
        ? { from: addDays(monday, -span), to: addDays(monday, -1) }
        : { from: monday, to: addDays(monday, span - 1) };
    }
    default: {
      const step = monthStep(def);
      const idx = monthIndex(nominal);
      const fromIdx = prev ? idx - step : idx;
      const toIdx = prev ? idx - 1 : idx + step - 1;
      const a = monthIndexToYM(fromIdx);
      const b = monthIndexToYM(toIdx);
      return { from: makeISODate(a.y, a.m, 1), to: makeISODate(b.y, b.m, daysInMonth(b.y, b.m)) };
    }
  }
}

/** Lidsky čitelné označení běhu (název složky v knihovně dokumentů). */
export function runCodeFor(def: ScheduleDefinition, nominal: ISODate, period: { from: ISODate; to: ISODate }): string {
  const compact = (d: ISODate) => d.replaceAll('-', '');
  const { y, m } = parseISODate(period.from);
  const step = monthStep(def);
  switch (def.RecurrenceType) {
    case 'OneTime':
    case 'Daily':
    case 'Workday':
      return `RUN-${compact(nominal)}`;
    case 'Weekly': {
      const days = def.RecurrenceSettings.daysOfWeek?.length ?? 1;
      if (days > 1) return `RUN-${compact(nominal)}`;
      const w = isoWeek(period.from);
      return `RUN-${w.year}-W${String(w.week).padStart(2, '0')}`;
    }
    case 'Quarterly':
      if (step === 3 && (m - 1) % 3 === 0) return `RUN-${y}-Q${(m - 1) / 3 + 1}`;
      return `RUN-${y}-${String(m).padStart(2, '0')}`;
    case 'SemiAnnual':
      if (step === 6 && (m === 1 || m === 7)) return `RUN-${y}-H${m === 1 ? 1 : 2}`;
      return `RUN-${y}-${String(m).padStart(2, '0')}`;
    case 'Annual':
      if (step === 12 && m === 1) return `RUN-${y}`;
      return `RUN-${y}-${String(m).padStart(2, '0')}`;
    default:
      return `RUN-${y}-${String(m).padStart(2, '0')}`;
  }
}

/** Termín splnění z plánovaného data. Termín nikdy nepředchází plánovanému datu. */
export function dueDateFor(scheduled: ISODate, rule: DueDateRule, cal: WorkCalendar = defaultCalendar): ISODate {
  const offset = Math.max(0, rule.offset || 0);
  let due =
    rule.unit === 'Workdays' ? addWorkdays(scheduled, offset, cal) : applyShift(addDays(scheduled, offset), rule.shift, cal);
  if (due < scheduled) due = scheduled;
  return due;
}

export function buildOccurrence(def: ScheduleDefinition, nominal: ISODate, cal: WorkCalendar = defaultCalendar): Occurrence {
  const scheduledDate = applyShift(nominal, def.RecurrenceSettings.nonWorkingDayShift, cal);
  const dueDate = dueDateFor(scheduledDate, def.DueDateRule, cal);
  const period = periodFor(def, nominal, cal);
  return {
    occurrenceKey: occurrenceKeyFor(def.ControlCode, nominal),
    nominalDate: nominal,
    scheduledDate,
    dueDate,
    periodFrom: period.from,
    periodTo: period.to,
    runCode: runCodeFor(def, nominal, period),
  };
}

export function generateOccurrences(
  def: ScheduleDefinition,
  from: ISODate,
  to: ISODate,
  cal: WorkCalendar = defaultCalendar,
): Occurrence[] {
  return nominalDates(def, from, to, cal).map((n) => buildOccurrence(def, n, cal));
}

/** Prvních N výskytů od data (pro náhled v průvodci). */
export function previewOccurrences(
  def: ScheduleDefinition,
  from: ISODate,
  count: number,
  cal: WorkCalendar = defaultCalendar,
): Occurrence[] {
  const out: Occurrence[] = [];
  let windowStart = from;
  for (let i = 0; i < 12 && out.length < count; i++) {
    const windowEnd = addDays(windowStart, 400);
    out.push(...generateOccurrences(def, windowStart, windowEnd, cal));
    windowStart = addDays(windowEnd, 1);
    if (def.RecurrenceType === 'OneTime') break;
  }
  return out.slice(0, count);
}

/** Validace definice opakování. Vrací seznam chyb (česky). */
export function validateSchedule(def: ScheduleDefinition): string[] {
  const errors: string[] = [];
  const s = def.RecurrenceSettings;
  if (!s.startDate) errors.push('Zadejte datum prvního výskytu.');
  if (s.endDate && s.startDate && s.endDate < s.startDate) errors.push('Datum ukončení nesmí předcházet prvnímu výskytu.');
  if (def.RecurrenceInterval < 1 || def.RecurrenceInterval > 52) errors.push('Interval opakování musí být 1–52.');
  if (def.RecurrenceType === 'Weekly' && (!s.daysOfWeek || s.daysOfWeek.length === 0))
    errors.push('U týdenní kontroly vyberte alespoň jeden den v týdnu.');
  if (isMonthlyFamily(def.RecurrenceType)) {
    if (s.monthlyMode === 'DayOfMonth' && (s.dayOfMonth < 1 || s.dayOfMonth > 31)) errors.push('Den v měsíci musí být 1–31.');
    if (s.monthlyMode === 'NthWorkday' && (s.workdayNumber < 1 || s.workdayNumber > 23))
      errors.push('Pořadí pracovního dne musí být 1–23.');
  }
  if (def.DueDateRule.offset < 0 || def.DueDateRule.offset > 120) errors.push('Lhůta pro splnění musí být 0–120 dní.');
  return errors;
}

/** Slovní popis pravidla (česky). */
export function describeRecurrence(def: Omit<ScheduleDefinition, 'ControlCode'>): string {
  const s = def.RecurrenceSettings;
  const n = Math.max(1, def.RecurrenceInterval || 1);
  const monthPart = () => {
    switch (s.monthlyMode) {
      case 'LastDayOfMonth':
        return 'poslední den v měsíci';
      case 'NthWorkday':
        return `${s.workdayNumber}. pracovní den v měsíci`;
      default:
        return `${s.dayOfMonth}. den v měsíci${s.dayOfMonth > 28 ? (s.invalidDayPolicy === 'Skip' ? ' (kratší měsíce vynechat)' : ' (v kratším měsíci poslední den)') : ''}`;
    }
  };
  switch (def.RecurrenceType) {
    case 'OneTime':
      return 'Jednorázově';
    case 'Daily':
      return n === 1 ? 'Denně (včetně víkendů)' : `Každý ${n}. den`;
    case 'Workday':
      return 'Každý pracovní den';
    case 'Weekly': {
      const days = (s.daysOfWeek?.length ? s.daysOfWeek : [dayOfWeek(s.startDate)])
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_SHORT[d - 1])
        .join(', ');
      return n === 1 ? `Týdně (${days})` : `Každé ${n} týdny (${days})`;
    }
    case 'Monthly':
      return n === 1 ? `Měsíčně, ${monthPart()}` : `Každé ${n} měsíce, ${monthPart()}`;
    case 'Quarterly':
      return `Čtvrtletně, ${monthPart()}`;
    case 'SemiAnnual':
      return `Pololetně, ${monthPart()}`;
    case 'Annual':
      return `Ročně, ${monthPart()}`;
    default:
      return MONTHLY_MODE_LABELS[s.monthlyMode];
  }
}

export function describeDueRule(rule: DueDateRule): string {
  if (!rule.offset) return 'v den plánovaného výskytu';
  const unit = rule.unit === 'Workdays' ? 'pracovních dní' : 'kalendářních dní';
  return `${rule.offset} ${unit} po plánovaném výskytu`;
}
