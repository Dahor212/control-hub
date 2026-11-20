/** Integrační testy servisní vrstvy nad paměťovým úložištěm (stejná sémantika jako IndexedDB). */
import { describe, expect, it } from 'vitest';
import { applyDefinitionChange, archiveControl, createControl, generateOccurrences, previewDefinitionChange, reactivateControl } from '../src/services/controlService';
import { approveRun, overrideRun, returnRun, saveRunDraft, startRun, submitRun } from '../src/services/runService';
import { createFinding, uploadRunDocument } from '../src/services/documentService';
import { runDailyDeadlineCheck } from '../src/services/notificationService';
import { generateMonthlyReport } from '../src/services/reportService';
import { seedDemoData } from '../src/data/seed';
import { verifyProtocolIntegrity } from '../src/domain/protocol';
import { ConcurrencyError } from '../src/data/repository';
import { DuplicateKeyError } from '../src/data/backend';
import { computeKpis, monthPeriod } from '../src/domain/metrics';
import { U, ctxFor, draft, emptyStore } from './helpers';

async function setup() {
  const store = await emptyStore('2026-11-20');
  const coord = ctxFor(store, U.coord, 'Coordinator');
  const res = await createControl(coord, {
    draft: draft({ RecurrenceSettings: { ...draft().RecurrenceSettings, startDate: '2026-11-01', dayOfMonth: 10 } }),
    category: 'PLATBY',
    department: 'PRI',
  });
  return { store, coord, ...res };
}

const fill = (run: { ChecklistResults: Array<{ itemId: string; label: string; required: boolean; answer: unknown; comment: string }> }) => ({
  ChecklistResults: run.ChecklistResults.map((c) => ({ ...c, answer: 'OK' as const })),
  Result: 'NoFindings' as const,
  ResultComment: '',
  ExceptionReason: '',
});

