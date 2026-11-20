/**
 * Doménový model CONTROL HUB.
 *
 * Každé rozhraní odpovídá 1:1 jednomu SharePoint seznamu (viz docs/SHAREPOINT_SCHEMA.md).
 * Názvy polí jsou záměrně shodné s interními názvy SharePoint sloupců, aby se výrazy Power Fx
 * daly přepsat bez překladové tabulky.
 *
 * Konvence:
 *  - ISODate      = kalendářní den 'YYYY-MM-DD' v časovém pásmu Europe/Prague (bez času).
 *  - ISODateTime  = okamžik v UTC ve formátu ISO 8601.
 *  - Složité struktury (RecurrenceSettings, ChecklistDefinition, …) se v SharePointu ukládají
 *    jako JSON do sloupce typu „Více řádků textu (prostý text)“.
 */

export type ISODate = string;
export type ISODateTime = string;
export type Email = string;

export type RoleName = 'Administrator' | 'Coordinator' | 'ControlOwner' | 'Reviewer' | 'Manager' | 'Auditor';
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type Priority = 'Low' | 'Normal' | 'High';
export type RecurrenceType =
  | 'OneTime'
  | 'Daily'
  | 'Workday'
  | 'Weekly'
  | 'Monthly'
  | 'Quarterly'
  | 'SemiAnnual'
  | 'Annual';
export type MonthlyMode = 'DayOfMonth' | 'LastDayOfMonth' | 'NthWorkday';
export type ShiftRule = 'None' | 'PreviousWorkday' | 'NextWorkday';
export type InvalidDayPolicy = 'LastDayOfMonth' | 'Skip';
export type PeriodMode = 'Current' | 'Previous';
export type DueUnit = 'CalendarDays' | 'Workdays';

/** Skutečný stav pracovního procesu (ukládá se). Časové stavy se dopočítávají – viz status.ts. */
export type WorkflowState = 'Planned' | 'InProgress' | 'Submitted' | 'Returned' | 'Completed' | 'Cancelled';
export type RunResult = 'NoFindings' | 'WithFindings' | 'PartiallyMet' | 'NotMet' | 'NotAssessable';
export type ChecklistAnswer = 'OK' | 'NOK' | 'NA';
export type FindingSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type FindingStatus = 'Open' | 'InProgress' | 'Closed';
export type NotificationType =
  | 'Assignment'
  | 'AssignmentChange'
  | 'DueReminder'
  | 'Overdue'
  | 'Escalation'
  | 'ApprovalRequest'
  | 'ApprovalPending'
  | 'Returned'
  | 'Approved'
  | 'DailyDigest'
  | 'AutomationFailure';
export type DeliveryStatus = 'Pending' | 'Sent' | 'Failed' | 'Digested' | 'Cancelled';
export type DocumentType = 'Evidence' | 'Protocol' | 'Methodology' | 'Report' | 'Other';
export type DocumentLibrary = 'IC_ControlDocuments' | 'IC_ManagementReports';

export interface RecurrenceSettings {
  /** První plánovaný výskyt a zároveň kotva kadence (týden / měsíc). */
  startDate: ISODate;
  /** Volitelné datum ukončení opakování (včetně). */
  endDate: ISODate | null;
  /** Dny v týdnu pro typ Weekly: 1 = pondělí … 7 = neděle. */
  daysOfWeek: number[];
  /** Pravidlo dne v měsíci pro Monthly / Quarterly / SemiAnnual / Annual. */
  monthlyMode: MonthlyMode;
  /** Den v měsíci (1–31) pro režim DayOfMonth. */
  dayOfMonth: number;
  /** N-tý pracovní den v měsíci pro režim NthWorkday. */
  workdayNumber: number;
  /** Co dělat, když den neexistuje (např. 31. února). */
  invalidDayPolicy: InvalidDayPolicy;
  /** Posun plánovaného data, když připadne na víkend nebo státní svátek. */
  nonWorkingDayShift: ShiftRule;
  /** Kontrolované období: aktuální cyklus, nebo předchozí cyklus (typicky „kontrola za minulý měsíc“). */
  periodMode: PeriodMode;
}

