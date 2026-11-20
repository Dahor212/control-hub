/**
 * Práce s kalendářními dny v časovém pásmu Europe/Prague.
 *
 * Business logika pracuje výhradně s řetězci 'YYYY-MM-DD' a aritmetikou nad „pořadovým číslem dne“
 * (UTC půlnoc). Díky tomu nezávisí na časovém pásmu počítače ani na přechodu letního času.
 * Okamžiky (ISODateTime) se na kalendářní den převádějí funkcí toPragueDate().
 */
import type { ISODate, ISODateTime, ShiftRule } from './types';

export const TIME_ZONE = 'Europe/Prague';
const DAY_MS = 86_400_000;

const pragueDateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const pragueTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partsToIso(parts: Intl.DateTimeFormatPart[]): ISODate {
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Okamžik → kalendářní den v Praze. */
export function toPragueDate(value: Date | ISODateTime): ISODate {
  const d = typeof value === 'string' ? new Date(value) : value;
  return partsToIso(pragueDateFmt.formatToParts(d));
}

/** Okamžik → 'HH:mm:ss' v Praze. */
export function toPragueTime(value: Date | ISODateTime): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return pragueTimeFmt.format(d);
}

/** Offset Prahy vůči UTC v minutách pro daný okamžik (60 nebo 120). */
export function pragueOffsetMinutes(at: Date): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** Pražský místní čas (den + hodina:minuta) → okamžik ISO v UTC. */
export function pragueLocalToIso(date: ISODate, hh = 0, mm = 0, ss = 0): ISODateTime {
  const { y, m, d } = parseISODate(date);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const offset = pragueOffsetMinutes(guess);
  const result = new Date(guess.getTime() - offset * 60000);
  // korekce okolo přechodu času
  const offset2 = pragueOffsetMinutes(result);
  return offset2 === offset ? result.toISOString() : new Date(guess.getTime() - offset2 * 60000).toISOString();
}

