/** Dokumenty (IC_ControlDocuments / IC_ManagementReports), protokoly a zjištění. */
import { toPragueDate } from '../domain/dates';
import { newGuid, nextFindingCode } from '../domain/ids';
import { buildProtocolSnapshot, createProtocolRecord } from '../domain/protocol';
import { can, canRemoveDocument, isAssignee } from '../domain/permissions';
import type { ControlRun, DocumentRecord, DocumentType, Finding, FindingSeverity, FindingStatus, MonthlyReportData, ProtocolRecord, ProtocolSnapshot } from '../domain/types';
import type { DataStore } from '../data/store';
import { PermissionError, ServiceError, audit, directoryMap, fieldChanges, logAutomation, nowIso, today, type ServiceContext } from './core';

// ---------------------------------------------------------------------------------------------
// PDF renderery (lze nahradit v testech)
// ---------------------------------------------------------------------------------------------

export interface PdfRenderers {
  protocol(snapshot: ProtocolSnapshot, hash: string): Promise<Blob>;
  report(data: MonthlyReportData, meta: { reportId: string; version: number; hash: string }): Promise<Blob>;
}

let renderers: PdfRenderers = {
  protocol: async (s, h) => (await import('../pdf/protocolPdf')).renderProtocolPdf(s, h),
  report: async (d, m) => (await import('../pdf/reportPdf')).renderReportPdf(d, m),
};

export function setPdfRenderers(r: PdfRenderers) {
  renderers = r;
}
export function pdfRenderers() {
  return renderers;
}

export const MAX_FILE_SIZE = 15 * 1024 * 1024;

export function runFolder(run: Pick<ControlRun, 'ControlCode' | 'RunCode'>, sub: 'Evidence' | 'Protocols') {
  return `IC_ControlDocuments/${run.ControlCode}/${run.RunCode}/${sub}`;
}

// ---------------------------------------------------------------------------------------------
// Přílohy
// ---------------------------------------------------------------------------------------------

