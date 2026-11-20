/**
 * Odvozené (dopočítávané) stavy běhu kontroly.
 *
 * WorkflowState se ukládá. Časové stavy („Po termínu“, „Blíží se termín“, „Dokončeno pozdě“)
 * se nikdy neukládají – vždy se počítají z termínů, skutečných časových značek a dnešního data.
 */
import { diffDays, toPragueDate } from './dates';
import type { ControlRun, ISODate, WorkflowState } from './types';

export type TimingStatus =
  | 'NotDue' // naplánováno, okno pro provedení ještě nezačalo
  | 'Open' // k provedení
  | 'DueSoon' // blíží se termín
  | 'DueToday' // termín dnes
  | 'Overdue' // po termínu, nedokončeno
  | 'AwaitingApproval' // odesláno, čeká na schválení
  | 'OnTime' // dokončeno včas
  | 'Late' // dokončeno po termínu
  | 'Cancelled';

export const TIMING_LABELS: Record<TimingStatus, string> = {
  NotDue: 'Naplánováno',
  Open: 'K provedení',
  DueSoon: 'Blíží se termín',
  DueToday: 'Termín dnes',
  Overdue: 'Po termínu',
  AwaitingApproval: 'Čeká na schválení',
  OnTime: 'Dokončeno včas',
  Late: 'Dokončeno pozdě',
  Cancelled: 'Zrušeno',
};

/** Stavy, ve kterých je na tahu provádějící (vlastník kontroly). */
export const OWNER_PENDING_STATES: WorkflowState[] = ['Planned', 'InProgress', 'Returned'];

export function isOwnerPending(state: WorkflowState): boolean {
  return OWNER_PENDING_STATES.includes(state);
}

/** Otevřený = nedokončený a nezrušený (včetně čekajících na schválení). */
export function isOpenState(state: WorkflowState): boolean {
  return state !== 'Completed' && state !== 'Cancelled';
}

/** Datum provedení pro posouzení včasnosti: poslední odeslání, jinak dokončení. */
export function performedDate(run: Pick<ControlRun, 'SubmittedAt' | 'CompletedAt'>): ISODate | null {
  if (run.SubmittedAt) return toPragueDate(run.SubmittedAt);
  if (run.CompletedAt) return toPragueDate(run.CompletedAt);
  return null;
}

export interface TimingInfo {
  status: TimingStatus;
  /** Kladné = počet dní po termínu (u otevřených k dnešku, u dokončených k datu provedení). */
  daysLate: number;
  /** Počet dní do termínu (záporné = po termínu). */
  daysToDue: number;
  isLate: boolean;
}

export function computeTiming(
  run: Pick<ControlRun, 'WorkflowState' | 'ScheduledDate' | 'DueDate' | 'SubmittedAt' | 'CompletedAt'>,
  today: ISODate,
  dueSoonDays = 3,
): TimingInfo {
  const daysToDue = diffDays(today, run.DueDate);
  switch (run.WorkflowState) {
    case 'Cancelled':
      return { status: 'Cancelled', daysLate: 0, daysToDue, isLate: false };
    case 'Completed': {
      const p = performedDate(run) ?? run.DueDate;
      const late = Math.max(0, diffDays(run.DueDate, p));
      return { status: late > 0 ? 'Late' : 'OnTime', daysLate: late, daysToDue, isLate: late > 0 };
    }
    case 'Submitted': {
      const p = performedDate(run) ?? today;
      const late = Math.max(0, diffDays(run.DueDate, p));
      return { status: 'AwaitingApproval', daysLate: late, daysToDue, isLate: late > 0 };
    }
    default: {
      if (daysToDue < 0) return { status: 'Overdue', daysLate: -daysToDue, daysToDue, isLate: true };
      if (daysToDue === 0) return { status: 'DueToday', daysLate: 0, daysToDue, isLate: false };
      if (run.ScheduledDate > today && run.WorkflowState === 'Planned')
        return { status: daysToDue <= dueSoonDays ? 'DueSoon' : 'NotDue', daysLate: 0, daysToDue, isLate: false };
      if (daysToDue <= dueSoonDays) return { status: 'DueSoon', daysLate: 0, daysToDue, isLate: false };
      return { status: 'Open', daysLate: 0, daysToDue, isLate: false };
    }
  }
}

/**
 * Stav běhu k historickému datu (rekonstrukce z časových značek).
 * Používá se pro měsíční report „k datu vytvoření“ a pro demo historii upozornění.
 */
export function stateAsOf(run: ControlRun, asOf: ISODate): WorkflowState {
  if (run.WorkflowState === 'Cancelled') return 'Cancelled';
  const d = (v: string | null) => (v ? toPragueDate(v) : null);
  const completed = d(run.CompletedAt);
  if (completed && completed <= asOf) return 'Completed';
  const submitted = d(run.SubmittedAt);
  if (submitted && submitted <= asOf) return run.ApprovalRequired ? 'Submitted' : 'Completed';
  const started = d(run.StartedAt);
  if (started && started <= asOf) return 'InProgress';
  return 'Planned';
}

export function runAsOf(run: ControlRun, asOf: ISODate): ControlRun {
  const state = stateAsOf(run, asOf);
  if (state === run.WorkflowState) return run;
  const d = (v: string | null) => (v && toPragueDate(v) <= asOf ? v : null);
  return {
    ...run,
    WorkflowState: state,
    IsOpen: state !== 'Completed' && state !== 'Cancelled',
    CompletedAt: d(run.CompletedAt),
    ApprovedAt: d(run.ApprovedAt),
    SubmittedAt: d(run.SubmittedAt),
    StartedAt: d(run.StartedAt),
  };
}
