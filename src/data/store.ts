/** Sestavení datové vrstvy – všechny „seznamy“ a knihovny dokumentů aplikace. */
import { openIndexedDbBackend, type StorageBackend } from './backend';
import { ChangeBus } from './changeBus';
import { LocalAppendOnlyRepository, LocalListRepository, type AppendOnlyRepository, type ListRepository } from './repository';
import type {
  AppSettings,
  AuditEntry,
  AutomationLogEntry,
  Control,
  ControlRun,
  ControlVersion,
  DirectoryUser,
  DocumentRecord,
  Finding,
  Holiday,
  LookupItem,
  NotificationRecord,
  ProtocolRecord,
  ReportSnapshot,
  RoleAssignment,
} from '../domain/types';

export const DEFAULT_SETTINGS: AppSettings = {
  reminderDaysBefore: [7, 3, 1, 0],
  overdueDaysAfter: [1, 3, 7],
  escalationAfterDays: 5,
  escalateToManager: true,
  escalateToCoordinator: true,
  approvalReminderDays: 2,
  digestMode: 'Immediate',
  dueSoonDays: 3,
  planningHorizonMonths: 12,
  defaultDueRule: { offset: 3, unit: 'Workdays', shift: 'NextWorkday' },
  defaultNonWorkingDayShift: 'NextWorkday',
  defaultInvalidDayPolicy: 'LastDayOfMonth',
  simulatedFailureRate: 0.05,
  maxRetries: 3,
  coordinatorEmail: '',
  adminEmail: '',
  senderMailbox: 'kontroly-noreply@ic-demo.example',
  testDate: null,
  paReferenceMode: false,
  lastGenerationDate: null,
  lastDeadlineCheckDate: null,
};

export interface SettingsRepository {
  readonly listName: 'IC_Settings';
  get(): AppSettings;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
  load(): Promise<void>;
  replace(value: AppSettings): Promise<void>;
}

export interface StoredFile {
  id: string;
  blob: Blob;
  name: string;
  type: string;
}

export interface FileStore {
  put(id: string, blob: Blob, name: string): Promise<void>;
  get(id: string): Promise<StoredFile | undefined>;
  delete(id: string): Promise<void>;
  all(): Promise<StoredFile[]>;
  clear(): Promise<void>;
}

export interface DataStore {
  backend: StorageBackend;
  bus: ChangeBus;
  controls: ListRepository<Control>;
  versions: ListRepository<ControlVersion>;
  runs: ListRepository<ControlRun>;
  findings: ListRepository<Finding>;
  audit: AppendOnlyRepository<AuditEntry>;
  notifications: ListRepository<NotificationRecord>;
  roles: ListRepository<RoleAssignment>;
  reports: ListRepository<ReportSnapshot>;
  documents: ListRepository<DocumentRecord>;
  protocols: ListRepository<ProtocolRecord>;
  lookups: ListRepository<LookupItem>;
  holidays: ListRepository<Holiday>;
  automation: ListRepository<AutomationLogEntry>;
  directory: ListRepository<DirectoryUser>;
  settings: SettingsRepository;
  files: FileStore;
  loadAll(): Promise<void>;
  clearAll(): Promise<void>;
  getMeta(key: string): Promise<unknown>;
  setMeta(key: string, value: unknown): Promise<void>;
}

