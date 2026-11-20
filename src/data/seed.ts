/**
 * Generátor syntetických demo dat. Deterministický (seed PRNG) a vztažený k „dnešku“,
 * takže dashboardy jsou zajímavé při každém otevření. Všechna data jsou smyšlená.
 *
 * Konzistence: dokončený běh má vždy CompletedAt, odeslaný SubmittedAt, schválený ApprovedAt
 * a ApprovedBy ≠ CompletedBy; zjištění existují u negativních výsledků; protokol (snapshot)
 * existuje u každého dokončeného běhu.
 */
import {
  addDays,
  createWorkCalendar,
  czechPublicHolidays,
  diffDays,
  isWorkday,
  makeISODate,
  monthIndex,
  monthIndexToYM,
  parseISODate,
  pragueLocalToIso,
  toPragueDate,
} from '../domain/dates';
import { mulberry32, newGuid, protocolIdFor, nextFindingCode } from '../domain/ids';
import { buildProtocolSnapshot, createProtocolRecord } from '../domain/protocol';
import { evaluateDeadlineNotifications } from '../domain/notifications';
import { buildMonthlyReport } from '../domain/reports';
import { horizonEnd, planGeneration } from '../domain/versioning';
import { checklistTemplate } from '../domain/runFactory';
import { runAsOf } from '../domain/status';
import { canonicalJson, sha256Hex } from '../domain/ids';
import { buildDigest } from '../domain/notifications';
import type {
  AuditEntry,
  AutomationLogEntry,
  Control,
  ControlRun,
  ControlVersion,
  DocumentRecord,
  Finding,
  Holiday,
  NotificationRecord,
  ProtocolRecord,
  ReportSnapshot,
  RoleAssignment,
  RunResult,
  ISODate,
} from '../domain/types';
import { DIRECTORY, FINDING_TEXTS, LOOKUPS, ROLE_SEED, SEED_CONTROLS, SEED_OWNER_LATE_PROB, U, type SeedControl } from './seedCatalog';
import { DEFAULT_SETTINGS, type DataStore } from './store';

export const SEED_VERSION = 4;

interface Ctx {
  rnd: () => number;
  today: ISODate;
  historyStart: ISODate;
  audit: AuditEntry[];
}

