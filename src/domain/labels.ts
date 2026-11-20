/** České popisky výčtových hodnot. Jediný zdroj pro UI, CSV exporty i PDF. */
import type {
  ChecklistAnswer,
  DeliveryStatus,
  DocumentType,
  FindingSeverity,
  FindingStatus,
  MonthlyMode,
  NotificationType,
  PeriodMode,
  Priority,
  RecurrenceType,
  RiskLevel,
  RoleName,
  RunResult,
  ShiftRule,
  WorkflowState,
  InvalidDayPolicy,
  DueUnit,
} from './types';

export const ROLE_LABELS: Record<RoleName, string> = {
  Administrator: 'Administrátor',
  Coordinator: 'Koordinátor',
  ControlOwner: 'Vlastník kontroly',
  Reviewer: 'Schvalovatel',
  Manager: 'Manažer',
  Auditor: 'Auditor',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  Low: 'Nízká',
  Medium: 'Střední',
  High: 'Vysoká',
  Critical: 'Kritická',
};
export const RISK_WEIGHT: Record<RiskLevel, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };

export const PRIORITY_LABELS: Record<Priority, string> = { Low: 'Nízká', Normal: 'Běžná', High: 'Vysoká' };

export const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  OneTime: 'Jednorázově',
  Daily: 'Denně',
  Workday: 'Každý pracovní den',
  Weekly: 'Týdně',
  Monthly: 'Měsíčně',
  Quarterly: 'Čtvrtletně',
  SemiAnnual: 'Pololetně',
  Annual: 'Ročně',
};

export const MONTHLY_MODE_LABELS: Record<MonthlyMode, string> = {
  DayOfMonth: 'Konkrétní den v měsíci',
  LastDayOfMonth: 'Poslední den v měsíci',
  NthWorkday: 'N-tý pracovní den v měsíci',
};

export const SHIFT_LABELS: Record<ShiftRule, string> = {
  None: 'Neposouvat',
  PreviousWorkday: 'Na předchozí pracovní den',
  NextWorkday: 'Na následující pracovní den',
};

export const INVALID_DAY_LABELS: Record<InvalidDayPolicy, string> = {
  LastDayOfMonth: 'Použít poslední den měsíce',
  Skip: 'Výskyt v daném měsíci vynechat',
};

export const PERIOD_MODE_LABELS: Record<PeriodMode, string> = {
  Current: 'Aktuální období (cyklus výskytu)',
  Previous: 'Předchozí období (např. kontrola za minulý měsíc)',
};

export const DUE_UNIT_LABELS: Record<DueUnit, string> = {
  CalendarDays: 'kalendářních dní',
  Workdays: 'pracovních dní',
};

export const WORKFLOW_LABELS: Record<WorkflowState, string> = {
  Planned: 'Naplánováno',
  InProgress: 'Rozpracováno',
  Submitted: 'Ke schválení',
  Returned: 'Vráceno k doplnění',
  Completed: 'Dokončeno',
  Cancelled: 'Zrušeno',
};

export const RESULT_LABELS: Record<RunResult, string> = {
  NoFindings: 'Bez zjištění',
  WithFindings: 'Se zjištěním',
  PartiallyMet: 'Částečně splněno',
  NotMet: 'Nesplněno',
  NotAssessable: 'Nelze vyhodnotit',
};

export const ANSWER_LABELS: Record<ChecklistAnswer, string> = {
  OK: 'V pořádku',
  NOK: 'Nedostatek',
  NA: 'Neaplikovatelné',
};

export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  Low: 'Nízká',
  Medium: 'Střední',
  High: 'Vysoká',
  Critical: 'Kritická',
};

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  Open: 'Otevřeno',
  InProgress: 'V řešení',
  Closed: 'Uzavřeno',
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  Assignment: 'Nově přidělená kontrola',
  AssignmentChange: 'Změna přidělení / termínu',
  DueReminder: 'Blížící se termín',
  Overdue: 'Kontrola po termínu',
  Escalation: 'Eskalace',
  ApprovalRequest: 'Žádost o schválení',
  ApprovalPending: 'Čekající schválení',
  Returned: 'Vráceno k doplnění',
  Approved: 'Schváleno',
  DailyDigest: 'Denní souhrn',
  AutomationFailure: 'Chyba automatizace',
};

export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  Pending: 'Čeká na odeslání',
  Sent: 'Odesláno',
  Failed: 'Chyba odeslání',
  Digested: 'Zahrnuto v souhrnu',
  Cancelled: 'Zrušeno',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  Evidence: 'Důkaz / podklad',
  Protocol: 'Protokol',
  Methodology: 'Metodika',
  Report: 'Report',
  Other: 'Ostatní',
};

export const WEEKDAY_SHORT = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
export const WEEKDAY_LONG = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];
export const MONTH_NAMES = [
  'leden',
  'únor',
  'březen',
  'duben',
  'květen',
  'červen',
  'červenec',
  'srpen',
  'září',
  'říjen',
  'listopad',
  'prosinec',
];
export const MONTH_NAMES_GENITIVE = [
  'ledna',
  'února',
  'března',
  'dubna',
  'května',
  'června',
  'července',
  'srpna',
  'září',
  'října',
  'listopadu',
  'prosince',
];

export function monthLabel(monthKeyValue: string): string {
  const [y, m] = monthKeyValue.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export const MONTH_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];

export function monthShortLabel(monthKeyValue: string): string {
  const [y, m] = monthKeyValue.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`;
}