export function parseISODate(date: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

export function isValidISODate(date: unknown): date is ISODate {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const { y, m, d } = parseISODate(date);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function makeISODate(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Pořadové číslo dne (dny od 1970-01-01). */
export function toDayNumber(date: ISODate): number {
  const { y, m, d } = parseISODate(date);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n: number): ISODate {
  const dt = new Date(n * DAY_MS);
  return makeISODate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** b − a ve dnech. */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNumber(b) - toDayNumber(a);
}

/** 1 = pondělí … 7 = neděle (ISO 8601). */
export function dayOfWeek(date: ISODate): number {
  const n = toDayNumber(date);
  // 1970-01-01 byl čtvrtek (4)
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function startOfMonth(date: ISODate): ISODate {
  const { y, m } = parseISODate(date);
  return makeISODate(y, m, 1);
}

export function endOfMonth(date: ISODate): ISODate {
  const { y, m } = parseISODate(date);
  return makeISODate(y, m, daysInMonth(y, m));
}

/** Index měsíce (y*12 + m-1) – vhodný pro aritmetiku měsíců. */
export function monthIndex(date: ISODate): number {
  const { y, m } = parseISODate(date);
  return y * 12 + (m - 1);
}

export function monthIndexToYM(idx: number): { y: number; m: number } {
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function addMonthsClamped(date: ISODate, months: number): ISODate {
  const { d } = parseISODate(date);
  const { y, m } = monthIndexToYM(monthIndex(date) + months);
  return makeISODate(y, m, Math.min(d, daysInMonth(y, m)));
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function mondayOf(date: ISODate): ISODate {
  return addDays(date, 1 - dayOfWeek(date));
}

export function isoWeek(date: ISODate): { year: number; week: number } {
  const thursday = addDays(date, 4 - dayOfWeek(date));
  const year = parseISODate(thursday).y;
  const jan1 = makeISODate(year, 1, 1);
  const week = Math.floor(diffDays(jan1, thursday) / 7) + 1;
  return { year, week };
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}
export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function isWeekend(date: ISODate): boolean {
  return dayOfWeek(date) >= 6;
}

// ---------------------------------------------------------------------------------------------
// Pracovní kalendář (víkendy + české státní svátky)
// ---------------------------------------------------------------------------------------------

/** Velikonoční neděle (anonymní gregoriánský algoritmus). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeISODate(year, month, day);
}

export function czechPublicHolidays(year: number): Array<{ date: ISODate; name: string }> {
  const easter = easterSunday(year);
  const fixed: Array<[number, number, string]> = [
    [1, 1, 'Den obnovy samostatného českého státu, Nový rok'],
    [5, 1, 'Svátek práce'],
    [5, 8, 'Den vítězství'],
    [7, 5, 'Den slovanských věrozvěstů Cyrila a Metoděje'],
    [7, 6, 'Den upálení mistra Jana Husa'],
    [9, 28, 'Den české státnosti'],
    [10, 28, 'Den vzniku samostatného československého státu'],
    [11, 17, 'Den boje za svobodu a demokracii'],
    [12, 24, 'Štědrý den'],
    [12, 25, '1. svátek vánoční'],
    [12, 26, '2. svátek vánoční'],
  ];
  const list = fixed.map(([m, d, name]) => ({ date: makeISODate(year, m, d), name }));
  list.push({ date: addDays(easter, -2), name: 'Velký pátek' });
  list.push({ date: addDays(easter, 1), name: 'Velikonoční pondělí' });
  return list.sort((x, y) => x.date.localeCompare(y.date));
}

export interface WorkCalendar {
  isHoliday(date: ISODate): boolean;
  holidayName(date: ISODate): string | null;
}

/** Kalendář = české svátky (dopočtené) + volitelné vlastní dny z IC_Holidays. */
export function createWorkCalendar(extra: Array<{ date: ISODate; name: string }> = []): WorkCalendar {
  const cache = new Map<number, Map<ISODate, string>>();
  const extraMap = new Map(extra.map((e) => [e.date, e.name]));
  const yearMap = (y: number) => {
    let m = cache.get(y);
    if (!m) {
      m = new Map(czechPublicHolidays(y).map((h) => [h.date, h.name]));
      cache.set(y, m);
    }
    return m;
  };
  return {
    isHoliday(date) {
      return extraMap.has(date) || yearMap(parseISODate(date).y).has(date);
    },
    holidayName(date) {
      return extraMap.get(date) ?? yearMap(parseISODate(date).y).get(date) ?? null;
    },
  };
}

export const defaultCalendar = createWorkCalendar();

export function isWorkday(date: ISODate, cal: WorkCalendar = defaultCalendar): boolean {
  return !isWeekend(date) && !cal.isHoliday(date);
}

export function nextWorkday(date: ISODate, cal: WorkCalendar = defaultCalendar): ISODate {
  let d = date;
  while (!isWorkday(d, cal)) d = addDays(d, 1);
  return d;
}

export function previousWorkday(date: ISODate, cal: WorkCalendar = defaultCalendar): ISODate {
  let d = date;
  while (!isWorkday(d, cal)) d = addDays(d, -1);
  return d;
}

/** Posun data podle pravidla, pokud připadne na nepracovní den. */
export function applyShift(date: ISODate, rule: ShiftRule, cal: WorkCalendar = defaultCalendar): ISODate {
  if (rule === 'None' || isWorkday(date, cal)) return date;
  return rule === 'NextWorkday' ? nextWorkday(date, cal) : previousWorkday(date, cal);
}

/** Přičte n pracovních dní (n ≥ 0). n = 0 vrací původní datum. */
export function addWorkdays(date: ISODate, n: number, cal: WorkCalendar = defaultCalendar): ISODate {
  let d = date;
  let left = n;
  const step = n >= 0 ? 1 : -1;
  while (left !== 0) {
    d = addDays(d, step);
    if (isWorkday(d, cal)) left -= step;
  }
  return d;
}

/** Počet pracovních dní v intervalu (a, b] – použito pro prodlení v pracovních dnech. */
export function workdaysBetween(a: ISODate, b: ISODate, cal: WorkCalendar = defaultCalendar): number {
  if (b <= a) return 0;
  let count = 0;
  for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) if (isWorkday(d, cal)) count++;
  return count;
}

/** N-tý pracovní den v měsíci. Pokud jich měsíc tolik nemá, vrátí poslední pracovní den. */
export function nthWorkdayOfMonth(y: number, m: number, n: number, cal: WorkCalendar = defaultCalendar): ISODate {
  let count = 0;
  let last = makeISODate(y, m, 1);
  for (let day = 1; day <= daysInMonth(y, m); day++) {
    const d = makeISODate(y, m, day);
    if (isWorkday(d, cal)) {
      count++;
      last = d;
      if (count === n) return d;
    }
  }
  return last;
}

export function datesInRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let n = toDayNumber(from); n <= toDayNumber(to); n++) out.push(fromDayNumber(n));
  return out;
}
