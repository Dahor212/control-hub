/** Administrace: nastavení, role, číselníky, demo režim, export/import JSON. */
import { isValidISODate } from '../domain/dates';
import { newGuid } from '../domain/ids';
import { can } from '../domain/permissions';
import type { AppSettings, LookupItem, RoleAssignment, RoleName } from '../domain/types';
import { seedDemoData, SEED_VERSION } from '../data/seed';
import type { DataStore } from '../data/store';
import { PermissionError, ServiceError, audit, fieldChanges, makeAudit, today, type ServiceContext } from './core';

function requireAdmin(ctx: ServiceContext) {
  if (!can(ctx.session, 'administer')) throw new PermissionError('Tuto akci smí provést pouze Administrátor.');
}

export function validateSettings(s: AppSettings): string[] {
  const e: string[] = [];
  const nums = (xs: number[]) => xs.every((x) => Number.isInteger(x) && x >= 0 && x <= 60);
  if (!nums(s.reminderDaysBefore)) e.push('Připomínky před termínem musí být celá čísla 0–60.');
  if (!nums(s.overdueDaysAfter) || s.overdueDaysAfter.some((x) => x < 1)) e.push('Upozornění po termínu musí být celá čísla 1–60.');
  if (s.escalationAfterDays < 1 || s.escalationAfterDays > 60) e.push('Eskalace musí nastat 1–60 dní po termínu.');
  if (s.planningHorizonMonths < 1 || s.planningHorizonMonths > 24) e.push('Plánovací horizont musí být 1–24 měsíců.');
  if (s.dueSoonDays < 0 || s.dueSoonDays > 30) e.push('„Blíží se termín“ musí být 0–30 dní.');
  if (s.simulatedFailureRate < 0 || s.simulatedFailureRate > 0.5) e.push('Simulovaná chybovost musí být 0–50 %.');
  if (s.testDate && !isValidISODate(s.testDate)) e.push('Testovací datum není platné.');
  return e;
}

export async function updateSettings(ctx: ServiceContext, patch: Partial<AppSettings>, reason: string) {
  requireAdmin(ctx);
  const before = ctx.store.settings.get();
  const next = { ...before, ...patch };
  const errors = validateSettings(next);
  if (errors.length) throw new ServiceError('Nastavení nelze uložit.', errors);
  await ctx.store.settings.update(patch);
  await ctx.store.audit.appendMany(
    fieldChanges(ctx, { EntityType: 'Settings', EntityId: 'IC_Settings', ControlId: null, Action: 'Změna nastavení', ChangeReason: reason }, before, patch, Object.keys(patch) as Array<keyof AppSettings>),
  );
}

/** Testovací datum – výhradně simulace. V produkci je zdrojem čas serveru / běhu flow. */
export async function setTestDate(ctx: ServiceContext, date: string | null) {
  requireAdmin(ctx);
  if (date && !isValidISODate(date)) throw new ServiceError('Neplatné datum.');
  const before = ctx.store.settings.get().testDate;
  await ctx.store.settings.update({ testDate: date });
  await audit(ctx, { EntityType: 'Settings', EntityId: 'IC_Settings', ControlId: null, Action: 'Změna testovacího data (demo)', FieldName: 'testDate', OldValue: before, NewValue: date ?? 'systémové datum' });
}

export async function setPaReferenceMode(store: DataStore, enabled: boolean) {
  await store.settings.update({ paReferenceMode: enabled });
}

export async function saveRoleAssignment(ctx: ServiceContext, a: { AssignmentId?: string; UserEmail: string; Role: RoleName; DepartmentScope: string; IsActive: boolean }, reason: string) {
  requireAdmin(ctx);
  if (!a.UserEmail) throw new ServiceError('Vyberte uživatele.');
  const dup = ctx.store.roles.filter((r) => r.UserEmail === a.UserEmail && r.Role === a.Role && r.DepartmentScope === a.DepartmentScope && r.AssignmentId !== a.AssignmentId && r.IsActive);
  if (dup.length) throw new ServiceError('Toto přiřazení role již existuje.');
  if (a.AssignmentId) {
    const before = ctx.store.roles.get(a.AssignmentId);
    if (!before) throw new ServiceError('Přiřazení nebylo nalezeno.');
    await ctx.store.roles.update(a.AssignmentId, a);
    await ctx.store.audit.appendMany(fieldChanges(ctx, { EntityType: 'RoleAssignment', EntityId: a.AssignmentId, ControlId: null, Action: 'Úprava přiřazení role', ChangeReason: reason }, before, a, ['Role', 'DepartmentScope', 'IsActive']));
  } else {
    const rec: RoleAssignment = { AssignmentId: newGuid(), UserEmail: a.UserEmail, Role: a.Role, DepartmentScope: a.DepartmentScope, IsActive: a.IsActive };
    await ctx.store.roles.create(rec);
    await audit(ctx, { EntityType: 'RoleAssignment', EntityId: rec.AssignmentId, ControlId: null, Action: 'Přidělení role', FieldName: 'Role', NewValue: `${a.UserEmail}: ${a.Role} (${a.DepartmentScope})`, ChangeReason: reason });
  }
}

