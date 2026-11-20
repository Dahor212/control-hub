/**
 * Oprávnění podle rolí.
 *
 * DŮLEŽITÉ: v demo aplikaci se oprávnění kontrolují v UI i v servisní vrstvě. V produkčním
 * řešení je skutečným zabezpečením výhradně nastavení oprávnění SharePointu / Microsoft 365
 * (viz docs/POWERAPPS_MIGRATION.md, kap. Zabezpečení). Skrytí tlačítka v Power Apps není
 * bezpečnostní opatření – uživatel s právem Upravit na seznamu může položku změnit i jinak.
 */
import type { ControlRun, DirectoryUser, Email, RoleAssignment, RoleName } from './types';

export type Capability =
  | 'viewRegister'
  | 'viewAllRuns'
  | 'manageControls'
  | 'rescheduleRuns'
  | 'cancelRuns'
  | 'correctClosed'
  | 'executeRuns'
  | 'approveRuns'
  | 'manageFindings'
  | 'viewManagement'
  | 'viewReports'
  | 'generateReports'
  | 'viewNotificationLog'
  | 'simulateAutomation'
  | 'administer'
  | 'viewAudit'
  | 'exportData';

export const ROLE_CAPABILITIES: Record<RoleName, Capability[]> = {
  Administrator: [
    'viewRegister',
    'viewAllRuns',
    'manageControls',
    'rescheduleRuns',
    'cancelRuns',
    'correctClosed',
    'manageFindings',
    'viewManagement',
    'viewReports',
    'generateReports',
    'viewNotificationLog',
    'simulateAutomation',
    'administer',
    'viewAudit',
    'exportData',
  ],
  Coordinator: [
    'viewRegister',
    'viewAllRuns',
    'manageControls',
    'rescheduleRuns',
    'cancelRuns',
    'correctClosed',
    'manageFindings',
    'viewManagement',
    'viewReports',
    'generateReports',
    'viewNotificationLog',
    'simulateAutomation',
    'viewAudit',
    'exportData',
  ],
  ControlOwner: ['viewRegister', 'executeRuns', 'manageFindings'],
  Reviewer: ['viewRegister', 'approveRuns', 'manageFindings', 'executeRuns'],
  Manager: ['viewRegister', 'viewAllRuns', 'viewManagement', 'viewReports', 'generateReports', 'manageFindings', 'exportData', 'executeRuns'],
  Auditor: ['viewRegister', 'viewAllRuns', 'viewManagement', 'viewReports', 'viewAudit', 'viewNotificationLog', 'exportData'],
};

export interface Session {
  user: DirectoryUser;
  activeRole: RoleName;
  /** Aktivní přiřazení rolí uživatele. */
  assignments: RoleAssignment[];
}

export function can(session: Session, cap: Capability): boolean {
  return ROLE_CAPABILITIES[session.activeRole].includes(cap);
}

export function departmentScope(session: Session): string {
  const a = session.assignments.find((x) => x.Role === session.activeRole && x.IsActive);
  return a?.DepartmentScope ?? 'ALL';
}

export function isAssignee(run: Pick<ControlRun, 'AssignedOwnerEmail' | 'BackupOwnerEmail'>, email: Email): boolean {
  const e = email.toLowerCase();
  return run.AssignedOwnerEmail.toLowerCase() === e || (run.BackupOwnerEmail ?? '').toLowerCase() === e;
}

/** Které běhy uživatel v aktivní roli vidí (operativní rozsah). */
export function runVisibleTo(session: Session, run: ControlRun): boolean {
  const email = session.user.Email.toLowerCase();
  switch (session.activeRole) {
    case 'Administrator':
    case 'Coordinator':
    case 'Auditor':
      return true;
    case 'Manager': {
      const scope = departmentScope(session);
      return scope === 'ALL' || run.Department === scope || isAssignee(run, email);
    }
    case 'Reviewer':
      return (run.ReviewerEmail ?? '').toLowerCase() === email || isAssignee(run, email);
    case 'ControlOwner':
    default:
      return isAssignee(run, email);
  }
}

export interface Decision {
  allowed: boolean;
  reason?: string;
}

const deny = (reason: string): Decision => ({ allowed: false, reason });
const allow: Decision = { allowed: true };

/** Provádět běh smí jen přidělený vlastník nebo zástupce. */
export function canExecute(session: Session, run: ControlRun): Decision {
  if (session.activeRole === 'Auditor') return deny('Role Auditor má přístup pouze pro čtení.');
  if (!can(session, 'executeRuns')) return deny('Aktivní role neumožňuje provádět kontroly.');
  if (!isAssignee(run, session.user.Email)) return deny('Kontrolu může provést jen přidělený vlastník nebo jeho zástupce.');
  if (!['Planned', 'InProgress', 'Returned'].includes(run.WorkflowState))
    return deny('V aktuálním stavu běhu nelze provádět změny provedení.');
  return allow;
}

/** Princip čtyř očí: schvalovatel nesmí být osobou, která kontrolu provedla. */
export function canReview(session: Session, run: ControlRun): Decision {
  if (run.WorkflowState !== 'Submitted') return deny('Běh nečeká na schválení.');
  if (!can(session, 'approveRuns')) return deny('Schvalovat může pouze role Schvalovatel.');
  const email = session.user.Email.toLowerCase();
  if ((run.ReviewerEmail ?? '').toLowerCase() !== email) return deny('Nejste určeným schvalovatelem tohoto běhu.');
  if ((run.CompletedBy ?? '').toLowerCase() === email)
    return deny('Princip čtyř očí: osoba, která kontrolu provedla, ji nemůže schválit.');
  return allow;
}

export function canReschedule(session: Session, run: ControlRun): Decision {
  if (!can(session, 'rescheduleRuns')) return deny('Změny plánu smí provádět Koordinátor nebo Administrátor.');
  if (!['Planned', 'InProgress', 'Returned'].includes(run.WorkflowState))
    return deny('Dokončené, zrušené a ke schválení odeslané běhy nelze přeplánovat.');
  return allow;
}

export function canCancel(session: Session, run: ControlRun): Decision {
  if (!can(session, 'cancelRuns')) return deny('Rušit běhy smí Koordinátor nebo Administrátor.');
  if (run.WorkflowState === 'Completed' || run.WorkflowState === 'Cancelled') return deny('Uzavřený běh nelze zrušit.');
  return allow;
}

export function canCorrect(session: Session, run: ControlRun): Decision {
  if (!can(session, 'correctClosed')) return deny('Řízenou opravu smí zahájit Koordinátor nebo Administrátor.');
  if (run.WorkflowState !== 'Completed') return deny('Opravu lze zahájit jen u dokončeného běhu.');
  return allow;
}

/** Odebrat přílohu smí ten, kdo ji nahrál, nebo Koordinátor/Administrátor – a jen u neuzavřeného běhu. */
export function canRemoveDocument(session: Session, run: ControlRun | null, uploadedBy: Email): Decision {
  if (session.activeRole === 'Auditor') return deny('Role Auditor má přístup pouze pro čtení.');
  if (run && (run.WorkflowState === 'Completed' || run.WorkflowState === 'Submitted'))
    return deny('Přílohy odeslaného nebo uzavřeného běhu nelze odebrat.');
  if (can(session, 'manageControls')) return allow;
  if (uploadedBy.toLowerCase() === session.user.Email.toLowerCase()) return allow;
  return deny('Přílohu může odebrat jen autor nebo koordinátor.');
}
