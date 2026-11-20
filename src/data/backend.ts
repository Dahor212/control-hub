/**
 * Úložiště (storage backend). Lokální implementace nad IndexedDB a paměťová implementace pro testy.
 *
 * V produkci tuto vrstvu nahrazuje SharePoint Online:
 *   getAll  → Filter(IC_xxx, <delegovatelná podmínka>)   / Get items (OData $filter)
 *   add     → Patch(IC_xxx, Defaults(IC_xxx), {...})      / Create item
 *   update  → Patch(IC_xxx, LookUp(...), {...})           / Update item (+ If-Match ETag)
 * Unikátní indexy odpovídají volbě „Vynutit jedinečné hodnoty“ u indexovaného sloupce.
 */
import { openDB, type IDBPDatabase } from 'idb';

export interface StoreSchema {
  name: string;
  keyPath: string;
  indexes?: Array<{ name: string; unique?: boolean }>;
}

export const DB_NAME = 'control-hub';
export const DB_VERSION = 1;

export const SCHEMAS: StoreSchema[] = [
  { name: 'IC_Controls', keyPath: 'ControlId', indexes: [{ name: 'ControlCode', unique: true }] },
  { name: 'IC_ControlVersions', keyPath: 'VersionId', indexes: [{ name: 'ControlId' }] },
  { name: 'IC_ControlRuns', keyPath: 'RunId', indexes: [{ name: 'OccurrenceKey', unique: true }, { name: 'ControlId' }, { name: 'DueMonthKey' }] },
  { name: 'IC_Findings', keyPath: 'FindingId', indexes: [{ name: 'FindingCode', unique: true }] },
  { name: 'IC_AuditLog', keyPath: 'AuditId', indexes: [{ name: 'EntityId' }] },
  { name: 'IC_Notifications', keyPath: 'NotificationId', indexes: [{ name: 'DeduplicationKey', unique: true }] },
  { name: 'IC_RoleAssignments', keyPath: 'AssignmentId' },
  { name: 'IC_ReportSnapshots', keyPath: 'ReportId' },
  { name: 'IC_Settings', keyPath: 'Key' },
  { name: 'IC_Documents', keyPath: 'DocumentId' },
  { name: 'IC_Protocols', keyPath: 'ProtocolId' },
  { name: 'IC_Lookups', keyPath: 'LookupId' },
  { name: 'IC_Holidays', keyPath: 'HolidayId' },
  { name: 'IC_AutomationLog', keyPath: 'LogId' },
  { name: 'IC_Directory', keyPath: 'Email' },
  { name: '_files', keyPath: 'id' },
  { name: '_meta', keyPath: 'key' },
];

export class DuplicateKeyError extends Error {
  constructor(public readonly store: string, message: string) {
    super(message);
    this.name = 'DuplicateKeyError';
  }
}

export interface StorageBackend {
  getAll<T>(store: string): Promise<T[]>;
  get<T>(store: string, key: string): Promise<T | undefined>;
  add<T>(store: string, item: T): Promise<void>;
  put<T>(store: string, item: T): Promise<void>;
  /** Atomické čtení–úprava–zápis v jedné transakci (optimistická souběžnost). */
  update<T>(store: string, key: string, mutate: (current: T | undefined) => T): Promise<T>;
  bulkPut<T>(store: string, items: T[]): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  clear(store: string): Promise<void>;
}

function mapIdbError(store: string, e: unknown): never {
  if (e instanceof DOMException && e.name === 'ConstraintError')
    throw new DuplicateKeyError(store, `Záznam s tímto jedinečným klíčem již v ${store} existuje.`);
  throw e;
}

