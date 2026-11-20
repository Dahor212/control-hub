/**
 * Workflow provedení kontroly – přechody stavů a validace.
 *
 *   Planned ──start──▶ InProgress ──submit──▶ Submitted ──approve──▶ Completed
 *                          │   ▲                  │
 *                          │   └────return────────┘ (Returned → znovu submit)
 *                          └──submit (bez schválení)──────────────▶ Completed
 *   Planned / InProgress / Returned ──cancel──▶ Cancelled
 *   Completed ──reopenForCorrection (řízená oprava)──▶ InProgress (IsCorrection = true)
 */
import type { ControlRun, ControlVersion, DocumentRecord, Finding, RunResult, WorkflowState } from './types';

export type WorkflowAction = 'start' | 'save' | 'submit' | 'approve' | 'return' | 'cancel' | 'reopenForCorrection';

const TRANSITIONS: Record<WorkflowAction, { from: WorkflowState[]; to: WorkflowState | null }> = {
  start: { from: ['Planned'], to: 'InProgress' },
  save: { from: ['InProgress', 'Returned'], to: null },
  submit: { from: ['InProgress', 'Returned'], to: null }, // Submitted nebo Completed podle ApprovalRequired
  approve: { from: ['Submitted'], to: 'Completed' },
  return: { from: ['Submitted'], to: 'Returned' },
  cancel: { from: ['Planned', 'InProgress', 'Returned'], to: 'Cancelled' },
  reopenForCorrection: { from: ['Completed'], to: 'InProgress' },
};

export function canTransition(state: WorkflowState, action: WorkflowAction): boolean {
  return TRANSITIONS[action].from.includes(state);
}

export function targetState(run: Pick<ControlRun, 'WorkflowState' | 'ApprovalRequired'>, action: WorkflowAction): WorkflowState {
  if (action === 'submit') return run.ApprovalRequired ? 'Submitted' : 'Completed';
  if (action === 'save') return run.WorkflowState;
  return TRANSITIONS[action].to as WorkflowState;
}

export const NEGATIVE_RESULTS: RunResult[] = ['WithFindings', 'PartiallyMet', 'NotMet'];
export const FINDING_REQUIRED_RESULTS: RunResult[] = ['WithFindings', 'NotMet'];

export interface SubmissionCheck {
  errors: string[];
  warnings: string[];
  missingEvidence: string[];
}

/** Validace před odesláním / dokončením. */
export function validateSubmission(
  run: ControlRun,
  version: ControlVersion,
  documents: DocumentRecord[],
  findings: Finding[],
): SubmissionCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  const unanswered = run.ChecklistResults.filter((c) => c.required && !c.answer);
  if (unanswered.length) errors.push(`Vyplňte všechny povinné kontrolní kroky (chybí ${unanswered.length}).`);
  const nokWithoutComment = run.ChecklistResults.filter((c) => c.answer === 'NOK' && !c.comment.trim());
  if (nokWithoutComment.length) errors.push('U každého kroku s nedostatkem doplňte komentář.');

  if (!run.Result) errors.push('Zvolte celkový výsledek kontroly.');
  if (run.Result && run.Result !== 'NoFindings' && !run.ResultComment.trim())
    errors.push('U jiného výsledku než „Bez zjištění“ je komentář povinný.');
  if (run.Result === 'NotAssessable' && !run.ExceptionReason.trim())
    errors.push('U výsledku „Nelze vyhodnotit“ uveďte důvod výjimky.');
  if (run.Result === 'NoFindings' && run.ChecklistResults.some((c) => c.answer === 'NOK'))
    errors.push('Výsledek „Bez zjištění“ nelze zvolit, pokud některý krok obsahuje nedostatek.');

  const runFindings = findings.filter((f) => f.RunId === run.RunId);
  if (run.Result && FINDING_REQUIRED_RESULTS.includes(run.Result) && runFindings.length === 0)
    errors.push('Při výsledku se zjištěním / nesplněno založte alespoň jedno zjištění (nápravné opatření).');
  if (run.Result === 'PartiallyMet' && runFindings.length === 0)
    warnings.push('Zvažte založení nápravného opatření pro částečně splněnou kontrolu.');

  const activeDocs = documents.filter((d) => d.RunId === run.RunId && !d.IsRemoved && d.DocumentType === 'Evidence');
  const missingEvidence = version.RequiredEvidence.filter(
    (e) => e.mandatory && !activeDocs.some((d) => d.EvidenceDefId === e.id),
  ).map((e) => e.name);
  if (missingEvidence.length) errors.push(`Chybí povinné přílohy: ${missingEvidence.join(', ')}.`);

  return { errors, warnings, missingEvidence };
}