export function createDataStore(backend: StorageBackend, bus = new ChangeBus()): DataStore {
  const list = <T extends object>(name: string, key: keyof T & string, versioned = true) =>
    new LocalListRepository<T>(name, key, backend, bus, versioned);

  let settingsValue: AppSettings = { ...DEFAULT_SETTINGS };
  const settings: SettingsRepository = {
    listName: 'IC_Settings',
    get: () => settingsValue,
    async load() {
      const rec = await backend.get<{ Key: string; Value: AppSettings }>('IC_Settings', 'app');
      settingsValue = { ...DEFAULT_SETTINGS, ...(rec?.Value ?? {}) };
      bus.emit('IC_Settings', false);
    },
    async update(patch) {
      settingsValue = { ...settingsValue, ...patch };
      await backend.put('IC_Settings', { Key: 'app', Value: settingsValue });
      bus.emit('IC_Settings', true);
      return settingsValue;
    },
    async replace(value) {
      settingsValue = { ...DEFAULT_SETTINGS, ...value };
      await backend.put('IC_Settings', { Key: 'app', Value: settingsValue });
      bus.emit('IC_Settings', true);
    },
  };

  const files: FileStore = {
    async put(id, blob, name) {
      await backend.put<StoredFile>('_files', { id, blob, name, type: blob.type });
    },
    get: (id) => backend.get<StoredFile>('_files', id),
    delete: (id) => backend.delete('_files', id),
    all: () => backend.getAll<StoredFile>('_files'),
    clear: () => backend.clear('_files'),
  };

  const store: DataStore = {
    backend,
    bus,
    controls: list<Control>('IC_Controls', 'ControlId'),
    versions: list<ControlVersion>('IC_ControlVersions', 'VersionId', false),
    runs: list<ControlRun>('IC_ControlRuns', 'RunId'),
    findings: list<Finding>('IC_Findings', 'FindingId'),
    audit: new LocalAppendOnlyRepository<AuditEntry>('IC_AuditLog', backend, bus),
    notifications: list<NotificationRecord>('IC_Notifications', 'NotificationId', false),
    roles: list<RoleAssignment>('IC_RoleAssignments', 'AssignmentId', false),
    reports: list<ReportSnapshot>('IC_ReportSnapshots', 'ReportId', false),
    documents: list<DocumentRecord>('IC_Documents', 'DocumentId', false),
    protocols: list<ProtocolRecord>('IC_Protocols', 'ProtocolId', false),
    lookups: list<LookupItem>('IC_Lookups', 'LookupId', false),
    holidays: list<Holiday>('IC_Holidays', 'HolidayId', false),
    automation: list<AutomationLogEntry>('IC_AutomationLog', 'LogId', false),
    directory: list<DirectoryUser>('IC_Directory', 'Email', false),
    settings,
    files,
    async loadAll() {
      await Promise.all([
        store.controls.load(),
        store.versions.load(),
        store.runs.load(),
        store.findings.load(),
        store.audit.load(),
        store.notifications.load(),
        store.roles.load(),
        store.reports.load(),
        store.documents.load(),
        store.protocols.load(),
        store.lookups.load(),
        store.holidays.load(),
        store.automation.load(),
        store.directory.load(),
        store.settings.load(),
      ]);
    },
    async clearAll() {
      await bus.batch(async () => {
        await Promise.all([
          store.controls.clear(),
          store.versions.clear(),
          store.runs.clear(),
          store.findings.clear(),
          store.audit.clear(),
          store.notifications.clear(),
          store.roles.clear(),
          store.reports.clear(),
          store.documents.clear(),
          store.protocols.clear(),
          store.lookups.clear(),
          store.holidays.clear(),
          store.automation.clear(),
          store.directory.clear(),
          files.clear(),
          backend.clear('IC_Settings'),
          backend.clear('_meta'),
        ]);
      });
    },
    async getMeta(key) {
      return (await backend.get<{ key: string; value: unknown }>('_meta', key))?.value;
    },
    async setMeta(key, value) {
      await backend.put('_meta', { key, value });
    },
  };

  /** Změna v jiné záložce → znovu načíst dotčený seznam. */
  bus.onRemoteChange((name) => {
    const repo = Object.values(store).find(
      (v) => v && typeof v === 'object' && 'listName' in v && (v as { listName: string }).listName === name,
    ) as { load?: () => Promise<void> } | undefined;
    void repo?.load?.();
  });

  return store;
}

export async function openLocalDataStore(): Promise<DataStore> {
  const backend = await openIndexedDbBackend();
  const store = createDataStore(backend);
  await store.loadAll();
  return store;
}