export interface DueDateRule {
  /** Posun termínu splnění od plánovaného data. */
  offset: number;
  unit: DueUnit;
  /** Posun termínu, pokud připadne na nepracovní den (jen pro kalendářní dny). */
  shift: ShiftRule;
}

export interface ChecklistItemDef {
  id: string;
  label: string;
  guidance?: string;
  required: boolean;
}

export interface EvidenceDef {
  id: string;
  name: string;
  description?: string;
  mandatory: boolean;
}

export interface ReminderPolicy {
  /** true = použijí se globální pravidla z IC_Settings. */
  useGlobal: boolean;
  daysBefore: number[];
  overdueDays: number[];
  escalationAfterDays: number;
}

/** A. IC_Controls – stabilní identita kontroly. */
export interface Control {
  ControlId: string;
  ControlCode: string;
  Name: string;
  Category: string;
  Department: string;
  IsActive: boolean;
  CreatedAt: ISODateTime;
  CreatedBy: Email;
  ArchivedAt: ISODateTime | null;
  ArchiveReason: string | null;
  /** Denormalizace z poslední verze – registr se tak obejde bez lookupů (delegace). */
  CurrentVersionId: string;
  CurrentVersionNumber: number;
  OwnerEmail: Email;
  RiskLevel: RiskLevel;
  RecurrenceType: RecurrenceType;
  ModifiedAt: ISODateTime;
  ModifiedBy: Email;
  RowVersion: number;
}

/** B. IC_ControlVersions – historicky platné verze definice a plánu. */
export interface ControlVersion {
  VersionId: string;
  ControlId: string;
  ControlCode: string;
  VersionNumber: number;
  EffectiveFrom: ISODate;
  EffectiveTo: ISODate | null;
  ControlName: string;
  Description: string;
  ControlObjective: string;
  Instructions: string;
  RiskLevel: RiskLevel;
  Priority: Priority;
  PrimaryOwnerEmail: Email;
  BackupOwnerEmail: Email | null;
  ReviewerEmail: Email | null;
  RecurrenceType: RecurrenceType;
  RecurrenceInterval: number;
  RecurrenceSettings: RecurrenceSettings;
  DueDateRule: DueDateRule;
  RequiredEvidence: EvidenceDef[];
  ChecklistDefinition: ChecklistItemDef[];
  ApprovalRequired: boolean;
  ReminderPolicy: ReminderPolicy;
  CreatedAt: ISODateTime;
  CreatedBy: Email;
  ChangeReason: string;
}

export interface ChecklistResult {
  itemId: string;
  label: string;
  required: boolean;
  answer: ChecklistAnswer | null;
  comment: string;
}

