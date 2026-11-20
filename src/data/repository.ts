/**
 * Repository vrstva – abstrakce datových operací nad jedním „seznamem“.
 *
 * UI a služby pracují pouze s tímto rozhraním. Lokální implementace drží paměťovou cache
 * (synchronní čtení pro React) a zapisuje do StorageBackend. Pro SharePoint by se
 * implementace nahradila voláním REST/Graph API – v Power Apps se místo ní použijí
 * přímo datové zdroje (Filter/LookUp/Patch). Mapování viz docs/POWERAPPS_MIGRATION.md.
 */
import type { StorageBackend } from './backend';
import type { ChangeBus } from './changeBus';

export class ConcurrencyError extends Error {
  constructor(
    public readonly listName: string,
    public readonly id: string,
    public readonly expected: number,
    public readonly actual: number,
    public readonly modifiedBy: string | null,
  ) {
    super(
      `Záznam byl mezitím změněn${modifiedBy ? ` uživatelem ${modifiedBy}` : ''} (verze ${actual}, očekávána ${expected}). Načtěte aktuální stav a změnu zopakujte.`,
    );
    this.name = 'ConcurrencyError';
  }
}

export class NotFoundError extends Error {
  constructor(listName: string, id: string) {
    super(`Záznam ${id} v ${listName} nebyl nalezen.`);
    this.name = 'NotFoundError';
  }
}

export interface UpdateOptions {
  /** Optimistická souběžnost: zápis selže, pokud se RowVersion mezitím změnila. */
  expectedRowVersion?: number;
}

export interface ListRepository<T> {
  readonly listName: string;
  readonly keyField: keyof T & string;
  all(): T[];
  get(id: string): T | undefined;
  filter(pred: (item: T) => boolean): T[];
  create(item: T): Promise<T>;
  update(id: string, patch: Partial<T>, opts?: UpdateOptions): Promise<T>;
  bulkPut(items: T[]): Promise<void>;
  load(): Promise<void>;
  clear(): Promise<void>;
}

export interface AppendOnlyRepository<T> {
  readonly listName: string;
  all(): T[];
  filter(pred: (item: T) => boolean): T[];
  append(item: T): Promise<T>;
  appendMany(items: T[]): Promise<void>;
  load(): Promise<void>;
  clear(): Promise<void>;
}

export class LocalListRepository<T extends object> implements ListRepository<T> {
  private cache = new Map<string, T>();
  private snapshot: T[] | null = null;

  constructor(
    public readonly listName: string,
    public readonly keyField: keyof T & string,
    private readonly backend: StorageBackend,
    private readonly bus: ChangeBus,
    private readonly versioned = true,
  ) {}

  private key(item: T): string {
    return String(item[this.keyField]);
  }

  private touch(broadcast = true) {
    this.snapshot = null;
    this.bus.emit(this.listName, broadcast);
  }

  async load() {
    const items = await this.backend.getAll<T>(this.listName);
    this.cache = new Map(items.map((i) => [this.key(i), i]));
    this.touch(false);
  }

  all(): T[] {
    if (!this.snapshot) this.snapshot = [...this.cache.values()];
    return this.snapshot;
  }

  get(id: string) {
    return this.cache.get(id);
  }

  filter(pred: (item: T) => boolean) {
    return this.all().filter(pred);
  }

  async create(item: T) {
    await this.backend.add(this.listName, item);
    this.cache.set(this.key(item), item);
    this.touch();
    return item;
  }

  async update(id: string, patch: Partial<T>, opts: UpdateOptions = {}) {
    const next = await this.backend.update<T>(this.listName, id, (current) => {
      if (!current) throw new NotFoundError(this.listName, id);
      const rec = current as Record<string, unknown>;
      if (this.versioned && opts.expectedRowVersion !== undefined && rec.RowVersion !== opts.expectedRowVersion)
        throw new ConcurrencyError(
          this.listName,
          id,
          opts.expectedRowVersion,
          Number(rec.RowVersion),
          (rec.ModifiedBy as string | undefined) ?? null,
        );
      const merged = { ...current, ...patch } as Record<string, unknown>;
      if (this.versioned && 'RowVersion' in rec) merged.RowVersion = Number(rec.RowVersion ?? 0) + 1;
      return merged as T;
    });
    this.cache.set(id, next);
    this.touch();
    return next;
  }

  async bulkPut(items: T[]) {
    if (!items.length) return;
    await this.backend.bulkPut(this.listName, items);
    for (const i of items) this.cache.set(this.key(i), i);
    this.touch();
  }

  async clear() {
    await this.backend.clear(this.listName);
    this.cache.clear();
    this.touch();
  }
}

export class LocalAppendOnlyRepository<T extends object> implements AppendOnlyRepository<T> {
  private items: T[] = [];
  private snapshot: T[] | null = null;
  constructor(
    public readonly listName: string,
    private readonly backend: StorageBackend,
    private readonly bus: ChangeBus,
  ) {}
  async load() {
    this.items = await this.backend.getAll<T>(this.listName);
    this.snapshot = null;
    this.bus.emit(this.listName, false);
  }
  all() {
    if (!this.snapshot) this.snapshot = [...this.items];
    return this.snapshot;
  }
  filter(pred: (item: T) => boolean) {
    return this.all().filter(pred);
  }
  async append(item: T) {
    await this.backend.add(this.listName, item);
    this.items.push(Object.freeze(item));
    this.snapshot = null;
    this.bus.emit(this.listName, true);
    return item;
  }
  async appendMany(items: T[]) {
    if (!items.length) return;
    await this.backend.bulkPut(this.listName, items);
    this.items.push(...items.map((i) => Object.freeze(i)));
    this.snapshot = null;
    this.bus.emit(this.listName, true);
  }
  async clear() {
    await this.backend.clear(this.listName);
    this.items = [];
    this.snapshot = null;
    this.bus.emit(this.listName, true);
  }
}