export async function uploadRunDocument(
  ctx: ServiceContext,
  p: { run: ControlRun; file: File | Blob; fileName: string; evidenceDefId: string | null; documentType?: DocumentType },
): Promise<DocumentRecord> {
  const { store, session } = ctx;
  const run = store.runs.get(p.run.RunId) ?? p.run;
  if (session.activeRole === 'Auditor') throw new PermissionError('Role Auditor má přístup pouze pro čtení.');
  const allowed = isAssignee(run, session.user.Email) || can(session, 'manageControls');
  if (!allowed) throw new PermissionError('Přílohy k běhu může nahrát přidělený vlastník, zástupce nebo koordinátor.');
  if (run.WorkflowState === 'Completed' || run.WorkflowState === 'Cancelled' || run.WorkflowState === 'Submitted')
    throw new ServiceError('K odeslanému, dokončenému nebo zrušenému běhu nelze přidávat přílohy.');
  if (p.file.size > MAX_FILE_SIZE) throw new ServiceError(`Soubor je větší než ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
  if (p.file.size === 0) throw new ServiceError('Soubor je prázdný.');
  const folder = runFolder(run, 'Evidence');
  const sameName = store.documents.filter((d) => d.FolderPath === folder && d.FileName === p.fileName);
  const rec: DocumentRecord = {
    DocumentId: newGuid(),
    Library: 'IC_ControlDocuments',
    ControlId: run.ControlId,
    RunId: run.RunId,
    ControlCode: run.ControlCode,
    RunCode: run.RunCode,
    ReportId: null,
    FolderPath: folder,
    DocumentType: p.documentType ?? 'Evidence',
    EvidenceDefId: p.evidenceDefId,
    FileName: p.fileName,
    FileSize: p.file.size,
    MimeType: p.file.type || 'application/octet-stream',
    Version: sameName.length + 1,
    UploadedAt: nowIso(store),
    UploadedBy: session.user.Email,
    IsRemoved: false,
    RemovedAt: null,
    RemovedBy: null,
    RemovedReason: null,
    ProtocolId: null,
  };
  await store.files.put(rec.DocumentId, p.file, p.fileName);
  await store.documents.create(rec);
  await audit(ctx, {
    EntityType: 'Document',
    EntityId: rec.DocumentId,
    ControlId: run.ControlId,
    Action: 'Nahrání přílohy',
    FieldName: 'FileName',
    NewValue: `${folder}/${p.fileName} (v${rec.Version})`,
  });
  return rec;
}

export async function removeDocument(ctx: ServiceContext, documentId: string, reason: string) {
  const doc = ctx.store.documents.get(documentId);
  if (!doc) throw new ServiceError('Dokument nebyl nalezen.');
  if (doc.DocumentType === 'Protocol' || doc.DocumentType === 'Report') throw new ServiceError('Protokoly a reporty jsou archivní a nelze je odebrat.');
  const run = doc.RunId ? ctx.store.runs.get(doc.RunId) ?? null : null;
  const decision = canRemoveDocument(ctx.session, run, doc.UploadedBy);
  if (!decision.allowed) throw new PermissionError(decision.reason ?? 'Nelze odebrat.');
  if (!reason.trim()) throw new ServiceError('Uveďte důvod odebrání přílohy.');
  await ctx.store.documents.update(documentId, { IsRemoved: true, RemovedAt: nowIso(ctx.store), RemovedBy: ctx.session.user.Email, RemovedReason: reason.trim() });
  await audit(ctx, { EntityType: 'Document', EntityId: documentId, ControlId: doc.ControlId, Action: 'Odebrání přílohy (soft delete)', FieldName: 'IsRemoved', OldValue: false, NewValue: true, ChangeReason: reason });
}

export async function getDocumentBlob(store: DataStore, documentId: string): Promise<{ blob: Blob; name: string } | null> {
  const doc = store.documents.get(documentId);
  const file = await store.files.get(documentId);
  if (!doc || !file) return null;
  return { blob: file.blob, name: doc.FileName };
}

// ---------------------------------------------------------------------------------------------
// Protokoly (FLOW-04 OnControlCompleted – simulace)
// ---------------------------------------------------------------------------------------------

export async function storeProtocolPdf(ctx: ServiceContext, protocol: ProtocolRecord): Promise<DocumentRecord> {
  const store = ctx.store;
  const run = store.runs.get(protocol.RunId);
  if (!run) throw new ServiceError('Běh k protokolu nebyl nalezen.');
  const blob = await renderers.protocol(protocol.SnapshotData, protocol.ContentHash);
  const folder = runFolder(run, 'Protocols');
  const rec: DocumentRecord = {
    DocumentId: newGuid(),
    Library: 'IC_ControlDocuments',
    ControlId: run.ControlId,
    RunId: run.RunId,
    ControlCode: run.ControlCode,
    RunCode: run.RunCode,
    ReportId: null,
    FolderPath: folder,
    DocumentType: 'Protocol',
    EvidenceDefId: null,
    FileName: `${protocol.ProtocolId}.pdf`,
    FileSize: blob.size,
    MimeType: 'application/pdf',
    Version: protocol.ProtocolVersion,
    UploadedAt: nowIso(store),
    UploadedBy: protocol.GeneratedBy,
    IsRemoved: false,
    RemovedAt: null,
    RemovedBy: null,
    RemovedReason: null,
    ProtocolId: protocol.ProtocolId,
  };
  await store.files.put(rec.DocumentId, blob, rec.FileName);
  await store.documents.create(rec);
  await store.protocols.update(protocol.ProtocolId, { DocumentId: rec.DocumentId });
  if (run.ProtocolId === protocol.ProtocolId)
    await store.runs.update(run.RunId, { ProtocolUrl: `${folder}/${rec.FileName}` });
  return rec;
}

/** Vytvoří neměnný snapshot + PDF protokolu po uzavření běhu. */
export async function createProtocolForRun(ctx: ServiceContext, runId: string, correctionReason: string | null = null): Promise<ProtocolRecord> {
  const store = ctx.store;
  const run = store.runs.get(runId);
  if (!run || run.WorkflowState !== 'Completed') throw new ServiceError('Protokol lze vytvořit pouze pro dokončený běh.');
  const control = store.controls.get(run.ControlId);
  const version = store.versions.get(run.VersionId);
  if (!control || !version) throw new ServiceError('Chybí definice kontroly nebo verze.');
  const existing = store.protocols.filter((p) => p.RunId === runId).sort((a, b) => b.ProtocolVersion - a.ProtocolVersion);
  const previous = existing.find((p) => p.Status === 'Valid') ?? null;
  const started = new Date().toISOString();
  const snapshot = buildProtocolSnapshot({
    control,
    version,
    run,
    documents: store.documents.all() as DocumentRecord[],
    findings: store.findings.all() as Finding[],
    departments: store.lookups.all() as never,
    directory: directoryMap(store),
    generatedAt: nowIso(store),
    generatedBy: ctx.session.user.Email,
    protocolVersion: (existing[0]?.ProtocolVersion ?? 0) + 1,
    correctionReason,
    supersedesProtocolId: previous?.ProtocolId ?? null,
  });
  const record = await createProtocolRecord(snapshot, run);
  await store.protocols.create(record);
  if (previous) await store.protocols.update(previous.ProtocolId, { Status: 'Superseded', SupersededBy: record.ProtocolId });
  await store.runs.update(run.RunId, { ProtocolId: record.ProtocolId, IsCorrection: false });
  await audit(ctx, {
    EntityType: 'Protocol',
    EntityId: record.ProtocolId,
    ControlId: run.ControlId,
    Action: previous ? 'Vytvoření opravené verze protokolu' : 'Vytvoření protokolu',
    FieldName: 'ContentHash',
    NewValue: record.ContentHash,
    ChangeReason: correctionReason,
  });
  let pdfError: string | null = null;
  try {
    await storeProtocolPdf(ctx, record);
  } catch (e) {
    pdfError = e instanceof Error ? e.message : String(e);
  }
  await logAutomation(store, {
    FlowName: 'FLOW-04 OnControlCompleted',
    StartedAt: started,
    Status: pdfError ? 'PartiallySucceeded' : 'Succeeded',
    ItemsProcessed: 1,
    ItemsCreated: pdfError ? 1 : 2,
    ItemsSkipped: 0,
    ErrorCount: pdfError ? 1 : 0,
    Message: pdfError ? `Snapshot uložen, PDF se nepodařilo vytvořit: ${pdfError}` : `Protokol ${record.ProtocolId} vytvořen a uložen.`,
    TriggeredBy: ctx.session.user.Email,
  });
  return store.protocols.get(record.ProtocolId) ?? record;
}

/** U historických (demo) protokolů se PDF vykreslí ze zmrazeného snapshotu při prvním vyžádání. */
export async function ensureProtocolPdf(ctx: ServiceContext, protocolId: string): Promise<DocumentRecord> {
  const p = ctx.store.protocols.get(protocolId);
  if (!p) throw new ServiceError('Protokol nebyl nalezen.');
  if (p.DocumentId) {
    const doc = ctx.store.documents.get(p.DocumentId);
    if (doc) return doc;
  }
  return storeProtocolPdf(ctx, p);
}

// ---------------------------------------------------------------------------------------------
// Zjištění a nápravná opatření
// ---------------------------------------------------------------------------------------------

export interface FindingInput {
  description: string;
  correctiveAction: string;
  severity: FindingSeverity;
  responsible: string;
  dueDate: string;
}

export function validateFinding(f: FindingInput, todayDate: string): string[] {
  const e: string[] = [];
  if (f.description.trim().length < 5) e.push('Popište zjištění (alespoň 5 znaků).');
  if (!f.responsible) e.push('Vyberte odpovědnou osobu.');
  if (!f.dueDate) e.push('Zadejte termín nápravy.');
  else if (f.dueDate < todayDate) e.push('Termín nápravy nesmí být v minulosti.');
  return e;
}

export async function createFinding(ctx: ServiceContext, runId: string, input: FindingInput): Promise<Finding> {
  const { store, session } = ctx;
  const run = store.runs.get(runId);
  if (!run) throw new ServiceError('Běh nebyl nalezen.');
  if (session.activeRole === 'Auditor') throw new PermissionError('Role Auditor má přístup pouze pro čtení.');
  const allowed =
    isAssignee(run, session.user.Email) || can(session, 'manageControls') || (run.ReviewerEmail === session.user.Email && can(session, 'approveRuns'));
  if (!allowed) throw new PermissionError('Zjištění může založit provádějící, schvalovatel nebo koordinátor.');
  const errors = validateFinding(input, today(store));
  if (errors.length) throw new ServiceError('Zjištění nelze uložit.', errors);
  const now = nowIso(store);
  const year = Number(toPragueDate(now).slice(0, 4));
  const f: Finding = {
    FindingId: newGuid(),
    FindingCode: nextFindingCode(store.findings.all().map((x) => x.FindingCode), year),
    RunId: run.RunId,
    ControlId: run.ControlId,
    ControlCode: run.ControlCode,
    Department: run.Department,
    FindingDescription: input.description.trim(),
    CorrectiveAction: input.correctiveAction.trim(),
    Severity: input.severity,
    ResponsiblePerson: input.responsible,
    DueDate: input.dueDate,
    Status: 'Open',
    ResolutionComment: '',
    ClosedAt: null,
    CreatedAt: now,
    CreatedBy: session.user.Email,
    ModifiedAt: now,
    ModifiedBy: session.user.Email,
    RowVersion: 1,
  };
  await store.findings.create(f);
  await audit(ctx, { EntityType: 'Finding', EntityId: f.FindingId, ControlId: f.ControlId, Action: 'Založení zjištění', FieldName: 'Severity', NewValue: f.Severity });
  return f;
}

export async function updateFinding(
  ctx: ServiceContext,
  findingId: string,
  expectedRowVersion: number,
  patch: Partial<Pick<Finding, 'Status' | 'ResolutionComment' | 'DueDate' | 'ResponsiblePerson' | 'CorrectiveAction' | 'Severity' | 'FindingDescription'>>,
  reason: string,
) {
  const { store, session } = ctx;
  const f = store.findings.get(findingId);
  if (!f) throw new ServiceError('Zjištění nebylo nalezeno.');
  if (session.activeRole === 'Auditor') throw new PermissionError('Role Auditor má přístup pouze pro čtení.');
  const allowed = f.ResponsiblePerson === session.user.Email || can(session, 'manageControls') || session.activeRole === 'Manager';
  if (!allowed) throw new PermissionError('Zjištění může upravit odpovědná osoba, manažer nebo koordinátor.');
  if (f.Status === 'Closed' && !can(session, 'manageControls')) throw new PermissionError('Uzavřené zjištění může znovu otevřít jen koordinátor.');
  const next: Partial<Finding> = { ...patch, ModifiedAt: nowIso(store), ModifiedBy: session.user.Email };
  const status: FindingStatus = patch.Status ?? f.Status;
  if (status === 'Closed') {
    if (!(patch.ResolutionComment ?? f.ResolutionComment).trim()) throw new ServiceError('Pro uzavření zjištění vyplňte popis vyřešení.');
    if (f.Status !== 'Closed') next.ClosedAt = nowIso(store);
  } else next.ClosedAt = null;
  if ((patch.DueDate && patch.DueDate !== f.DueDate) || (patch.ResponsiblePerson && patch.ResponsiblePerson !== f.ResponsiblePerson)) {
    if (!reason.trim()) throw new ServiceError('Při změně termínu nebo odpovědné osoby uveďte důvod.');
  }
  await store.findings.update(findingId, next, { expectedRowVersion });
  await store.audit.appendMany(
    fieldChanges(ctx, { EntityType: 'Finding', EntityId: findingId, ControlId: f.ControlId, Action: 'Úprava zjištění', ChangeReason: reason }, f, next, [
      'Status',
      'ResolutionComment',
      'DueDate',
      'ResponsiblePerson',
      'CorrectiveAction',
      'Severity',
      'FindingDescription',
    ]),
  );
}