/** C. IC_ControlRuns – konkrétní výskyt (běh) kontroly. */
export interface ControlRun {
  RunId: string;
  ControlId: string;
  VersionId: string;
  VersionNumber: number;
  /** Denormalizace pro delegovatelné filtry a zobrazení bez lookupů. */
  ControlCode: string;
  ControlName: string;
  Department: string;
  Category: string;
  RiskLevel: RiskLevel;
  RecurrenceType: RecurrenceType;
  /** Stabilní idempotentní klíč výskytu: `CTRL-0001|2026-11-20` (nominální datum). Unikátní. */
  OccurrenceKey: string;
  /** Lidsky čitelné označení běhu a název složky dokumentů, např. RUN-2026-10. */
  RunCode: string;
  /** Datum výskytu podle pravidla před posunem na pracovní den. */
  NominalDate: ISODate;
  PeriodFrom: ISODate;
  PeriodTo: ISODate;
  ScheduledDate: ISODate;
  DueDate: ISODate;
  /** 'YYYY-MM' z DueDate – indexovaný sloupec pro delegovatelné měsíční dotazy. */
  DueMonthKey: string;
  AssignedOwnerEmail: Email;
  BackupOwnerEmail: Email | null;
  ReviewerEmail: Email | null;
  ApprovalRequired: boolean;
  WorkflowState: WorkflowState;
  /** true pro Planned/InProgress/Submitted/Returned – indexovaný sloupec pro delegaci. */
  IsOpen: boolean;
  StartedAt: ISODateTime | null;
  /** Poslední odeslání provedení (u kontrol bez schválení = okamžik dokončení). Rozhoduje o včasnosti. */
  SubmittedAt: ISODateTime | null;
  CompletedAt: ISODateTime | null;
  ApprovedAt: ISODateTime | null;
  /** Osoba, která kontrolu provedla (performer). */
  CompletedBy: Email | null;
  ApprovedBy: Email | null;
  Result: RunResult | null;
  ResultComment: string;
  ExceptionReason: string;
  ChecklistResults: ChecklistResult[];
  ReturnCount: number;
  ReturnComment: string;
  IsOneTimeOverride: boolean;
  OverrideNote: string;
  IsSuperseded: boolean;
  SupersededByVersionId: string | null;
  IsCorrection: boolean;
  ProtocolId: string | null;
  ProtocolUrl: string | null;
  CreatedAt: ISODateTime;
  ModifiedAt: ISODateTime;
  ModifiedBy: Email;
  RowVersion: number;
}

/** D. IC_Findings – zjištění a nápravná opatření. */
export interface Finding {
  FindingId: string;
  FindingCode: string;
  RunId: string;
  ControlId: string;
  ControlCode: string;
  Department: string;
  FindingDescription: string;
  CorrectiveAction: string;
  Severity: FindingSeverity;
  ResponsiblePerson: Email;
  DueDate: ISODate;
  Status: FindingStatus;
  ResolutionComment: string;
  ClosedAt: ISODateTime | null;
  CreatedAt: ISODateTime;
  CreatedBy: Email;
  ModifiedAt: ISODateTime;
  ModifiedBy: Email;
  RowVersion: number;
}

export type AuditEntityType =
  | 'Control'
  | 'ControlVersion'
  | 'ControlRun'
  | 'Finding'
  | 'Document'
  | 'Protocol'
  | 'Notification'
  | 'Settings'
  | 'RoleAssignment'
  | 'Lookup'
  | 'Report'
  | 'System';

/** E. IC_AuditLog – append-only auditní stopa. */
export interface AuditEntry {
  AuditId: string;
  EntityType: AuditEntityType;
  EntityId: string;
  /** Denormalizace pro filtr „vše ke kontrole X“. */
  ControlId: string | null;
  Action: string;
  FieldName: string | null;
  OldValue: string | null;
  NewValue: string | null;
  ChangedBy: Email;
  ChangedAt: ISODateTime;
  ChangeReason: string | null;
}

/** F. IC_Notifications – evidence oznámení. */
export interface NotificationRecord {
  NotificationId: string;
  RunId: string | null;
  ControlId: string | null;
  RecipientEmail: Email;
  NotificationType: NotificationType;
  Subject: string;
  Body: string;
  /** Proč systém oznámení vytvořil (pravidlo + hodnoty). */
  Reason: string;
  PlannedSendAt: ISODateTime;
  SentAt: ISODateTime | null;
  DeliveryStatus: DeliveryStatus;
  /** Unikátní klíč – zabraňuje duplicitnímu odeslání. */
  DeduplicationKey: string;
  RetryCount: number;
  ErrorMessage: string | null;
  DigestId: string | null;
  ReadAt: ISODateTime | null;
  CreatedAt: ISODateTime;
}