export async function openIndexedDbBackend(name = DB_NAME): Promise<StorageBackend> {
  const db: IDBPDatabase = await openDB(name, DB_VERSION, {
    upgrade(database) {
      for (const s of SCHEMAS) {
        if (database.objectStoreNames.contains(s.name)) continue;
        const os = database.createObjectStore(s.name, { keyPath: s.keyPath });
        for (const idx of s.indexes ?? []) os.createIndex(idx.name, idx.name, { unique: !!idx.unique });
      }
    },
  });
  return {
    getAll: (store) => db.getAll(store),
    get: (store, key) => db.get(store, key),
    async add(store, item) {
      try {
        await db.add(store, item);
      } catch (e) {
        mapIdbError(store, e);
      }
    },
    async put(store, item) {
      try {
        await db.put(store, item);
      } catch (e) {
        mapIdbError(store, e);
      }
    },
    async update(store, key, mutate) {
      const tx = db.transaction(store, 'readwrite');
      try {
        const current = await tx.store.get(key);
        const next = mutate(current);
        await tx.store.put(next);
        await tx.done;
        return next;
      } catch (e) {
        try {
          tx.abort();
        } catch {
          /* transakce již ukončena */
        }
        if (e instanceof DOMException) mapIdbError(store, e);
        throw e;
      }
    },
    async bulkPut(store, items) {
      const tx = db.transaction(store, 'readwrite');
      try {
        for (const it of items) tx.store.put(it);
        await tx.done;
      } catch (e) {
        mapIdbError(store, e);
      }
    },
    delete: (store, key) => db.delete(store, key),
    clear: (store) => db.clear(store),
  };
}

/** Paměťové úložiště se stejnou sémantikou (unikátní indexy, atomický update) – pro unit testy. */
export function createMemoryBackend(): StorageBackend {
  const data = new Map<string, Map<string, unknown>>();
  const schema = new Map(SCHEMAS.map((s) => [s.name, s]));
  const table = (s: string) => {
    let t = data.get(s);
    if (!t) data.set(s, (t = new Map()));
    return t;
  };
  const clone = <T>(v: T): T => {
    try {
      return structuredClone(v);
    } catch {
      return v; // Blob apod. v prostředí bez podpory klonování
    }
  };
  const checkUnique = (store: string, item: Record<string, unknown>) => {
    const s = schema.get(store);
    if (!s) return;
    for (const idx of s.indexes ?? []) {
      if (!idx.unique) continue;
      for (const [k, other] of table(store)) {
        if (k === item[s.keyPath]) continue;
        if ((other as Record<string, unknown>)[idx.name] === item[idx.name])
          throw new DuplicateKeyError(store, `Záznam s tímto jedinečným klíčem již v ${store} existuje.`);
      }
    }
  };
  const keyOf = (store: string, item: unknown) => String((item as Record<string, unknown>)[schema.get(store)?.keyPath ?? 'id']);
  return {
    async getAll<T>(store: string) {
      return [...table(store).values()].map((v) => clone(v)) as T[];
    },
    async get<T>(store: string, key: string) {
      const v = table(store).get(key);
      return (v === undefined ? undefined : clone(v)) as T | undefined;
    },
    async add(store, item) {
      const k = keyOf(store, item);
      if (table(store).has(k)) throw new DuplicateKeyError(store, 'Duplicitní primární klíč.');
      checkUnique(store, item as Record<string, unknown>);
      table(store).set(k, clone(item));
    },
    async put(store, item) {
      checkUnique(store, item as Record<string, unknown>);
      table(store).set(keyOf(store, item), clone(item));
    },
    async update<T>(store: string, key: string, mutate: (c: T | undefined) => T) {
      const current = table(store).get(key) as T | undefined;
      const next = mutate(current === undefined ? undefined : clone(current));
      checkUnique(store, next as Record<string, unknown>);
      table(store).set(key, clone(next));
      return next;
    },
    async bulkPut(store, items) {
      for (const it of items) {
        checkUnique(store, it as Record<string, unknown>);
        table(store).set(keyOf(store, it), clone(it));
      }
    },
    async delete(store, key) {
      table(store).delete(key);
    },
    async clear(store) {
      table(store).clear();
    },
  };
}
