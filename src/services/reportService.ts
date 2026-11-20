/** FLOW-05 GenerateMonthlyManagementReport – archivní snapshot + PDF v IC_ManagementReports. */
import { canonicalJson, newGuid, sha256Hex } from '../domain/ids';
import { can } from '../domain/permissions';
import { buildMonthlyReport, closedMonths } from '../domain/reports';
import { personRef } from '../domain/protocol';
import type { DocumentRecord, ReportSnapshot } from '../domain/types';
import { PermissionError, ServiceError, audit, directoryMap, logAutomation, nowIso, today, type ServiceContext } from './core';
import { pdfRenderers } from './documentService';

export async function generateMonthlyReport(ctx: ServiceContext, year: number, month: number, scope = 'ALL'): Promise<ReportSnapshot> {
  const store = ctx.store;
  if (!can(ctx.session, 'generateReports')) throw new PermissionError('Reporty smí generovat Manažer, Koordinátor nebo Administrátor.');
  const mk = `${year}-${String(month).padStart(2, '0')}`;
  const day = today(store);
  if (!closedMonths(day, 36).includes(mk)) throw new ServiceError('Report lze vytvořit pouze za uzavřený (uplynulý) měsíc.');
  const started = new Date().toISOString();
  const now = nowIso(store);
  const generatedBy = personRef(ctx.session.user.Email, directoryMap(store))!;
  const data = buildMonthlyReport({
    year,
    month,
    scope,
    runs: store.runs.all() as never,
    findings: store.findings.all() as never,
    departments: store.lookups.all() as never,
    directory: directoryMap(store),
    asOfDate: day,
    generatedAt: now,
    generatedBy,
  });
  const hash = await sha256Hex(canonicalJson(data));
  const previous = store.reports.filter((r) => r.ReportingYear === year && r.ReportingMonth === month && r.DepartmentScope === scope);
  const version = previous.reduce((m, r) => Math.max(m, r.ReportVersion), 0) + 1;
  const reportId = `RPT-${mk}-${scope}-V${version}`;
  const report: ReportSnapshot = {
    ReportId: reportId,
    ReportingMonth: month,
    ReportingYear: year,
    DepartmentScope: scope,
    GeneratedAt: now,
    GeneratedBy: ctx.session.user.Email,
    SnapshotData: data,
    ContentHash: hash,
    ReportFileUrl: null,
    DocumentId: null,
    ReportVersion: version,
  };
  await store.reports.create(report);
  let docId: string | null = null;
  try {
    docId = (await storeReportPdf(ctx, report)).DocumentId;
  } catch (e) {
    await logAutomation(store, {
      FlowName: 'FLOW-05 GenerateMonthlyManagementReport',
      StartedAt: started,
      Status: 'PartiallySucceeded',
      ItemsProcessed: 1,
      ItemsCreated: 1,
      ItemsSkipped: 0,
      ErrorCount: 1,
      Message: `Snapshot ${reportId} uložen, PDF selhalo: ${e instanceof Error ? e.message : String(e)}`,
      TriggeredBy: ctx.session.user.Email,
    });
  }
  await audit(ctx, { EntityType: 'Report', EntityId: reportId, ControlId: null, Action: 'Vytvoření měsíčního reportu', FieldName: 'ContentHash', NewValue: hash });
  if (docId)
    await logAutomation(store, {
      FlowName: 'FLOW-05 GenerateMonthlyManagementReport',
      StartedAt: started,
      Status: 'Succeeded',
      ItemsProcessed: data.total.planned,
      ItemsCreated: 2,
      ItemsSkipped: 0,
      ErrorCount: 0,
      Message: `Report ${reportId} (verze ${version}) uložen do IC_ManagementReports.`,
      TriggeredBy: ctx.session.user.Email,
    });
  return store.reports.get(reportId) ?? report;
}

export async function storeReportPdf(ctx: ServiceContext, report: ReportSnapshot): Promise<DocumentRecord> {
  const store = ctx.store;
  const blob = await pdfRenderers().report(report.SnapshotData, { reportId: report.ReportId, version: report.ReportVersion, hash: report.ContentHash });
  const folder = `IC_ManagementReports/${report.ReportingYear}/${report.ReportingYear}-${String(report.ReportingMonth).padStart(2, '0')}`;
  const doc: DocumentRecord = {
    DocumentId: newGuid(),
    Library: 'IC_ManagementReports',
    ControlId: null,
    RunId: null,
    ControlCode: null,
    RunCode: null,
    ReportId: report.ReportId,
    FolderPath: folder,
    DocumentType: 'Report',
    EvidenceDefId: null,
    FileName: `${report.ReportId}.pdf`,
    FileSize: blob.size,
    MimeType: 'application/pdf',
    Version: report.ReportVersion,
    UploadedAt: nowIso(store),
    UploadedBy: report.GeneratedBy,
    IsRemoved: false,
    RemovedAt: null,
    RemovedBy: null,
    RemovedReason: null,
    ProtocolId: null,
  };
  await store.files.put(doc.DocumentId, blob, doc.FileName);
  await store.documents.create(doc);
  await store.reports.update(report.ReportId, { DocumentId: doc.DocumentId, ReportFileUrl: `${folder}/${doc.FileName}` });
  return doc;
}

/** Archivní report bez PDF (demo) – PDF se vykreslí z uloženého snapshotu, ne z aktuálních dat. */
export async function ensureReportPdf(ctx: ServiceContext, reportId: string): Promise<DocumentRecord> {
  const r = ctx.store.reports.get(reportId);
  if (!r) throw new ServiceError('Report nebyl nalezen.');
  if (r.DocumentId) {
    const d = ctx.store.documents.get(r.DocumentId);
    if (d) return d;
  }
  return storeReportPdf(ctx, r);
}