/** G. IC_RoleAssignments. */
export interface RoleAssignment {
  AssignmentId: string;
  UserEmail: Email;
  Role: RoleName;
  /** 'ALL' nebo kód útvaru. */
  DepartmentScope: string;
  IsActive: boolean;
}

/** H. IC_ReportSnapshots – archiv měsíčních reportů (neměnný snapshot metrik). */
export interface ReportSnapshot {
  ReportId: string;
  ReportingMonth: number;
  ReportingYear: number;
  /** 'ALL' nebo kód útvaru. */
  DepartmentScope: string;
  GeneratedAt: ISODateTime;
  GeneratedBy: Email;
  SnapshotData: MonthlyReportData;
  ContentHash: string;
  ReportFileUrl: string | null;
  DocumentId: string | null;
  ReportVersion: number;
}

/** I. IC_Settings – centrální konfigurace (v SharePointu řádky Key/Value). */
export interface AppSettings {
  reminderDaysBefore: number[];
  overdueDaysAfter: number[];
  escalationAfterDays: number;
  escalateToManager: boolean;
  escalateToCoordinator: boolean;
  approvalReminderDays: number;
  digestMode: 'Immediate' | 'DailyDigest';
  dueSoonDays: number;
  planningHorizonMonths: number;
  defaultDueRule: DueDateRule;
  defaultNonWorkingDayShift: ShiftRule;
  defaultInvalidDayPolicy: InvalidDayPolicy;
  simulatedFailureRate: number;
  maxRetries: number;
  coordinatorEmail: Email;
  adminEmail: Email;
  senderMailbox: string;
  /** Testovací datum – jen pro simulaci pravidel. V produkci vždy čas serveru / běhu flow. */
  testDate: ISODate | null;
  paReferenceMode: boolean;
  lastGenerationDate: ISODate | null;
  lastDeadlineCheckDate: ISODate | null;
}

/** Metadata dokumentu v knihovnách IC_ControlDocuments / IC_ManagementReports. */
export interface DocumentRecord {
  DocumentId: string;
  Library: DocumentLibrary;
  ControlId: string | null;
  RunId: string | null;
  ControlCode: string | null;
  RunCode: string | null;
  ReportId: string | null;
  /** Např. IC_ControlDocuments/CTRL-0001/RUN-2026-10/Evidence */
  FolderPath: string;
  DocumentType: DocumentType;
  EvidenceDefId: string | null;
  FileName: string;
  FileSize: number;
  MimeType: string;
  Version: number;
  UploadedAt: ISODateTime;
  UploadedBy: Email;
  IsRemoved: boolean;
  RemovedAt: ISODateTime | null;
  RemovedBy: Email | null;
  RemovedReason: string | null;
  ProtocolId: string | null;
}

/** K. IC_Protocols – neměnný snapshot obsahu protokolu. */
export interface ProtocolRecord {
  ProtocolId: string;
  RunId: string;
  ControlId: string;
  ProtocolVersion: number;
  Status: 'Valid' | 'Superseded';
  SnapshotData: ProtocolSnapshot;
  ContentHash: string;
  GeneratedAt: ISODateTime;
  GeneratedBy: Email;
  DocumentId: string | null;
  SupersededBy: string | null;
  CorrectionReason: string | null;
}

export type LookupType = 'Category' | 'Department' | 'Priority' | 'RiskLevel' | 'ResultType';

/** J. IC_Lookups – číselníky. */
export interface LookupItem {
  LookupId: string;
  LookupType: LookupType;
  Code: string;
  Label: string;
  SortOrder: number;
  IsActive: boolean;
  ManagerEmail: Email | null;
}

/** M. IC_Holidays – státní svátky (pro pracovní dny). */
export interface Holiday {
  HolidayId: string;
  HolidayDate: ISODate;
  Name: string;
}