export async function saveLookup(ctx: ServiceContext, item: Omit<LookupItem, 'LookupId'> & { LookupId?: string }, reason: string) {
  requireAdmin(ctx);
  if (!item.Code.trim() || !item.Label.trim()) throw new ServiceError('Kód i název jsou povinné.');
  if (!/^[A-Za-z0-9_-]{2,20}$/.test(item.Code)) throw new ServiceError('Kód smí obsahovat 2–20 znaků A–Z, 0–9, - a _.');
  const dup = ctx.store.lookups.filter((l) => l.LookupType === item.LookupType && l.Code === item.Code && l.LookupId !== item.LookupId);
  if (dup.length) throw new ServiceError('Položka s tímto kódem již existuje.');
  if (item.LookupId) {
    const before = ctx.store.lookups.get(item.LookupId);
    if (!before) throw new ServiceError('Položka nebyla nalezena.');
    if (before.Code !== item.Code) throw new ServiceError('Kód existující položky nelze měnit (stabilní identifikátor).');
    await ctx.store.lookups.update(item.LookupId, item);
    await ctx.store.audit.appendMany(fieldChanges(ctx, { EntityType: 'Lookup', EntityId: item.LookupId, ControlId: null, Action: 'Úprava číselníku', ChangeReason: reason }, before, item, ['Label', 'SortOrder', 'IsActive', 'ManagerEmail']));
  } else {
    const rec: LookupItem = { ...item, LookupId: `${item.LookupType}-${item.Code}` };
    await ctx.store.lookups.create(rec);
    await audit(ctx, { EntityType: 'Lookup', EntityId: rec.LookupId, ControlId: null, Action: 'Nová položka číselníku', FieldName: item.LookupType, NewValue: `${item.Code} – ${item.Label}`, ChangeReason: reason });
  }
}

// ---------------------------------------------------------------------------------------------
// Export / import JSON
// ---------------------------------------------------------------------------------------------

export const EXPORT_LISTS = [
  'controls',
  'versions',
  'runs',
  'findings',
  'audit',
  'notifications',
  'roles',
  'reports',
  'documents',
  'protocols',
  'lookups',
  'holidays',
  'automation',
  'directory',
] as const;

type ExportList = (typeof EXPORT_LISTS)[number];