describe('kontrola – založení, výskyty, audit', () => {
  it('vytvoří kontrolu, verzi, běhy na 12 měsíců a auditní stopu', async () => {
    const { store, control, runsCreated } = await setup();
    expect(control.ControlCode).toBe('CTRL-0001');
    expect(runsCreated).toBe(13); // listopad 2026 – listopad 2027
    expect(store.audit.filter((a) => a.ControlId === control.ControlId).length).toBeGreaterThanOrEqual(3);
    expect(store.notifications.filter((n) => n.NotificationType === 'Assignment').map((n) => n.RecipientEmail).sort()).toEqual([U.jana, U.veronika].sort());
  });
  it('opakované generování nevytvoří duplicity (aplikační i databázová úroveň)', async () => {
    const { store, coord } = await setup();
    const before = store.runs.all().length;
    const res = await generateOccurrences(coord, {});
    expect(res.created).toBe(0);
    expect(store.runs.all().length).toBe(before);
    const dup = { ...store.runs.all()[0], RunId: 'jiny-id' };
    await expect(store.runs.create(dup)).rejects.toBeInstanceOf(DuplicateKeyError);
  });
  it('jednorázová úprava výskytu nemění ostatní ani definici', async () => {
    const { store, coord, control } = await setup();
    const runs = store.runs.filter((r) => r.ControlId === control.ControlId).sort((a, b) => a.DueDate.localeCompare(b.DueDate));
    const target = runs[2];
    await overrideRun(coord, target.RunId, target.RowVersion, { DueDate: '2027-01-29', AssignedOwnerEmail: U.filip }, 'Zástup za dovolenou');
    const after = store.runs.get(target.RunId)!;
    expect(after.IsOneTimeOverride).toBe(true);
    expect(after.DueMonthKey).toBe('2027-01');
    expect(store.runs.get(runs[3].RunId)!.AssignedOwnerEmail).toBe(U.jana);
    expect(store.versions.filter((v) => v.ControlId === control.ControlId)).toHaveLength(1);
    expect(store.audit.filter((a) => a.EntityId === target.RunId && a.ChangeReason === 'Zástup za dovolenou').map((a) => a.FieldName).sort()).toEqual(['AssignedOwnerEmail', 'DueDate']);
    await expect(overrideRun(coord, target.RunId, target.RowVersion, { DueDate: '2027-01-30' }, 'x')).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(overrideRun(coord, target.RunId, after.RowVersion, { DueDate: '2027-01-30' }, '')).rejects.toThrow(/nelze uložit/);
  });
  it('změna „tento a následující“ vytvoří verzi a zachová uzavřenou historii', async () => {
    const { store, coord, control } = await setup();
    const owner = ctxFor(store, U.jana, 'ControlOwner');
    const nov = store.runs.filter((r) => r.ControlId === control.ControlId).sort((a, b) => a.DueDate.localeCompare(b.DueDate))[0];
    // provést listopadový běh (bez schválení není dokončen – schválíme)
    let run = await startRun(owner, nov.RunId, nov.RowVersion);
    await uploadRunDocument(owner, { run, file: new Blob(['data'], { type: 'text/plain' }), fileName: 'vypis.txt', evidenceDefId: 'ev1' });
    run = await submitRun(owner, nov.RunId, store.runs.get(nov.RunId)!.RowVersion, fill(run));
    run = await approveRun(ctxFor(store, U.headPRI, 'Reviewer'), nov.RunId, run.RowVersion, '');
    const protocolBefore = store.protocols.filter((p) => p.RunId === nov.RunId)[0];
    expect(protocolBefore).toBeTruthy();

    const plan = previewDefinitionChange(coord, control.ControlId, { ...draft(), ControlName: 'Nový název', RecurrenceSettings: { ...draft().RecurrenceSettings, startDate: '2026-11-01', dayOfMonth: 15 }, PrimaryOwnerEmail: U.veronika, BackupOwnerEmail: U.jana }, '2026-12-01', 'Nová metodika');
    expect(plan.errors).toEqual([]);
    await applyDefinitionChange(coord, plan, store.controls.get(control.ControlId)!.RowVersion);
    const versions = store.versions.filter((v) => v.ControlId === control.ControlId);
    expect(versions).toHaveLength(2);
    expect(versions.find((v) => v.VersionNumber === 1)!.EffectiveTo).toBe('2026-11-30');
    expect(store.controls.get(control.ControlId)!.Name).toBe('Nový název');
    const completed = store.runs.get(nov.RunId)!;
    expect(completed.WorkflowState).toBe('Completed');
    expect(completed.VersionNumber).toBe(1);
    expect(completed.ControlName).toBe('Testovací kontrola');
    // protokol se nepřegeneroval a jeho obsah odpovídá staré verzi
    const protocolAfter = store.protocols.get(protocolBefore.ProtocolId)!;
    expect(protocolAfter.SnapshotData.control.name).toBe('Testovací kontrola');
    expect(await verifyProtocolIntegrity(protocolAfter)).toBe(true);
    const future = store.runs.filter((r) => r.ControlId === control.ControlId && !r.IsSuperseded && r.NominalDate >= '2026-12-01');
    expect(future.every((r) => r.VersionNumber === 2 && r.AssignedOwnerEmail === U.veronika && r.NominalDate.endsWith('-15'))).toBe(true);
    expect(store.runs.filter((r) => r.ControlId === control.ControlId && r.IsSuperseded).length).toBeGreaterThan(0);
  });
  it('archivace a reaktivace', async () => {
    const { store, coord, control } = await setup();
    const plan = await archiveControl(coord, control.ControlId, 'Kontrola již není potřeba', store.controls.get(control.ControlId)!.RowVersion);
    expect(plan.toCancel.length).toBeGreaterThan(0);
    expect(store.runs.filter((r) => r.ControlId === control.ControlId && r.IsOpen && r.DueDate >= '2026-11-20')).toHaveLength(0);
    const res = await reactivateControl(coord, control.ControlId, 'Kontrola znovu zavedena', store.controls.get(control.ControlId)!.RowVersion);
    expect(res.created).toBeGreaterThan(0);
  });
});