/** L. IC_AutomationLog – technický stav automatizací. */
export interface AutomationLogEntry {
  LogId: string;
  FlowName: string;
  StartedAt: ISODateTime;
  FinishedAt: ISODateTime;
  Status: 'Succeeded' | 'Failed' | 'PartiallySucceeded';
  ItemsProcessed: number;
  ItemsCreated: number;
  ItemsSkipped: number;
  ErrorCount: number;
  Message: string;
  TriggeredBy: string;
}

/** Simulace adresáře Microsoft Entra ID / Office365Users. Není to IC seznam. */
export interface DirectoryUser {
  Email: Email;
  DisplayName: string;
  JobTitle: string;
  Department: string;
  ManagerEmail: Email | null;
  Initials: string;
}

// ---------------------------------------------------------------------------------------------
// Snapshoty
// ---------------------------------------------------------------------------------------------

export interface PersonRef {
  email: Email;
  name: string;
}

export interface ProtocolSnapshot {
  schema: 'control-hub/protocol@1';
  protocolId: string;
  protocolVersion: number;
  generatedAt: ISODateTime;
  generatedBy: PersonRef;
  control: {
    controlId: string;
    code: string;
    name: string;
    category: string;
    department: string;
    departmentName: string;
    riskLevel: RiskLevel;
  };
  version: {
    versionId: string;
    number: number;
    effectiveFrom: ISODate;
    description: string;
    objective: string;
    instructions: string;
    approvalRequired: boolean;
    recurrence: string;
  };
  run: {
    runId: string;
    runCode: string;
    occurrenceKey: string;
    periodFrom: ISODate;
    periodTo: ISODate;
    scheduledDate: ISODate;
    dueDate: ISODate;
    owner: PersonRef;
    performedBy: PersonRef | null;
    reviewer: PersonRef | null;
    approvedBy: PersonRef | null;
    startedAt: ISODateTime | null;
    submittedAt: ISODateTime | null;
    completedAt: ISODateTime | null;
    approvedAt: ISODateTime | null;
    result: RunResult | null;
    resultComment: string;
    exceptionReason: string;
    onTime: boolean;
    daysLate: number;
    returnCount: number;
  };
  checklist: Array<{ label: string; required: boolean; answer: ChecklistAnswer | null; comment: string }>;
  attachments: Array<{ fileName: string; fileSize: number; uploadedAt: ISODateTime; uploadedBy: string; evidence: string | null }>;
  findings: Array<{
    code: string;
    description: string;
    correctiveAction: string;
    severity: FindingSeverity;
    responsible: string;
    dueDate: ISODate;
    status: FindingStatus;
  }>;
  correction: { isCorrection: boolean; reason: string | null; supersedesProtocolId: string | null };
}

export interface ReportMetricsRow {
  key: string;
  label: string;
  planned: number;
  completed: number;
  onTime: number;
  late: number;
  notCompleted: number;
  overdueOpen: number;
  pendingApproval: number;
  cancelled: number;
  evaluable: number;
  onTimeRate: number | null;
  completionRate: number | null;
}

export interface MonthlyReportData {
  schema: 'control-hub/monthly-report@1';
  reportingYear: number;
  reportingMonth: number;
  periodFrom: ISODate;
  periodTo: ISODate;
  asOfDate: ISODate;
  generatedAt: ISODateTime;
  generatedBy: PersonRef;
  scope: string;
  scopeLabel: string;
  total: ReportMetricsRow;
  departments: ReportMetricsRow[];
  significantFindings: Array<{ code: string; controlCode: string; description: string; severity: FindingSeverity; status: FindingStatus; responsible: string; dueDate: ISODate }>;
  openFindings: Array<{ code: string; controlCode: string; description: string; severity: FindingSeverity; responsible: string; dueDate: ISODate; overdue: boolean }>;
  problemControls: Array<{ controlCode: string; name: string; department: string; late: number; notCompleted: number; planned: number }>;
  trend: Array<{ monthKey: string; label: string; planned: number; onTime: number; late: number; notCompleted: number; onTimeRate: number | null }>;
  definitions: Record<string, string>;
}
