/**
 * Snapshot kontrolního protokolu.
 *
 * Při uzavření běhu (Completed) se sestaví neměnný obsahový snapshot. PDF se vykresluje
 * výhradně ze snapshotu – změna metodiky nebo osob proto historické protokoly nemění.
 * Snapshot je zmrazen (deepFreeze) a opatřen SHA-256 hashem kanonického JSON.
 */
import { canonicalJson, deepFreeze, protocolIdFor, sha256Hex } from './ids';
import { describeRecurrence } from './recurrence';
import { computeTiming } from './status';
import type {
  Control,
  ControlRun,
  ControlVersion,
  DirectoryUser,
  DocumentRecord,
  Email,
  Finding,
  ISODateTime,
  LookupItem,
  PersonRef,
  ProtocolRecord,
  ProtocolSnapshot,
} from './types';

export function personRef(email: Email | null | undefined, directory: Map<string, DirectoryUser>): PersonRef | null {
  if (!email) return null;
  return { email, name: directory.get(email)?.DisplayName ?? email };
}

export function buildProtocolSnapshot(p: {
  control: Control;
  version: ControlVersion;
  run: ControlRun;
  documents: DocumentRecord[];
  findings: Finding[];
  /** Číselníky (útvary a kategorie) – do snapshotu se ukládají názvy, ne kódy. */
  departments: LookupItem[];
  directory: Map<string, DirectoryUser>;
  generatedAt: ISODateTime;
  generatedBy: Email;
  protocolVersion: number;
  correctionReason: string | null;
  supersedesProtocolId: string | null;
}): ProtocolSnapshot {
  const { control, version, run, directory } = p;
  const timing = computeTiming(run, run.DueDate);
  const evidenceName = (id: string | null) => version.RequiredEvidence.find((e) => e.id === id)?.name ?? null;
  const ref = (e: Email | null) => personRef(e, directory);
  return {
    schema: 'control-hub/protocol@1',
    protocolId: protocolIdFor(control.ControlCode, run.RunCode, p.protocolVersion),
    protocolVersion: p.protocolVersion,
    generatedAt: p.generatedAt,
    generatedBy: ref(p.generatedBy) ?? { email: p.generatedBy, name: p.generatedBy },
    control: {
      controlId: control.ControlId,
      code: control.ControlCode,
      name: version.ControlName,
      category: p.departments.find((l) => l.LookupType === 'Category' && l.Code === run.Category)?.Label ?? run.Category,
      department: run.Department,
      departmentName: p.departments.find((d) => d.LookupType === 'Department' && d.Code === run.Department)?.Label ?? run.Department,
      riskLevel: version.RiskLevel,
    },
    version: {
      versionId: version.VersionId,
      number: version.VersionNumber,
      effectiveFrom: version.EffectiveFrom,
      description: version.Description,
      objective: version.ControlObjective,
      instructions: version.Instructions,
      approvalRequired: run.ApprovalRequired,
      recurrence: describeRecurrence(version),
    },
    run: {
      runId: run.RunId,
      runCode: run.RunCode,
      occurrenceKey: run.OccurrenceKey,
      periodFrom: run.PeriodFrom,
      periodTo: run.PeriodTo,
      scheduledDate: run.ScheduledDate,
      dueDate: run.DueDate,
      owner: ref(run.AssignedOwnerEmail) as PersonRef,
      performedBy: ref(run.CompletedBy),
      reviewer: ref(run.ReviewerEmail),
      approvedBy: ref(run.ApprovedBy),
      startedAt: run.StartedAt,
      submittedAt: run.SubmittedAt,
      completedAt: run.CompletedAt,
      approvedAt: run.ApprovedAt,
      result: run.Result,
      resultComment: run.ResultComment,
      exceptionReason: run.ExceptionReason,
      onTime: !timing.isLate,
      daysLate: timing.daysLate,
      returnCount: run.ReturnCount,
    },
    checklist: run.ChecklistResults.map((c) => ({ label: c.label, required: c.required, answer: c.answer, comment: c.comment })),
    attachments: p.documents
      .filter((d) => d.RunId === run.RunId && !d.IsRemoved && d.DocumentType !== 'Protocol')
      .map((d) => ({
        fileName: d.FileName,
        fileSize: d.FileSize,
        uploadedAt: d.UploadedAt,
        uploadedBy: directory.get(d.UploadedBy)?.DisplayName ?? d.UploadedBy,
        evidence: evidenceName(d.EvidenceDefId),
      })),
    findings: p.findings
      .filter((f) => f.RunId === run.RunId)
      .map((f) => ({
        code: f.FindingCode,
        description: f.FindingDescription,
        correctiveAction: f.CorrectiveAction,
        severity: f.Severity,
        responsible: directory.get(f.ResponsiblePerson)?.DisplayName ?? f.ResponsiblePerson,
        dueDate: f.DueDate,
        status: f.Status,
      })),
    correction: {
      isCorrection: !!p.correctionReason,
      reason: p.correctionReason,
      supersedesProtocolId: p.supersedesProtocolId,
    },
  };
}

export async function createProtocolRecord(snapshot: ProtocolSnapshot, run: ControlRun): Promise<ProtocolRecord> {
  const hash = await sha256Hex(canonicalJson(snapshot));
  return {
    ProtocolId: snapshot.protocolId,
    RunId: run.RunId,
    ControlId: run.ControlId,
    ProtocolVersion: snapshot.protocolVersion,
    Status: 'Valid',
    SnapshotData: deepFreeze(snapshot),
    ContentHash: hash,
    GeneratedAt: snapshot.generatedAt,
    GeneratedBy: snapshot.generatedBy.email,
    DocumentId: null,
    SupersededBy: null,
    CorrectionReason: snapshot.correction.reason,
  };
}

export async function verifyProtocolIntegrity(record: ProtocolRecord): Promise<boolean> {
  return (await sha256Hex(canonicalJson(record.SnapshotData))) === record.ContentHash;
}
