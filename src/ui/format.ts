/** Formátování pro české UI. */
import { diffDays, toPragueDate } from '../domain/dates';
import type { ISODate } from '../domain/types';

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day}. ${m}. ${y}`;
}

export function fmtDateShort(d: string | null | undefined): string {
  if (!d) return '—';
  const [, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day}. ${m}.`;
}

const dtFmt = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dtFmt.format(new Date(iso));
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n);
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
}

export function fmtDays(n: number): string {
  return `${n} ${plural(n, 'den', 'dny', 'dní')}`;
}

export function fmtRelative(date: ISODate, today: ISODate): string {
  const d = diffDays(today, date);
  if (d === 0) return 'dnes';
  if (d === 1) return 'zítra';
  if (d === -1) return 'včera';
  return d > 0 ? `za ${fmtDays(d)}` : `před ${fmtDays(-d)}`;
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return `${(v * 100).toFixed(digits).replace('.', ',')} %`;
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '–';
  return v.toFixed(digits).replace('.', ',');
}

export function pragueDay(iso: string | null | undefined): ISODate | null {
  return iso ? toPragueDate(iso) : null;
}

export function fmtPeriod(from: ISODate, to: ISODate): string {
  if (from === to) return fmtDate(from);
  return `${fmtDateShort(from)} – ${fmtDate(to)}`;
}