const pick = <T,>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)];
const between = (rnd: () => number, a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const at = (date: ISODate, h: number, m: number) => pragueLocalToIso(date, h, m, 0);

function auditEntry(e: Omit<AuditEntry, 'AuditId'>): AuditEntry {
  return { AuditId: newGuid(), ...e };
}

function buildVersion(sc: SeedControl, ctx: Ctx, controlId: string, number: number, effectiveFrom: ISODate, createdAt: string, overrides: Partial<ControlVersion> = {}): ControlVersion {
  const startDate = sc.start === 'H' ? ctx.historyStart : sc.start.startsWith('+') ? addDays(ctx.today, Number(sc.start.slice(1))) : sc.start;
  const v: ControlVersion = {
    VersionId: newGuid(),
    ControlId: controlId,
    ControlCode: sc.code,
    VersionNumber: number,
    EffectiveFrom: effectiveFrom ?? startDate,
    EffectiveTo: null,
    ControlName: sc.name,
    Description: sc.desc,
    ControlObjective: sc.objective,
    Instructions: sc.steps.map((s, i) => `${i + 1}. ${s}.`).join('\n') + '\nVýsledek a odchylky zaznamenejte v aplikaci, podklady přiložte jako přílohu.',
    RiskLevel: sc.risk,
    Priority: sc.prio,
    PrimaryOwnerEmail: sc.owner,
    BackupOwnerEmail: sc.backup,
    ReviewerEmail: sc.reviewer,
    RecurrenceType: sc.type,
    RecurrenceInterval: sc.interval ?? 1,
    RecurrenceSettings: {
      startDate,
      endDate: null,
      daysOfWeek: sc.days ?? [],
      monthlyMode: sc.mode ?? 'DayOfMonth',
      dayOfMonth: sc.dom ?? (sc.mode ? 1 : parseISODate(startDate).d),
      workdayNumber: sc.nth ?? 1,
      invalidDayPolicy: 'LastDayOfMonth',
      nonWorkingDayShift: sc.type === 'Daily' ? 'None' : 'NextWorkday',
      periodMode: sc.period ?? 'Current',
    },
    DueDateRule: { offset: sc.due[0], unit: sc.due[1], shift: 'NextWorkday' },
    RequiredEvidence: sc.evidence.map(([name, mandatory], i) => ({ id: `ev${i + 1}`, name, mandatory, description: mandatory ? 'Povinná příloha' : 'Doporučená příloha' })),
    ChecklistDefinition: sc.steps.map((s, i) => ({ id: `s${i + 1}`, label: s, required: true, guidance: '' })),
    ApprovalRequired: sc.approval,
    ReminderPolicy: sc.remindersBefore
      ? { useGlobal: false, daysBefore: sc.remindersBefore, overdueDays: [1, 3], escalationAfterDays: 3 }
      : { useGlobal: true, daysBefore: [7, 3, 1, 0], overdueDays: [1, 3, 7], escalationAfterDays: 5 },
    CreatedAt: createdAt,
    CreatedBy: U.coord,
    ChangeReason: number === 1 ? 'Založení kontroly' : '',
    ...overrides,
  };
  if (v.RecurrenceSettings.startDate < v.EffectiveFrom && number === 1) v.EffectiveFrom = v.RecurrenceSettings.startDate;
  return v;
}

function evidenceContent(run: ControlRun, name: string, rnd: () => number): string {
  const rows = Array.from({ length: 6 }, (_, i) => `${i + 1};${run.ControlCode};${run.RunCode};${(rnd() * 100000).toFixed(2).replace('.', ',')};${rnd() > 0.1 ? 'OK' : 'ODCHYLKA'}`);
  return `﻿# ${name}\n# SYNTETICKÁ DEMO DATA – nejde o skutečné údaje\nPořadí;Kontrola;Běh;Částka;Stav\n${rows.join('\n')}\n`;
}

export async function seedDemoData(store: DataStore, today: ISODate, seed = 20261120): Promise<{ controls: number; runs: number }> {
  const rnd = mulberry32(seed);
  const hs = monthIndexToYM(monthIndex(today) - 6);
  const historyStart = makeISODate(hs.y, hs.m, 1); // 6 celých měsíců historie + aktuální měsíc
  const ctx: Ctx = { rnd, today, historyStart, audit: [] };
  const cal = createWorkCalendar();
  const horizon = horizonEnd(today, DEFAULT_SETTINGS.planningHorizonMonths);
  const dir = new Map(DIRECTORY.map((u) => [u.Email, u]));

  const controls: Control[] = [];
  const versions: ControlVersion[] = [];
  let runs: ControlRun[] = [];

  // ---------------------------------------------------------------- katalog + verze + běhy
  for (const sc of SEED_CONTROLS) {
    const controlId = newGuid();
    const createdDay = addDays(historyStart, -between(rnd, 8, 25));
    const createdAt = at(createdDay, 9, between(rnd, 0, 50));
    const v1 = buildVersion(sc, ctx, controlId, 1, sc.start === 'H' ? historyStart : '', createdAt);
    if (!v1.EffectiveFrom) v1.EffectiveFrom = v1.RecurrenceSettings.startDate;
    const vs: ControlVersion[] = [v1];

    // Historie verzí
    const changeAt = (d: ISODate) => at(addDays(d, -10), 14, 20);
    if (sc.code === 'CTRL-0002') {
      const eff = makeISODate(parseISODate(addDays(today, -80)).y, parseISODate(addDays(today, -80)).m, 1);
      v1.EffectiveTo = addDays(eff, -1);
      vs.push(
        buildVersion(sc, ctx, controlId, 2, eff, changeAt(eff), {
          DueDateRule: { offset: 5, unit: 'Workdays', shift: 'NextWorkday' },
          ChecklistDefinition: [...v1.ChecklistDefinition, { id: 's5', label: 'Ověřit shodu identifikace zaměstnavatele (IČO) s registrem', required: true, guidance: 'Nový krok od verze 2' }],
          ChangeReason: 'Aktualizace metodiky: prodloužení lhůty na 5 pracovních dní a nový kontrolní krok ověření IČO.',
          CreatedBy: U.coord,
        }),
      );
    }
    if (sc.code === 'CTRL-0010') {
      const eff = makeISODate(parseISODate(addDays(today, -110)).y, parseISODate(addDays(today, -110)).m, 1);
      v1.EffectiveTo = addDays(eff, -1);
      vs.push(
        buildVersion(sc, ctx, controlId, 2, eff, changeAt(eff), {
          PrimaryOwnerEmail: U.filip,
          BackupOwnerEmail: U.jakub,
          ChangeReason: 'Reorganizace týmu plateb – vypořádání s depozitářem přebírá Filip Zeman.',
        }),
      );
    }
    if (sc.code === 'CTRL-0021') {
      const eff = makeISODate(parseISODate(addDays(today, -50)).y, parseISODate(addDays(today, -50)).m, 1);
      v1.EffectiveTo = addDays(eff, -1);
      vs.push(
        buildVersion(sc, ctx, controlId, 2, eff, changeAt(eff), {
          RiskLevel: 'Critical',
          ApprovalRequired: true,
          ChangeReason: 'Zvýšení rizikovosti po zjištění z interního auditu – zavedeno schvalování (4 oči).',
        }),
      );
    }
    const current = vs[vs.length - 1];
    const archived = !!sc.archivedAt;
    const control: Control = {
      ControlId: controlId,
      ControlCode: sc.code,
      Name: sc.name,
      Category: sc.cat,
      Department: sc.dept,
      IsActive: !archived,
      CreatedAt: createdAt,
      CreatedBy: U.coord,
      ArchivedAt: archived ? at(sc.archivedAt!, 10, 15) : null,
      ArchiveReason: archived ? 'Faxový kanál byl zrušen, žádosti se přijímají jen elektronicky.' : null,
      CurrentVersionId: current.VersionId,
      CurrentVersionNumber: current.VersionNumber,
      OwnerEmail: current.PrimaryOwnerEmail,
      RiskLevel: current.RiskLevel,
      RecurrenceType: current.RecurrenceType,
      ModifiedAt: archived ? at(sc.archivedAt!, 10, 15) : current.CreatedAt,
      ModifiedBy: U.coord,
      RowVersion: vs.length + (archived ? 1 : 0),
    };
    controls.push(control);
    versions.push(...vs);

    ctx.audit.push(
      auditEntry({ EntityType: 'Control', EntityId: controlId, ControlId: controlId, Action: 'Založení kontroly', FieldName: 'ControlCode', OldValue: null, NewValue: sc.code, ChangedBy: U.coord, ChangedAt: createdAt, ChangeReason: null }),
      auditEntry({ EntityType: 'ControlVersion', EntityId: v1.VersionId, ControlId: controlId, Action: 'Vytvoření verze v1', FieldName: 'EffectiveFrom', OldValue: null, NewValue: v1.EffectiveFrom, ChangedBy: U.coord, ChangedAt: createdAt, ChangeReason: null }),
    );
    for (const v of vs.slice(1)) {
      ctx.audit.push(auditEntry({ EntityType: 'ControlVersion', EntityId: v.VersionId, ControlId: controlId, Action: `Nová verze v${v.VersionNumber}`, FieldName: 'EffectiveFrom', OldValue: vs[v.VersionNumber - 2].EffectiveFrom, NewValue: v.EffectiveFrom, ChangedBy: U.coord, ChangedAt: v.CreatedAt, ChangeReason: v.ChangeReason }));
      const prev = vs[v.VersionNumber - 2];
      for (const f of ['PrimaryOwnerEmail', 'RiskLevel', 'ApprovalRequired', 'DueDateRule'] as const) {
        const a = JSON.stringify(prev[f]);
        const b = JSON.stringify(v[f]);
        if (a !== b)
          ctx.audit.push(auditEntry({ EntityType: 'ControlVersion', EntityId: v.VersionId, ControlId: controlId, Action: `Nová verze v${v.VersionNumber}`, FieldName: f, OldValue: typeof prev[f] === 'object' ? a : String(prev[f]), NewValue: typeof v[f] === 'object' ? b : String(v[f]), ChangedBy: U.coord, ChangedAt: v.CreatedAt, ChangeReason: v.ChangeReason }));
      }
    }
    if (archived)
      ctx.audit.push(auditEntry({ EntityType: 'Control', EntityId: controlId, ControlId: controlId, Action: 'Archivace kontroly', FieldName: 'IsActive', OldValue: 'Ano', NewValue: 'Ne', ChangedBy: U.coord, ChangedAt: control.ArchivedAt!, ChangeReason: control.ArchiveReason }));

    const gen = planGeneration({
      control: { ...control, IsActive: true },
      versions: vs,
      runs: [],
      from: historyStart,
      to: archived ? sc.archivedAt! : horizon,
      now: createdAt,
      actor: 'flow-01@system',
      cal,
    });
    for (const r of gen.creates) r.CreatedAt = r.ModifiedAt = createdAt;
    runs.push(...gen.creates);
  }

  // ---------------------------------------------------------------- simulace provedení
  const findings: Finding[] = [];
  const documents: DocumentRecord[] = [];
  const files: Array<{ id: string; blob: Blob; name: string }> = [];
  const versionById = new Map(versions.map((v) => [v.VersionId, v]));
  const findingCodes: string[] = [];

  const makeFinding = (run: ControlRun, createdAt: string, severity: Finding['Severity']) => {
    const [desc, action] = pick(rnd, FINDING_TEXTS);
    const createdDay = toPragueDate(createdAt);
    const due = addDays(createdDay, between(rnd, 14, 35));
    let status: Finding['Status'] = 'Open';
    let closedAt: string | null = null;
    let resolution = '';
    if (due < today && rnd() < 0.78) {
      status = 'Closed';
      const closeDay = addDays(createdDay, between(rnd, 5, Math.max(6, diffDays(createdDay, today) - 1)));
      closedAt = at(closeDay < today ? closeDay : addDays(today, -1), 15, between(rnd, 0, 59));
      resolution = 'Náprava provedena a ověřena vedoucím útvaru.';
    } else if (rnd() < 0.5) status = 'InProgress';
    const code = nextFindingCode(findingCodes, parseISODate(createdDay).y);
    findingCodes.push(code);
    const f: Finding = {
      FindingId: newGuid(),
      FindingCode: code,
      RunId: run.RunId,
      ControlId: run.ControlId,
      ControlCode: run.ControlCode,
      Department: run.Department,
      FindingDescription: desc,
      CorrectiveAction: action,
      Severity: severity,
      ResponsiblePerson: run.AssignedOwnerEmail,
      DueDate: due,
      Status: status,
      ResolutionComment: resolution,
      ClosedAt: closedAt,
      CreatedAt: createdAt,
      CreatedBy: run.AssignedOwnerEmail,
      ModifiedAt: closedAt ?? createdAt,
      ModifiedBy: run.AssignedOwnerEmail,
      RowVersion: status === 'Closed' ? 3 : status === 'InProgress' ? 2 : 1,
    };
    findings.push(f);
    ctx.audit.push(auditEntry({ EntityType: 'Finding', EntityId: f.FindingId, ControlId: f.ControlId, Action: 'Založení zjištění', FieldName: 'Severity', OldValue: null, NewValue: severity, ChangedBy: f.CreatedBy, ChangedAt: createdAt, ChangeReason: null }));
    if (closedAt)
      ctx.audit.push(auditEntry({ EntityType: 'Finding', EntityId: f.FindingId, ControlId: f.ControlId, Action: 'Úprava zjištění', FieldName: 'Status', OldValue: 'Open', NewValue: 'Closed', ChangedBy: f.ResponsiblePerson, ChangedAt: closedAt, ChangeReason: null }));
  };

  const addEvidence = (run: ControlRun, uploadedAt: string, onlyMandatory = false) => {
    const v = versionById.get(run.VersionId)!;
    for (const ev of v.RequiredEvidence) {
      if (onlyMandatory && !ev.mandatory) continue;
      if (!ev.mandatory && rnd() < 0.5) continue;
      const name = `${ev.name.toLowerCase().replace(/[^a-z0-9áčďéěíňóřšťúůýž]+/gi, '_').slice(0, 40)}_${run.RunCode}.csv`;
      const content = evidenceContent(run, ev.name, rnd);
      const blob = new Blob([content], { type: 'text/csv' });
      const doc: DocumentRecord = {
        DocumentId: newGuid(),
        Library: 'IC_ControlDocuments',
        ControlId: run.ControlId,
        RunId: run.RunId,
        ControlCode: run.ControlCode,
        RunCode: run.RunCode,
        ReportId: null,
        FolderPath: `IC_ControlDocuments/${run.ControlCode}/${run.RunCode}/Evidence`,
        DocumentType: 'Evidence',
        EvidenceDefId: ev.id,
        FileName: name,
        FileSize: blob.size,
        MimeType: 'text/csv',
        Version: 1,
        UploadedAt: uploadedAt,
        UploadedBy: run.CompletedBy ?? run.AssignedOwnerEmail,
        IsRemoved: false,
        RemovedAt: null,
        RemovedBy: null,
        RemovedReason: null,
        ProtocolId: null,
      };
      documents.push(doc);
      files.push({ id: doc.DocumentId, blob, name });
    }
  };

  const recentAuditFrom = addDays(today, -21);
  runs.sort((a, b) => a.DueDate.localeCompare(b.DueDate));
  for (const run of runs) {
    const lateProb = SEED_OWNER_LATE_PROB[run.AssignedOwnerEmail] ?? 0.08;
    const daily = run.RecurrenceType === 'Daily' || run.RecurrenceType === 'Workday';
    const daysSinceDue = diffDays(run.DueDate, today);
    const windowOpen = run.ScheduledDate <= today;
    if (!windowOpen) continue; // budoucí – zůstává Planned

    // Otevřené okno (termín dnes nebo v budoucnu)
    if (daysSinceDue <= 0) {
      const r = rnd();
      if (r < (daily ? 0.35 : 0.5)) {
        run.WorkflowState = 'InProgress';
        run.StartedAt = at(run.ScheduledDate < today ? run.ScheduledDate : today, 8, between(rnd, 5, 50));
        run.ChecklistResults = run.ChecklistResults.map((c, i) => (i < Math.ceil(run.ChecklistResults.length / 2) ? { ...c, answer: 'OK' } : c));
        if (rnd() < 0.5) addEvidence(run, at(toPragueDate(run.StartedAt), 10, 30), true);
      } else if (!daily && run.ApprovalRequired && r < 0.8 && run.ScheduledDate < today) {
        const performed = addDays(run.ScheduledDate, between(rnd, 0, Math.max(0, diffDays(run.ScheduledDate, today) - 0)));
        completeRun(run, performed, false);
      } else if (!daily && r < 0.7 && run.ScheduledDate < today) {
        completeRun(run, addDays(run.ScheduledDate, between(rnd, 0, Math.max(0, diffDays(run.ScheduledDate, today)))), true);
      }
      continue;
    }

    // Termín uplynul
    if (rnd() < 0.012 && !daily) {
      run.WorkflowState = 'Cancelled';
      run.IsOpen = false;
      run.ExceptionReason = pick(rnd, ['Mimořádná kontrola nahrazena auditem', 'Systém nedostupný – kontrola provedena v rámci následujícího běhu', 'V období nevznikly žádné transakce']);
      continue;
    }
    const recent = daysSinceDue <= 21;
    const overdueProb = daily ? (daysSinceDue <= 4 ? 0.1 : 0) : daysSinceDue <= 3 ? 0.18 + lateProb : recent ? 0.12 + lateProb * 1.5 : 0;
    if (rnd() < overdueProb) {
      if (rnd() < 0.4) {
        run.WorkflowState = 'InProgress';
        run.StartedAt = at(run.ScheduledDate, 9, between(rnd, 0, 50));
        run.ChecklistResults = run.ChecklistResults.map((c, i) => (i === 0 ? { ...c, answer: 'OK' } : c));
      }
      continue; // zůstává po termínu
    }
    const late = rnd() < lateProb;
    const performed = late
      ? addDays(run.DueDate, between(rnd, 1, 6))
      : addDays(run.ScheduledDate, between(rnd, 0, Math.max(0, diffDays(run.ScheduledDate, run.DueDate))));
    if (performed > today) continue; // ještě neprovedeno → zůstává po termínu
    const approvePending = run.ApprovalRequired && daysSinceDue <= 14 && rnd() < 0.65;
    completeRun(run, performed, !approvePending);
    if (run.ApprovalRequired && recent && run.WorkflowState === 'Submitted' && rnd() < 0.35) {
      run.WorkflowState = 'Returned';
      run.ReturnCount = 1;
      run.ReturnComment = pick(rnd, ['Doplňte prosím přílohu s odsouhlasením.', 'Komentář k odchylce je nedostatečný – rozepište příčinu.', 'Chybí vyjádření ke kroku 2.']);
      run.ModifiedBy = run.ReviewerEmail ?? U.coord;
      ctx.audit.push(auditEntry({ EntityType: 'ControlRun', EntityId: run.RunId, ControlId: run.ControlId, Action: 'Vrácení k doplnění', FieldName: 'WorkflowState', OldValue: 'Submitted', NewValue: 'Returned', ChangedBy: run.ReviewerEmail ?? U.coord, ChangedAt: at(addDays(toPragueDate(run.SubmittedAt!), 1) < today ? addDays(toPragueDate(run.SubmittedAt!), 1) : today, 9, 30), ChangeReason: run.ReturnComment }));
    }
  }

  function completeRun(run: ControlRun, performed: ISODate, finalize: boolean) {
    const v = versionById.get(run.VersionId)!;
    const daily = run.RecurrenceType === 'Daily' || run.RecurrenceType === 'Workday';
    const startDay = performed > run.ScheduledDate && rnd() < 0.3 ? addDays(performed, -1) : performed;
    run.StartedAt = at(startDay, 8, between(rnd, 0, 59));
    run.SubmittedAt = at(performed, between(rnd, 10, 15), between(rnd, 0, 59));
    if (run.SubmittedAt < run.StartedAt) run.StartedAt = at(performed, 8, 0);
    const performer = rnd() < 0.9 || !run.BackupOwnerEmail ? run.AssignedOwnerEmail : run.BackupOwnerEmail;
    run.CompletedBy = performer;
    const r = rnd();
    const findingRate = daily ? 0.03 : 0.14;
    let result: RunResult = 'NoFindings';
    if (r < findingRate * 0.55) result = 'WithFindings';
    else if (r < findingRate * 0.8) result = 'PartiallyMet';
    else if (r < findingRate * 0.93) result = 'NotMet';
    else if (r < findingRate) result = 'NotAssessable';
    run.Result = result;
    run.ChecklistResults = checklistTemplate(v).map((c) => ({ ...c, answer: 'OK' as const }));
    if (result !== 'NoFindings' && result !== 'NotAssessable') {
      const idx = between(rnd, 0, run.ChecklistResults.length - 1);
      run.ChecklistResults[idx] = { ...run.ChecklistResults[idx], answer: 'NOK', comment: 'Zjištěna odchylka – viz založené zjištění.' };
      run.ResultComment = 'Zjištěné odchylky jsou popsány v nápravném opatření.';
      if (result !== 'PartiallyMet' || rnd() < 0.6)
        makeFinding(run, run.SubmittedAt, result === 'NotMet' ? pick<Finding['Severity']>(rnd, ['High', 'Critical']) : pick<Finding['Severity']>(rnd, ['Low', 'Medium', 'High']));
    } else if (result === 'NotAssessable') {
      run.ChecklistResults = run.ChecklistResults.map((c, i) => (i === run.ChecklistResults.length - 1 ? { ...c, answer: 'NA', comment: 'Podklad nebyl k dispozici.' } : c));
      run.ResultComment = 'Kontrolu nebylo možné vyhodnotit.';
      run.ExceptionReason = 'Zdrojová sestava nebyla k dispozici z důvodu výpadku systému.';
    } else if (rnd() < 0.3) run.ResultComment = 'Bez odchylek.';
    addEvidence(run, at(performed, 10, between(rnd, 0, 50)));

    if (!run.ApprovalRequired) {
      run.WorkflowState = 'Completed';
      run.IsOpen = false;
      run.CompletedAt = run.SubmittedAt;
    } else if (finalize) {
      let approveDay = addDays(performed, between(rnd, 0, 2));
      if (approveDay > today) approveDay = today;
      if (approveDay === today && rnd() < 0.5) {
        run.WorkflowState = 'Submitted';
        run.IsOpen = true;
      } else {
        run.WorkflowState = 'Completed';
        run.IsOpen = false;
        run.ApprovedAt = at(approveDay, between(rnd, 13, 17), between(rnd, 0, 59));
        if (run.ApprovedAt < run.SubmittedAt!) run.ApprovedAt = new Date(new Date(run.SubmittedAt!).getTime() + 3600_000).toISOString();
        run.ApprovedBy = run.ReviewerEmail === performer ? U.coord : run.ReviewerEmail;
        run.CompletedAt = run.ApprovedAt;
      }
    } else {
      run.WorkflowState = 'Submitted';
      run.IsOpen = true;
    }
    run.ModifiedAt = run.CompletedAt ?? run.SubmittedAt!;
    run.ModifiedBy = run.ApprovedBy ?? performer;
    run.RowVersion = run.WorkflowState === 'Completed' ? (run.ApprovalRequired ? 5 : 4) : 3;
    if (toPragueDate(run.SubmittedAt!) >= recentAuditFrom) {
      ctx.audit.push(
        auditEntry({ EntityType: 'ControlRun', EntityId: run.RunId, ControlId: run.ControlId, Action: 'Zahájení provedení', FieldName: 'WorkflowState', OldValue: 'Planned', NewValue: 'InProgress', ChangedBy: performer, ChangedAt: run.StartedAt!, ChangeReason: null }),
        auditEntry({ EntityType: 'ControlRun', EntityId: run.RunId, ControlId: run.ControlId, Action: run.ApprovalRequired ? 'Odeslání ke schválení' : 'Dokončení kontroly', FieldName: 'WorkflowState', OldValue: 'InProgress', NewValue: run.ApprovalRequired ? 'Submitted' : 'Completed', ChangedBy: performer, ChangedAt: run.SubmittedAt!, ChangeReason: null }),
      );
      if (run.ApprovedAt)
        ctx.audit.push(auditEntry({ EntityType: 'ControlRun', EntityId: run.RunId, ControlId: run.ControlId, Action: 'Schválení kontroly', FieldName: 'WorkflowState', OldValue: 'Submitted', NewValue: 'Completed', ChangedBy: run.ApprovedBy!, ChangedAt: run.ApprovedAt, ChangeReason: null }));
    }
  }

  // Zajistit dostatek běhů čekajících na schválení pro ukázku role Schvalovatel.
  const pendingNow = runs.filter((r) => r.WorkflowState === 'Submitted').length;
  const recentlyApproved = runs
    .filter((r) => r.WorkflowState === 'Completed' && r.ApprovalRequired && r.ApprovedAt && toPragueDate(r.ApprovedAt) >= addDays(today, -10))
    .sort((a, b) => b.ApprovedAt!.localeCompare(a.ApprovedAt!));
  for (const r of recentlyApproved.slice(0, Math.max(0, 7 - pendingNow))) {
    ctx.audit = ctx.audit.filter((a) => !(a.EntityId === r.RunId && a.Action === 'Schválení kontroly'));
    Object.assign(r, { WorkflowState: 'Submitted', IsOpen: true, ApprovedAt: null, ApprovedBy: null, CompletedAt: null, ModifiedAt: r.SubmittedAt, ModifiedBy: r.CompletedBy, RowVersion: 3 });
  }

  // ---------------------------------------------------------------- jednorázové úpravy (příklady)
  const future = runs.filter((r) => r.WorkflowState === 'Planned' && r.ScheduledDate > addDays(today, 3) && !['Workday', 'Daily'].includes(r.RecurrenceType));
  const overrideExamples: Array<{ code: string; kind: 'date' | 'owner'; reason: string }> = [
    { code: 'CTRL-0014', kind: 'date', reason: 'Posun kvůli souběhu s ročním auditem – dohodnuto s vedoucím útvaru.' },
    { code: 'CTRL-0020', kind: 'owner', reason: 'Zástup za dovolenou – kontrolu provede zástupce.' },
    { code: 'CTRL-0026', kind: 'date', reason: 'Zdrojová data budou k dispozici o dva pracovní dny později.' },
  ];
  for (const ex of overrideExamples) {
    const run = future.find((r) => r.ControlCode === ex.code);
    if (!run) continue;
    const changedAt = at(addDays(today, -between(rnd, 1, 6)), 11, 10);
    if (ex.kind === 'date') {
      const oldDue = run.DueDate;
      run.DueDate = addDays(run.DueDate, 2);
      while (!isWorkday(run.DueDate, cal)) run.DueDate = addDays(run.DueDate, 1);
      run.DueMonthKey = run.DueDate.slice(0, 7);
      run.OverrideNote = ex.reason;
      ctx.audit.push(auditEntry({ EntityType: 'ControlRun', EntityId: run.RunId, ControlId: run.ControlId, Action: 'Jednorázová úprava výskytu', FieldName: 'DueDate', OldValue: oldDue, NewValue: run.DueDate, ChangedBy: U.coord, ChangedAt: changedAt, ChangeReason: ex.reason }));
    } else {
      const old = run.AssignedOwnerEmail;
      run.AssignedOwnerEmail = run.BackupOwnerEmail ?? old;
      run.BackupOwnerEmail = old;
      run.OverrideNote = ex.reason;
      ctx.audit.push(auditEntry({ EntityType: 'ControlRun', EntityId: run.RunId, ControlId: run.ControlId, Action: 'Jednorázová úprava výskytu', FieldName: 'AssignedOwnerEmail', OldValue: old, NewValue: run.AssignedOwnerEmail, ChangedBy: U.coord, ChangedAt: changedAt, ChangeReason: ex.reason }));
    }
    run.IsOneTimeOverride = true;
    run.ModifiedAt = changedAt;
    run.ModifiedBy = U.coord;
    run.RowVersion = 2;
  }

  // ---------------------------------------------------------------- protokoly (snapshoty)
  const protocols: ProtocolRecord[] = [];
  const controlById = new Map(controls.map((c) => [c.ControlId, c]));
  for (const run of runs.filter((r) => r.WorkflowState === 'Completed')) {
    const snap = buildProtocolSnapshot({
      control: controlById.get(run.ControlId)!,
      version: versionById.get(run.VersionId)!,
      run,
      documents,
      findings,
      departments: LOOKUPS,
      directory: dir,
      generatedAt: run.CompletedAt!,
      generatedBy: run.ApprovedBy ?? run.CompletedBy!,
      protocolVersion: 1,
      correctionReason: null,
      supersedesProtocolId: null,
    });
    const rec = await createProtocolRecord(snap, run);
    protocols.push(rec);
    run.ProtocolId = rec.ProtocolId;
    run.ProtocolUrl = `IC_ControlDocuments/${run.ControlCode}/${run.RunCode}/Protocols/${protocolIdFor(run.ControlCode, run.RunCode, 1)}.pdf`;
    if (toPragueDate(run.CompletedAt!) >= recentAuditFrom)
      ctx.audit.push(auditEntry({ EntityType: 'Protocol', EntityId: rec.ProtocolId, ControlId: run.ControlId, Action: 'Vytvoření protokolu', FieldName: 'ContentHash', OldValue: null, NewValue: rec.ContentHash, ChangedBy: rec.GeneratedBy, ChangedAt: run.CompletedAt!, ChangeReason: null }));
  }

  // ---------------------------------------------------------------- upozornění (historie posledních 10 dní)
  const notifications: NotificationRecord[] = [];
  const keys = new Set<string>();
  const versionsById = new Map(versions.map((v) => [v.VersionId, v]));
  const settings = { ...DEFAULT_SETTINGS, coordinatorEmail: U.coord, adminEmail: U.admin };
  const activeIds = new Set(controls.filter((c) => c.IsActive).map((c) => c.ControlId));
  const addNotif = (n: Omit<NotificationRecord, 'NotificationId'>) => {
    if (keys.has(n.DeduplicationKey)) return;
    keys.add(n.DeduplicationKey);
    notifications.push({ NotificationId: newGuid(), ...n });
  };
  for (let d = 10; d >= 1; d--) {
    const day = addDays(today, -d);
    const view = runs.filter((r) => activeIds.has(r.ControlId) && r.ScheduledDate <= addDays(day, 10) && r.DueDate >= addDays(day, -30)).map((r) => runAsOf(r, day));
    const ev = evaluateDeadlineNotifications({ runs: view, versionsById, today: day, settings, departments: LOOKUPS, directory: dir, existingKeys: keys });
    for (const c of ev.candidates) {
      const failed = rnd() < 0.04;
      const retried = failed && rnd() < 0.6;
      const sentAt = at(day, 6, between(rnd, 2, 12));
      addNotif({
        RunId: c.runId,
        ControlId: c.controlId,
        RecipientEmail: c.recipient,
        NotificationType: c.type,
        Subject: c.subject,
        Body: c.body,
        Reason: c.reason,
        PlannedSendAt: at(day, 6, 0),
        SentAt: !failed || retried ? sentAt : null,
        DeliveryStatus: !failed || retried ? 'Sent' : 'Failed',
        DeduplicationKey: c.dedupKey,
        RetryCount: failed ? (retried ? 1 : 0) : 0,
        ErrorMessage: failed && !retried ? 'Simulovaná chyba: 429 Too Many Requests (Office 365 Outlook – limit volání)' : null,
        DigestId: null,
        ReadAt: d > 2 && rnd() < 0.7 ? at(day, 9, between(rnd, 0, 59)) : null,
        CreatedAt: at(day, 6, 0),
      });
    }
    // denní souhrn jako příklad pro koordinátorku
    const coordItems = ev.candidates.filter((c) => c.recipient === U.coord);
    if (d === 3 && coordItems.length) {
      const dg = buildDigest('Kateřina Marková', coordItems, day);
      addNotif({ RunId: null, ControlId: null, RecipientEmail: U.coord, NotificationType: 'DailyDigest', Subject: dg.subject, Body: dg.body, Reason: 'Ukázka režimu denního souhrnu.', PlannedSendAt: at(day, 7, 0), SentAt: at(day, 7, 1), DeliveryStatus: 'Sent', DeduplicationKey: `${U.coord}|DailyDigest|${day}|1`, RetryCount: 0, ErrorMessage: null, DigestId: null, ReadAt: at(day, 8, 15), CreatedAt: at(day, 7, 0) });
    }
  }
  for (const run of runs) {
    if (run.SubmittedAt && run.ApprovalRequired && toPragueDate(run.SubmittedAt) >= addDays(today, -10) && run.ReviewerEmail)
      addNotif({ RunId: run.RunId, ControlId: run.ControlId, RecipientEmail: run.ReviewerEmail, NotificationType: 'ApprovalRequest', Subject: `Ke schválení: ${run.ControlCode} ${run.ControlName} (${run.RunCode})`, Body: `${dir.get(run.CompletedBy!)?.DisplayName} odeslal(a) kontrolu ke schválení.`, Reason: 'Událost: odeslání ke schválení.', PlannedSendAt: run.SubmittedAt, SentAt: run.SubmittedAt, DeliveryStatus: 'Sent', DeduplicationKey: `${run.RunId}|ApprovalRequest|1|${run.ReviewerEmail}`, RetryCount: 0, ErrorMessage: null, DigestId: null, ReadAt: run.ApprovedAt, CreatedAt: run.SubmittedAt });
    if (run.WorkflowState === 'Returned')
      addNotif({ RunId: run.RunId, ControlId: run.ControlId, RecipientEmail: run.CompletedBy ?? run.AssignedOwnerEmail, NotificationType: 'Returned', Subject: `Vráceno k doplnění: ${run.ControlCode} (${run.RunCode})`, Body: `Schvalovatel vrátil kontrolu: ${run.ReturnComment}`, Reason: 'Událost: vrácení k doplnění.', PlannedSendAt: run.ModifiedAt, SentAt: run.ModifiedAt, DeliveryStatus: 'Sent', DeduplicationKey: `${run.RunId}|Returned|1`, RetryCount: 0, ErrorMessage: null, DigestId: null, ReadAt: null, CreatedAt: run.ModifiedAt });
  }

  // ---------------------------------------------------------------- měsíční reporty (3 uzavřené měsíce)
  const reports: ReportSnapshot[] = [];
  const mIdx = monthIndex(today);
  for (let back = 3; back >= 1; back--) {
    const { y, m } = monthIndexToYM(mIdx - back);
    const next = monthIndexToYM(mIdx - back + 1);
    let genDay = makeISODate(next.y, next.m, 1);
    while (!isWorkday(genDay, cal)) genDay = addDays(genDay, 1);
    if (genDay > today) genDay = today;
    const generatedAt = at(genDay, 7, 0);
    const data = buildMonthlyReport({ year: y, month: m, scope: 'ALL', runs, findings, departments: LOOKUPS, directory: dir, asOfDate: genDay, generatedAt, generatedBy: { email: U.coord, name: 'Kateřina Marková' } });
    const hash = await sha256Hex(canonicalJson(data));
    const id = `RPT-${y}-${String(m).padStart(2, '0')}-ALL-V1`;
    reports.push({ ReportId: id, ReportingMonth: m, ReportingYear: y, DepartmentScope: 'ALL', GeneratedAt: generatedAt, GeneratedBy: U.coord, SnapshotData: data, ContentHash: hash, ReportFileUrl: null, DocumentId: null, ReportVersion: 1 });
    ctx.audit.push(auditEntry({ EntityType: 'Report', EntityId: id, ControlId: null, Action: 'Vytvoření měsíčního reportu', FieldName: 'ContentHash', OldValue: null, NewValue: hash, ChangedBy: U.coord, ChangedAt: generatedAt, ChangeReason: 'FLOW-05 (simulace plánovaného běhu)' }));
  }

  // ---------------------------------------------------------------- technický stav automatizací
  const automation: AutomationLogEntry[] = [];
  for (let d = 14; d >= 1; d--) {
    const day = addDays(today, -d);
    const log = (FlowName: string, h: number, m: number, extra: Partial<AutomationLogEntry>) =>
      automation.push({ LogId: newGuid(), FlowName, StartedAt: at(day, h, m), FinishedAt: at(day, h, m + 2), Status: 'Succeeded', ItemsProcessed: 0, ItemsCreated: 0, ItemsSkipped: 0, ErrorCount: 0, Message: '', TriggeredBy: 'Plánovač (simulace)', ...extra });
    log('FLOW-01 GenerateRecurringControls', 2, 0, { ItemsProcessed: 31, ItemsCreated: between(rnd, 1, 4), ItemsSkipped: between(rnd, 1900, 2100), Message: 'Doplnění horizontu 12 měsíců.' });
    const fail = d === 5;
    log('FLOW-02 SendDueDateReminders', 6, 0, { ItemsProcessed: between(rnd, 40, 70), ItemsCreated: between(rnd, 4, 14), ItemsSkipped: between(rnd, 5, 20), ErrorCount: fail ? 2 : 0, Status: fail ? 'PartiallySucceeded' : 'Succeeded', Message: fail ? 'Office 365 Outlook: 429 Too Many Requests – 2 zprávy čekají na opakování.' : 'Připomínky odeslány.' });
    log('FLOW-03 EscalateOverdueControls', 6, 5, { ItemsProcessed: between(rnd, 5, 15), ItemsCreated: between(rnd, 0, 3), Message: 'Eskalace vyhodnoceny.' });
    if (fail) log('FLOW-07 MonitorAutomationFailures', 6, 30, { ItemsProcessed: 2, ItemsCreated: 2, Message: 'Opakované doručení proběhlo úspěšně.' });
  }
  for (const r of reports) automation.push({ LogId: newGuid(), FlowName: 'FLOW-05 GenerateMonthlyManagementReport', StartedAt: r.GeneratedAt, FinishedAt: r.GeneratedAt, Status: 'Succeeded', ItemsProcessed: r.SnapshotData.total.planned, ItemsCreated: 1, ItemsSkipped: 0, ErrorCount: 0, Message: `Report ${r.ReportId} vytvořen (simulace).`, TriggeredBy: 'Plánovač (simulace)' });

  // ---------------------------------------------------------------- uložení
  const roles: RoleAssignment[] = ROLE_SEED.map(([UserEmail, Role, DepartmentScope]) => ({ AssignmentId: newGuid(), UserEmail, Role, DepartmentScope, IsActive: true }));
  const holidays: Holiday[] = [];
  const y0 = parseISODate(today).y;
  for (let y = y0 - 1; y <= y0 + 2; y++) for (const h of czechPublicHolidays(y)) holidays.push({ HolidayId: h.date, HolidayDate: h.date, Name: h.name });

  runs = runs.map((r) => ({ ...r, IsOpen: r.WorkflowState !== 'Completed' && r.WorkflowState !== 'Cancelled' }));
  ctx.audit.push(auditEntry({ EntityType: 'System', EntityId: 'seed', ControlId: null, Action: 'Inicializace demo dat', FieldName: 'SeedVersion', OldValue: null, NewValue: String(SEED_VERSION), ChangedBy: 'system', ChangedAt: new Date().toISOString(), ChangeReason: `Syntetická data vztažená k ${today}` }));

  await store.bus.batch(async () => {
    await store.directory.bulkPut(DIRECTORY);
    await store.lookups.bulkPut(LOOKUPS);
    await store.roles.bulkPut(roles);
    await store.holidays.bulkPut(holidays);
    await store.controls.bulkPut(controls);
    await store.versions.bulkPut(versions);
    await store.runs.bulkPut(runs);
    await store.findings.bulkPut(findings);
    await store.documents.bulkPut(documents);
    for (const f of files) await store.files.put(f.id, f.blob, f.name);
    await store.protocols.bulkPut(protocols);
    await store.notifications.bulkPut(notifications);
    await store.reports.bulkPut(reports);
    await store.automation.bulkPut(automation);
    await store.audit.appendMany(ctx.audit.sort((a, b) => a.ChangedAt.localeCompare(b.ChangedAt)));
    await store.settings.replace({ ...settings, lastGenerationDate: today, lastDeadlineCheckDate: addDays(today, -1) });
    await store.setMeta('seed', { version: SEED_VERSION, seededFor: today, seededAt: new Date().toISOString() });
  });
  return { controls: controls.length, runs: runs.length };
}
