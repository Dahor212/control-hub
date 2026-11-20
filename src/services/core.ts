/**
 * Společný kontext služeb: datové úložiště, přihlášený (demo) uživatel, hodiny a pracovní kalendář.
 */
import { createWorkCalendar, pragueLocalToIso, toPragueDate, toPragueTime, type WorkCalendar } from '../domain/dates';
import { newGuid } from '../domain/ids';
import type { Session } from '../domain/permissions';
import type { AuditEntityType, AuditEntry, AutomationLogEntry, DirectoryUser, Email, ISODate, ISODateTime } from '../domain/types';
import type { DataStore } from '../data/store';

export interface ServiceContext {
  store: DataStore;
  session: Session;
}

export class ServiceError extends Error {
  constructor(message: string, public readonly details: string[] = []) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class PermissionError extends ServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

export function ensure(decision: { allowed: boolean; reason?: string }) {
  if (!decision.allowed) throw new PermissionError(decision.reason ?? 'Akce není povolena.');
}

// ---------------------------------------------------------------------------------------------
// Hodiny – testovací datum slouží jen pro simulaci pravidel
// ---------------------------------------------------------------------------------------------

export function today(store: DataStore): ISODate {
  return store.settings.get().testDate ?? toPragueDate(new Date());
}

export function nowIso(store: DataStore): ISODateTime {
  const test = store.settings.get().testDate;
  if (!test) return new Date().toISOString();
  const [hh, mm, ss] = toPragueTime(new Date()).split(':').map(Number);
  return pragueLocalToIso(test, hh, mm, ss);
}

let calCache: { key: unknown; cal: WorkCalendar } | null = null;
export function calendar(store: DataStore): WorkCalendar {
  const holidays = store.holidays.all();
  if (!calCache || calCache.key !== holidays) {
    calCache = { key: holidays, cal: createWorkCalendar(holidays.map((h) => ({ date: h.HolidayDate, name: h.Name }))) };
  }
  return calCache.cal;
}

let dirCache: { key: unknown; map: Map<string, DirectoryUser> } | null = null;
export function directoryMap(store: DataStore): Map<string, DirectoryUser> {
  const users = store.directory.all();
  if (!dirCache || dirCache.key !== users) dirCache = { key: users, map: new Map(users.map((u) => [u.Email, u])) };
  return dirCache.map;
}

export function displayName(store: DataStore, email: Email | null | undefined): string {
  if (!email) return '—';
  return directoryMap(store).get(email)?.DisplayName ?? email;
}

export function departmentName(store: DataStore, code: string): string {
  return store.lookups.all().find((l) => l.LookupType === 'Department' && l.Code === code)?.Label ?? code;
}

// ---------------------------------------------------------------------------------------------
// Audit (append-only)
// ---------------------------------------------------------------------------------------------

export function auditValue(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Ano' : 'Ne';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function makeAudit(
  ctx: ServiceContext,
  e: {
    EntityType: AuditEntityType;
    EntityId: string;
    ControlId: string | null;
    Action: string;
    FieldName?: string | null;
    OldValue?: unknown;
    NewValue?: unknown;
    ChangeReason?: string | null;
  },
  at?: ISODateTime,
): AuditEntry {
  return {
    AuditId: newGuid(),
    EntityType: e.EntityType,
    EntityId: e.EntityId,
    ControlId: e.ControlId,
    Action: e.Action,
    FieldName: e.FieldName ?? null,
    OldValue: auditValue(e.OldValue),
    NewValue: auditValue(e.NewValue),
    ChangedBy: ctx.session.user.Email,
    ChangedAt: at ?? nowIso(ctx.store),
    ChangeReason: e.ChangeReason?.trim() || null,
  };
}

export async function audit(ctx: ServiceContext, e: Parameters<typeof makeAudit>[1]) {
  return ctx.store.audit.append(makeAudit(ctx, e));
}

/** Záznam změn jednotlivých polí (jen skutečně změněná pole). */
export function fieldChanges<T extends object>(
  ctx: ServiceContext,
  base: { EntityType: AuditEntityType; EntityId: string; ControlId: string | null; Action: string; ChangeReason?: string | null },
  before: T,
  after: Partial<T>,
  fields: Array<keyof T & string>,
): AuditEntry[] {
  const out: AuditEntry[] = [];
  for (const f of fields) {
    if (!(f in after)) continue;
    const a = auditValue(before[f]);
    const b = auditValue(after[f]);
    if (a !== b) out.push(makeAudit(ctx, { ...base, FieldName: f, OldValue: before[f], NewValue: after[f] }));
  }
  return out;
}

export async function logAutomation(
  store: DataStore,
  entry: Omit<AutomationLogEntry, 'LogId' | 'FinishedAt'> & { FinishedAt?: ISODateTime },
) {
  return store.automation.create({ ...entry, LogId: newGuid(), FinishedAt: entry.FinishedAt ?? new Date().toISOString() });
}
