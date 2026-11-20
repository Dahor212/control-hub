import { describe, expect, it } from 'vitest';
import {
  addWorkdays,
  czechPublicHolidays,
  dayOfWeek,
  easterSunday,
  isWorkday,
  nthWorkdayOfMonth,
  pragueLocalToIso,
  toPragueDate,
} from '../src/domain/dates';
import { describeRecurrence, generateOccurrences, nominalDates, type ScheduleDefinition } from '../src/domain/recurrence';
import type { RecurrenceSettings } from '../src/domain/types';

const base: RecurrenceSettings = {
  startDate: '2026-01-01',
  endDate: null,
  daysOfWeek: [],
  monthlyMode: 'DayOfMonth',
  dayOfMonth: 1,
  workdayNumber: 1,
  invalidDayPolicy: 'LastDayOfMonth',
  nonWorkingDayShift: 'None',
  periodMode: 'Current',
};
const def = (p: Partial<ScheduleDefinition> & { s?: Partial<RecurrenceSettings> }): ScheduleDefinition => ({
  ControlCode: 'CTRL-T',
  RecurrenceType: p.RecurrenceType ?? 'Monthly',
  RecurrenceInterval: p.RecurrenceInterval ?? 1,
  RecurrenceSettings: { ...base, ...(p.s ?? {}) },
  DueDateRule: p.DueDateRule ?? { offset: 0, unit: 'CalendarDays', shift: 'None' },
});

describe('datum a čas Europe/Prague', () => {
  it('převádí UTC okamžik na pražský kalendářní den (přes půlnoc)', () => {
    expect(toPragueDate('2026-11-19T23:30:00Z')).toBe('2026-11-20'); // CET +1
    expect(toPragueDate('2026-07-15T22:30:00Z')).toBe('2026-07-16'); // CEST +2
    expect(toPragueDate('2026-07-15T21:30:00Z')).toBe('2026-07-15');
  });
  it('převádí pražský místní čas na UTC i kolem přechodu času', () => {
    expect(pragueLocalToIso('2026-01-10', 8, 0)).toBe('2026-01-10T07:00:00.000Z');
    expect(pragueLocalToIso('2026-07-10', 8, 0)).toBe('2026-07-10T06:00:00.000Z');
    expect(pragueLocalToIso('2026-03-29', 12, 0)).toBe('2026-03-29T10:00:00.000Z'); // den přechodu na letní čas
  });
  it('počítá Velikonoce a české svátky', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    const h = czechPublicHolidays(2026).map((x) => x.date);
    expect(h).toContain('2026-04-03'); // Velký pátek
    expect(h).toContain('2026-04-06'); // Velikonoční pondělí
    expect(h).toContain('2026-11-17');
    expect(isWorkday('2026-11-17')).toBe(false);
    expect(isWorkday('2026-11-18')).toBe(true);
  });
  it('přičítá pracovní dny přes víkend a svátek', () => {
    expect(addWorkdays('2026-11-13', 1)).toBe('2026-11-16'); // pá → po
    expect(addWorkdays('2026-11-16', 1)).toBe('2026-11-18'); // 17. 11. svátek
    expect(addWorkdays('2026-12-23', 1)).toBe('2026-12-28'); // 24.–26. 12. svátky + víkend
  });
  it('dayOfWeek ISO (1 = pondělí)', () => {
    expect(dayOfWeek('2026-11-16')).toBe(1);
    expect(dayOfWeek('2026-11-22')).toBe(7);
  });
});