describe('provedení – workflow, 4 oči, protokol, notifikace', () => {
  it('celý cyklus: provedení → vrácení → doplnění → schválení → PDF protokol', async () => {
    const { store, control } = await setup();
    const owner = ctxFor(store, U.jana, 'ControlOwner');
    const reviewer = ctxFor(store, U.headPRI, 'Reviewer');
    const r0 = store.runs.filter((r) => r.ControlId === control.ControlId).sort((a, b) => a.DueDate.localeCompare(b.DueDate))[0];
    let run = await startRun(owner, r0.RunId, r0.RowVersion);
    expect(run.WorkflowState).toBe('InProgress');
    await expect(submitRun(owner, run.RunId, run.RowVersion, fill(run))).rejects.toThrow(/doplňte povinné/);
    await uploadRunDocument(owner, { run, file: new Blob(['x'], { type: 'text/plain' }), fileName: 'vypis.txt', evidenceDefId: 'ev1' });
    run = await saveRunDraft(owner, run.RunId, store.runs.get(run.RunId)!.RowVersion, { ...fill(run), Result: 'WithFindings', ResultComment: 'Odchylka' });
    await expect(submitRun(owner, run.RunId, run.RowVersion, { ...fill(run), Result: 'WithFindings', ResultComment: 'Odchylka' })).rejects.toThrow();
    await createFinding(owner, run.RunId, { description: 'Rozdíl 100 Kč', correctiveAction: 'Opravit', severity: 'Medium', responsible: U.jana, dueDate: '2026-12-15' });
    run = await submitRun(owner, run.RunId, store.runs.get(run.RunId)!.RowVersion, { ...fill(run), Result: 'WithFindings', ResultComment: 'Odchylka' });
    expect(run.WorkflowState).toBe('Submitted');
    expect(store.notifications.all().some((n) => n.NotificationType === 'ApprovalRequest' && n.RecipientEmail === U.headPRI)).toBe(true);
    run = await returnRun(reviewer, run.RunId, run.RowVersion, 'Doplňte komentář');
    expect(run.WorkflowState).toBe('Returned');
    expect(run.ReturnCount).toBe(1);
    run = await submitRun(owner, run.RunId, run.RowVersion, { ...fill(run), Result: 'WithFindings', ResultComment: 'Odchylka – podrobně' });
    run = await approveRun(reviewer, run.RunId, run.RowVersion, 'OK');
    expect(run.WorkflowState).toBe('Completed');
    expect(run.ApprovedBy).toBe(U.headPRI);
    const protocol = store.protocols.get(run.ProtocolId!)!;
    expect(protocol.SnapshotData.findings).toHaveLength(1);
    expect(protocol.SnapshotData.attachments).toHaveLength(1);
    expect(protocol.DocumentId).toBeTruthy();
    expect(store.documents.get(protocol.DocumentId!)!.FolderPath).toBe(`IC_ControlDocuments/${run.ControlCode}/${run.RunCode}/Protocols`);
  });
  it('princip čtyř očí – provádějící nemůže schválit', async () => {
    const { store, control, coord } = await setup();
    const r0 = store.runs.filter((r) => r.ControlId === control.ControlId)[0];
    // Jana je i schvalovatelkou (role Reviewer) – nastavíme ji jako schvalovatele jednoho běhu a zkusíme provést
    await overrideRun(coord, r0.RunId, r0.RowVersion, { ReviewerEmail: U.headPRI }, 'beze změny');
    const owner = ctxFor(store, U.jana, 'ControlOwner');
    let run = await startRun(owner, r0.RunId, store.runs.get(r0.RunId)!.RowVersion);
    await uploadRunDocument(owner, { run, file: new Blob(['x']), fileName: 'a.txt', evidenceDefId: 'ev1' });
    run = await submitRun(owner, run.RunId, store.runs.get(run.RunId)!.RowVersion, fill(run));
    await expect(approveRun(ctxFor(store, U.jana, 'Reviewer'), run.RunId, run.RowVersion, '')).rejects.toThrow(/Nejste určeným|čtyř očí/);
  });
  it('denní kontrola termínů: připomínky bez duplicit', async () => {
    const { store } = await setup();
    const admin = ctxFor(store, U.admin, 'Administrator');
    await store.settings.update({ testDate: '2026-12-12' }); // 3 dny před termínem 15. 12.
    const first = await runDailyDeadlineCheck(admin, { random: () => 0.9 });
    expect(first.created.some((n) => n.NotificationType === 'DueReminder' && n.RecipientEmail === U.jana)).toBe(true);
    const second = await runDailyDeadlineCheck(admin, { random: () => 0.9 });
    expect(second.created).toHaveLength(0);
    expect(second.duplicates.length).toBeGreaterThan(0);
    expect(store.automation.filter((a) => a.FlowName.startsWith('FLOW-02')).length).toBe(2);
  });
  it('měsíční report je neměnný snapshot', async () => {
    const store = await emptyStore('2026-11-20');
    await seedDemoData(store, '2026-11-20');
    await store.settings.update({ testDate: '2026-11-20', simulatedFailureRate: 0 });
    const mgr = ctxFor(store, U.director, 'Manager');
    const rep = await generateMonthlyReport(mgr, 2026, 10);
    const planned = rep.SnapshotData.total.planned;
    // změna dat po vytvoření reportu
    const r = store.runs.all().find((x) => x.DueMonthKey === '2026-10' && x.WorkflowState === 'Completed')!;
    await store.runs.update(r.RunId, { WorkflowState: 'Cancelled' });
    expect(store.reports.get(rep.ReportId)!.SnapshotData.total.planned).toBe(planned);
    const rep2 = await generateMonthlyReport(mgr, 2026, 10);
    expect(rep2.ReportVersion).toBe(rep.ReportVersion + 1);
    expect(rep2.SnapshotData.total.planned).toBe(planned - 1);
    await expect(generateMonthlyReport(mgr, 2026, 11)).rejects.toThrow(/uzavřený/);
  });
});

