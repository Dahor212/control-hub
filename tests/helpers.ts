import { createMemoryBackend } from '../src/data/backend';
import { ChangeBus } from '../src/data/changeBus';
import { createDataStore, DEFAULT_SETTINGS, type DataStore } from '../src/data/store';
import type { Session } from '../src/domain/permissions';
import type { ControlVersion, RoleName } from '../src/domain/types';
import type { VersionDraft } from '../src/domain/versioning';
import { DIRECTORY, LOOKUPS, ROLE_SEED, U } from '../src/data/seedCatalog';
import { setPdfRenderers } from '../src/services/documentService';
import type { ServiceContext } from '../src/services/core';

export { U };

setPdfRenderers({
  protocol: async (s) => new Blob([`PDF ${s.protocolId}`], { type: 'application/pdf' }),
  report: async (_d, m) => new Blob([`PDF ${m.reportId}`], { type: 'application/pdf' }),
});

export async function emptyStore(testDate = '2026-11-20'): Promise<DataStore> {
  const store = createDataStore(createMemoryBackend(), new ChangeBus(`test-${Math.random()}`));
  await store.loadAll();
  await store.directory.bulkPut(DIRECTORY);
  await store.lookups.bulkPut(LOOKUPS);
  await store.roles.bulkPut(ROLE_SEED.map(([UserEmail, Role, DepartmentScope], i) => ({ AssignmentId: `ra${i}`, UserEmail, Role, DepartmentScope, IsActive: true })));
  await store.settings.replace({ ...DEFAULT_SETTINGS, testDate, coordinatorEmail: U.coord, adminEmail: U.admin, simulatedFailureRate: 0 });
  return store;
}

export function session(store: DataStore, email: string, role: RoleName): Session {
  const user = store.directory.get(email)!;
  return { user, activeRole: role, assignments: store.roles.filter((r) => r.UserEmail === email) };
}

export function ctxFor(store: DataStore, email: string, role: RoleName): ServiceContext {
  return { store, session: session(store, email, role) };
}

export function draft(overrides: Partial<VersionDraft> = {}): VersionDraft {
  return {
    ControlName: 'Testovací kontrola',
    Description: 'Popis',
    ControlObjective: 'Cíl',
    Instructions: 'Postup',
    RiskLevel: 'High',
    Priority: 'Normal',
    PrimaryOwnerEmail: U.jana,
    BackupOwnerEmail: U.veronika,
    ReviewerEmail: U.headPRI,
    RecurrenceType: 'Monthly',
    RecurrenceInterval: 1,
    RecurrenceSettings: {
      startDate: '2026-12-01',
      endDate: null,
      daysOfWeek: [],
      monthlyMode: 'DayOfMonth',
      dayOfMonth: 10,
      workdayNumber: 1,
      invalidDayPolicy: 'LastDayOfMonth',
      nonWorkingDayShift: 'NextWorkday',
      periodMode: 'Previous',
    },
    DueDateRule: { offset: 3, unit: 'Workdays', shift: 'NextWorkday' },
    RequiredEvidence: [{ id: 'ev1', name: 'Výpis', mandatory: true }],
    ChecklistDefinition: [
      { id: 's1', label: 'Krok 1', required: true },
      { id: 's2', label: 'Krok 2', required: true },
    ],
    ApprovalRequired: true,
    ReminderPolicy: { useGlobal: true, daysBefore: [7, 3, 1, 0], overdueDays: [1, 3, 7], escalationAfterDays: 5 },
    ...overrides,
  };
}

export function versionFrom(d: VersionDraft, extra: Partial<ControlVersion> = {}): ControlVersion {
  return {
    ...d,
    VersionId: 'v1',
    ControlId: 'c1',
    ControlCode: 'CTRL-9001',
    VersionNumber: 1,
    EffectiveFrom: d.RecurrenceSettings.startDate,
    EffectiveTo: null,
    CreatedAt: '2026-11-01T08:00:00.000Z',
    CreatedBy: U.coord,
    ChangeReason: 'Založení',
    ...extra,
  };
}