export interface ExportFile {
  app: 'control-hub';
  schemaVersion: 1;
  seedVersion: number;
  exportedAt: string;
  exportedBy: string;
  settings: AppSettings;
  lists: Record<ExportList, unknown[]>;
  files: Array<{ id: string; name: string; type: string; dataUrl: string }>;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

export async function exportData(ctx: ServiceContext, includeFiles: boolean): Promise<ExportFile> {
  if (!can(ctx.session, 'exportData')) throw new PermissionError('Export dat není pro aktivní roli povolen.');
  const store = ctx.store;
  const lists = Object.fromEntries(EXPORT_LISTS.map((k) => [k, [...(store[k] as { all(): unknown[] }).all()]])) as Record<ExportList, unknown[]>;
  const files: ExportFile['files'] = [];
  if (includeFiles) for (const f of await store.files.all()) files.push({ id: f.id, name: f.name, type: f.type, dataUrl: await blobToDataUrl(f.blob) });
  await audit(ctx, { EntityType: 'System', EntityId: 'export', ControlId: null, Action: 'Export dat (JSON)', FieldName: 'IncludeFiles', NewValue: includeFiles });
  return { app: 'control-hub', schemaVersion: 1, seedVersion: SEED_VERSION, exportedAt: new Date().toISOString(), exportedBy: ctx.session.user.Email, settings: store.settings.get(), lists, files };
}

const REQUIRED_FIELDS: Partial<Record<ExportList, string[]>> = {
  controls: ['ControlId', 'ControlCode', 'Name', 'Department', 'IsActive'],
  versions: ['VersionId', 'ControlId', 'VersionNumber', 'EffectiveFrom', 'RecurrenceSettings'],
  runs: ['RunId', 'ControlId', 'VersionId', 'OccurrenceKey', 'DueDate', 'WorkflowState'],
  findings: ['FindingId', 'RunId', 'Status'],
  audit: ['AuditId', 'EntityType', 'Action', 'ChangedAt'],
  directory: ['Email', 'DisplayName'],
};

/** Základní validace importu: struktura, povinná pole, referenční integrita, unikátní klíče. */
export function validateImport(data: unknown): string[] {
  const errors: string[] = [];
  const d = data as Partial<ExportFile>;
  if (!d || typeof d !== 'object') return ['Soubor neobsahuje platný JSON objekt.'];
  if (d.app !== 'control-hub') errors.push('Soubor není exportem aplikace CONTROL HUB.');
  if (d.schemaVersion !== 1) errors.push(`Nepodporovaná verze schématu: ${String(d.schemaVersion)}.`);
  if (!d.lists || typeof d.lists !== 'object') return [...errors, 'Chybí sekce „lists“.'];
  for (const k of EXPORT_LISTS) if (!Array.isArray(d.lists[k])) errors.push(`Chybí seznam „${k}“.`);
  if (errors.length) return errors;
  for (const [k, fields] of Object.entries(REQUIRED_FIELDS) as Array<[ExportList, string[]]>) {
    const bad = (d.lists[k] as Record<string, unknown>[]).filter((x) => fields.some((f) => x[f] === undefined || x[f] === null || x[f] === ''));
    if (bad.length) errors.push(`Seznam „${k}“: ${bad.length} záznamů bez povinných polí (${fields.join(', ')}).`);
  }
  const controlIds = new Set((d.lists.controls as Array<{ ControlId: string }>).map((c) => c.ControlId));
  const versionIds = new Set((d.lists.versions as Array<{ VersionId: string }>).map((c) => c.VersionId));
  const runs = d.lists.runs as Array<{ ControlId: string; VersionId: string; OccurrenceKey: string; WorkflowState: string; CompletedAt?: string | null }>;
  const orphanRuns = runs.filter((r) => !controlIds.has(r.ControlId) || !versionIds.has(r.VersionId)).length;
  if (orphanRuns) errors.push(`${orphanRuns} běhů odkazuje na neexistující kontrolu nebo verzi.`);
  const keys = new Set<string>();
  let dupKeys = 0;
  for (const r of runs) {
    if (keys.has(r.OccurrenceKey)) dupKeys++;
    keys.add(r.OccurrenceKey);
  }
  if (dupKeys) errors.push(`${dupKeys} duplicitních OccurrenceKey.`);
  const inconsistent = runs.filter((r) => r.WorkflowState === 'Completed' && !r.CompletedAt).length;
  if (inconsistent) errors.push(`${inconsistent} dokončených běhů nemá datum dokončení.`);
  return errors;
}

export async function importData(ctx: ServiceContext, data: ExportFile) {
  requireAdmin(ctx);
  const errors = validateImport(data);
  if (errors.length) throw new ServiceError('Import nelze provést.', errors);
  const store = ctx.store;
  await store.clearAll();
  await store.bus.batch(async () => {
    for (const k of EXPORT_LISTS) {
      const repo = store[k] as unknown as { bulkPut?: (x: unknown[]) => Promise<void>; appendMany?: (x: unknown[]) => Promise<void> };
      if (repo.bulkPut) await repo.bulkPut(data.lists[k]);
      else if (repo.appendMany) await repo.appendMany(data.lists[k]);
    }
    for (const f of data.files ?? []) await store.files.put(f.id, await dataUrlToBlob(f.dataUrl), f.name);
    await store.settings.replace(data.settings);
    await store.audit.append(makeAudit(ctx, { EntityType: 'System', EntityId: 'import', ControlId: null, Action: 'Import dat (JSON)', FieldName: 'Source', NewValue: `${data.exportedBy} ${data.exportedAt}` }));
  });
}

/** Obnovení původních demo dat (smaže vše a znovu vygeneruje). */
export async function resetDemoData(store: DataStore, forDate?: string) {
  const current = store.settings.get();
  const paMode = current.paReferenceMode;
  const date = forDate ?? today(store);
  await store.clearAll();
  const res = await seedDemoData(store, date);
  // Demo data jsou vztažena k (testovacímu) dni; testovací datum i režim reference zůstávají.
  await store.settings.update({ testDate: current.testDate, paReferenceMode: paMode });
  return res;
}