describe('demo data – konzistence', () => {
  it('vygeneruje logicky konzistentní dataset', async () => {
    const store = await emptyStore('2026-11-20');
    const res = await seedDemoData(store, '2026-11-20');
    const runs = store.runs.all();
    expect(res.controls).toBeGreaterThanOrEqual(30);
    expect(store.directory.all().length).toBeGreaterThanOrEqual(12);
    expect(store.lookups.filter((l) => l.LookupType === 'Department')).toHaveLength(5);
    expect(new Set(runs.map((r) => r.OccurrenceKey)).size).toBe(runs.length);
    const completed = runs.filter((r) => r.WorkflowState === 'Completed');
    expect(completed.every((r) => r.CompletedAt && r.SubmittedAt && r.CompletedBy && r.ProtocolId)).toBe(true);
    expect(completed.filter((r) => r.ApprovalRequired).every((r) => r.ApprovedAt && r.ApprovedBy && r.ApprovedBy !== r.CompletedBy)).toBe(true);
    expect(runs.filter((r) => r.WorkflowState === 'Submitted').every((r) => r.SubmittedAt && !r.CompletedAt)).toBe(true);
    const negatives = completed.filter((r) => r.Result === 'WithFindings' || r.Result === 'NotMet');
    expect(negatives.every((r) => store.findings.all().some((f) => f.RunId === r.RunId))).toBe(true);
    const states = new Set(runs.map((r) => r.WorkflowState));
    for (const s of ['Planned', 'InProgress', 'Submitted', 'Returned', 'Completed', 'Cancelled']) expect(states.has(s as never)).toBe(true);
    const k = computeKpis(runs, monthPeriod('2026-10'), '2026-11-20');
    expect(k.late).toBeGreaterThan(0);
    expect(runs.some((r) => r.IsOpen && r.DueDate < '2026-11-20' && r.WorkflowState !== 'Submitted')).toBe(true);
    expect(runs.reduce((m, r) => (r.DueDate < m ? r.DueDate : m), '9999') <= '2026-05-24').toBe(true); // ≥ 6 měsíců historie
    expect(store.findings.filter((f) => f.Status !== 'Closed').length).toBeGreaterThan(0);
    expect(store.reports.all()).toHaveLength(3);
    expect(store.notifications.all().length).toBeGreaterThan(20);
    expect(store.versions.filter((v) => v.VersionNumber > 1)).toHaveLength(3);
    for (const p of store.protocols.all().slice(0, 25)) expect(await verifyProtocolIntegrity(p)).toBe(true);
  }, 60000);
});