describe('pravidla opakování', () => {
  it('jednorázově', () => {
    expect(nominalDates(def({ RecurrenceType: 'OneTime', s: { startDate: '2026-12-03' } }), '2026-01-01', '2027-12-31')).toEqual(['2026-12-03']);
  });
  it('denně a každý N-tý den', () => {
    expect(nominalDates(def({ RecurrenceType: 'Daily' }), '2026-01-01', '2026-01-05')).toHaveLength(5);
    expect(nominalDates(def({ RecurrenceType: 'Daily', RecurrenceInterval: 3 }), '2026-01-02', '2026-01-10')).toEqual(['2026-01-04', '2026-01-07', '2026-01-10']);
  });
  it('každý pracovní den vynechá víkend a svátky', () => {
    const d = nominalDates(def({ RecurrenceType: 'Workday' }), '2026-11-14', '2026-11-20');
    expect(d).toEqual(['2026-11-16', '2026-11-18', '2026-11-19', '2026-11-20']);
  });
  it('týdně ve více dnech a každé 2 týdny', () => {
    expect(nominalDates(def({ RecurrenceType: 'Weekly', s: { startDate: '2026-11-02', daysOfWeek: [3, 5] } }), '2026-11-02', '2026-11-15')).toEqual([
      '2026-11-04',
      '2026-11-06',
      '2026-11-11',
      '2026-11-13',
    ]);
    expect(nominalDates(def({ RecurrenceType: 'Weekly', RecurrenceInterval: 2, s: { startDate: '2026-11-02', daysOfWeek: [1] } }), '2026-11-01', '2026-12-31')).toEqual([
      '2026-11-02',
      '2026-11-16',
      '2026-11-30',
      '2026-12-14',
      '2026-12-28',
    ]);
  });
  it('31. den v kratším měsíci → poslední den měsíce', () => {
    const d = nominalDates(def({ s: { dayOfMonth: 31 } }), '2026-01-01', '2026-06-30');
    expect(d).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
  });
  it('31. den s politikou „vynechat“', () => {
    const d = nominalDates(def({ s: { dayOfMonth: 31, invalidDayPolicy: 'Skip' } }), '2026-01-01', '2026-06-30');
    expect(d).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });
  it('přestupný rok: 29. 2. 2028 vs. 28. 2. 2027', () => {
    const d = nominalDates(def({ s: { dayOfMonth: 29 } }), '2027-02-01', '2028-02-29');
    expect(d[0]).toBe('2027-02-28');
    expect(d[d.length - 1]).toBe('2028-02-29');
    const annual = nominalDates(def({ RecurrenceType: 'Annual', s: { startDate: '2028-02-29', dayOfMonth: 29 } }), '2028-01-01', '2031-12-31');
    expect(annual).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28']);
  });
  it('poslední den měsíce a N-tý pracovní den', () => {
    expect(nominalDates(def({ s: { monthlyMode: 'LastDayOfMonth' } }), '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(nthWorkdayOfMonth(2026, 11, 5)).toBe('2026-11-06'); // 2.,3.,4.,5.,6.
    expect(nthWorkdayOfMonth(2026, 1, 1)).toBe('2026-01-02'); // 1. 1. svátek
  });
  it('čtvrtletně, pololetně, každé 2 měsíce', () => {
    expect(nominalDates(def({ RecurrenceType: 'Quarterly', s: { startDate: '2026-01-15', dayOfMonth: 15 } }), '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15',
    ]);
    expect(nominalDates(def({ RecurrenceType: 'SemiAnnual', s: { startDate: '2026-06-30', monthlyMode: 'LastDayOfMonth' } }), '2026-01-01', '2027-12-31')).toEqual([
      '2026-06-30',
      '2026-12-31',
      '2027-06-30',
      '2027-12-31',
    ]);
    expect(nominalDates(def({ RecurrenceInterval: 2, s: { startDate: '2026-05-15', dayOfMonth: 15 } }), '2026-01-01', '2026-12-31')).toEqual([
      '2026-05-15',
      '2026-07-15',
      '2026-09-15',
      '2026-11-15',
    ]);
  });
  it('respektuje datum ukončení', () => {
    expect(nominalDates(def({ s: { endDate: '2026-03-15', dayOfMonth: 10 } }), '2026-01-01', '2026-12-31')).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
  });
  it('posun víkendu a termín v pracovních dnech', () => {
    const occ = generateOccurrences(
      def({ s: { dayOfMonth: 14, nonWorkingDayShift: 'NextWorkday' }, DueDateRule: { offset: 3, unit: 'Workdays', shift: 'None' } }),
      '2026-11-01',
      '2026-11-30',
    );
    // 14. 11. 2026 je sobota → pondělí 16. 11.; +3 pracovní dny přes svátek 17. 11. → 20. 11.
    expect(occ[0].nominalDate).toBe('2026-11-14');
    expect(occ[0].scheduledDate).toBe('2026-11-16');
    expect(occ[0].dueDate).toBe('2026-11-20');
    const prev = generateOccurrences(def({ s: { dayOfMonth: 14, nonWorkingDayShift: 'PreviousWorkday' } }), '2026-11-01', '2026-11-30');
    expect(prev[0].scheduledDate).toBe('2026-11-13');
  });
  it('kontrolované období a označení běhu', () => {
    const [m] = generateOccurrences(def({ s: { dayOfMonth: 5, periodMode: 'Previous' } }), '2026-11-01', '2026-11-30');
    expect([m.periodFrom, m.periodTo, m.runCode]).toEqual(['2026-10-01', '2026-10-31', 'RUN-2026-10']);
    const [q] = generateOccurrences(def({ RecurrenceType: 'Quarterly', s: { startDate: '2026-01-15', dayOfMonth: 15, periodMode: 'Previous' } }), '2026-04-01', '2026-04-30');
    expect([q.periodFrom, q.periodTo, q.runCode]).toEqual(['2026-01-01', '2026-03-31', 'RUN-2026-Q1']);
    const [w] = generateOccurrences(def({ RecurrenceType: 'Weekly', s: { startDate: '2026-11-02', daysOfWeek: [1], periodMode: 'Previous' } }), '2026-11-16', '2026-11-16');
    expect([w.periodFrom, w.periodTo, w.runCode]).toEqual(['2026-11-09', '2026-11-15', 'RUN-2026-W46']);
    const [wd] = generateOccurrences(def({ RecurrenceType: 'Workday', s: { periodMode: 'Previous' } }), '2026-11-16', '2026-11-16');
    expect([wd.periodFrom, wd.periodTo]).toEqual(['2026-11-13', '2026-11-15']); // pondělí kontroluje pá–ne
  });
  it('stabilní OccurrenceKey', () => {
    const a = generateOccurrences(def({ s: { dayOfMonth: 10 } }), '2026-01-01', '2026-03-31').map((o) => o.occurrenceKey);
    const b = generateOccurrences(def({ s: { dayOfMonth: 10 } }), '2026-01-01', '2026-03-31').map((o) => o.occurrenceKey);
    expect(a).toEqual(b);
    expect(a[0]).toBe('CTRL-T|2026-01-10');
  });
  it('slovní popis', () => {
    expect(describeRecurrence(def({ RecurrenceType: 'Weekly', RecurrenceInterval: 2, s: { daysOfWeek: [1, 4] } }))).toBe('Každé 2 týdny (po, čt)');
    expect(describeRecurrence(def({ s: { monthlyMode: 'NthWorkday', workdayNumber: 5 } }))).toBe('Měsíčně, 5. pracovní den v měsíci');
  });
});
