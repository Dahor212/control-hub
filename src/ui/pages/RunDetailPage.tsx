/**
 * Detail konkrétního běhu (výskytu) kontroly – provedení za konkrétní období.
 * Odlišeno od detailu definice: zelenomodrý pruh „Provedení za období“ a samostatné akce.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FilePlus2,
  FileText,
  History,
  Lock,
  Paperclip,
  PenLine,
  Play,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { canCancel, canCorrect, canExecute, canRemoveDocument, canReschedule, canReview, isAssignee } from '../../domain/permissions';
import { validateSubmission, NEGATIVE_RESULTS } from '../../domain/workflow';
import { ANSWER_LABELS, DOCUMENT_TYPE_LABELS, RECURRENCE_LABELS, RESULT_LABELS } from '../../domain/labels';
import { describeDueRule, describeRecurrence } from '../../domain/recurrence';
import { isFindingOverdue } from '../../domain/metrics';
import type { ChecklistAnswer, ControlRun, ProtocolRecord, RunResult } from '../../domain/types';
import { approveRun, cancelRun, reopenForCorrection, returnRun, saveRunDraft, startRun, submitRun, type ExecutionData } from '../../services/runService';
import { getDocumentBlob, removeDocument, uploadRunDocument, MAX_FILE_SIZE } from '../../services/documentService';
import { useApp } from '../AppContext';
import { useLookups, useUsers } from '../hooks';
import { AuditTable } from '../components/AuditTable';
import { ConfirmDialog } from '../components/Dialog';
import { DataTable } from '../components/DataTable';
import { PaRef } from '../components/PaRef';
import { FindingStatusBadge, ResultBadge, RiskBadge, RunStatus, SeverityBadge } from '../components/StatusBadges';
import { Badge, Button, Card, CardHeader, DescriptionList, EmptyState, Field, Notice, PageHeader, Select, Tabs, Textarea, cx } from '../components/ui';
import { FindingDialog, RunEditDialog } from '../dialogs/RunDialogs';
import { ProtocolPreview, downloadProtocol } from '../dialogs/SnapshotPreviews';
import { downloadBlob } from '../download';
import { fmtDate, fmtDateTime, fmtPeriod, fmtRelative, fmtSize } from '../format';

type Tab = 'overview' | 'execution' | 'attachments' | 'findings' | 'protocols' | 'audit';

export function RunDetailPage() {
  const { runId } = useParams();
  const [sp, setSp] = useSearchParams();
  const { store, version, session, today, ctx, run: exec, settings } = useApp();
  const nav = useNavigate();
  const { name } = useUsers();
  const { deptLabel, catLabel } = useLookups();
  const run = runId ? store.runs.get(runId) : undefined;
  const tab = (sp.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => setSp(t === 'overview' ? {} : { tab: t }, { replace: true });
  const [editOpen, setEditOpen] = useState<null | 'date' | 'owner'>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);

  const data = useMemo(() => {
    if (!run) return null;
    return {
      control: store.controls.get(run.ControlId),
      version: store.versions.get(run.VersionId),
      docs: store.documents.filter((d) => d.RunId === run.RunId && d.DocumentType !== 'Report'),
      findings: store.findings.filter((f) => f.RunId === run.RunId),
      protocols: store.protocols.filter((p) => p.RunId === run.RunId).sort((a, b) => b.ProtocolVersion - a.ProtocolVersion),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, run]);

  const audit = useMemo(() => {
    if (!run || !data) return [];
    const ids = new Set([run.RunId, ...data.docs.map((d) => d.DocumentId), ...data.findings.map((f) => f.FindingId), ...data.protocols.map((p) => p.ProtocolId)]);
    return store.audit.filter((a) => ids.has(a.EntityId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, run, data]);

  if (!run || !data) return <EmptyState title="Běh nebyl nalezen" description="Odkaz může být neplatný, nebo byl běh nahrazen novou verzí." action={<Button onClick={() => nav('/')}>Na dashboard</Button>} />;
  const { version: ver } = data;
  const canEditPlan = canReschedule(session, run).allowed;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Registr kontrol', to: '/controls' },
          { label: run.ControlCode, to: `/controls/${run.ControlId}` },
          { label: run.RunCode },
        ]}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="teal" icon={CalendarRange}>
              Běh kontroly
            </Badge>
            <span className="font-mono text-xs text-slate-500">
              {run.ControlCode} · {run.RunCode}
            </span>
          </span>
        }
        title={run.ControlName}
        subtitle={`Kontrolované období ${fmtPeriod(run.PeriodFrom, run.PeriodTo)} · ${RECURRENCE_LABELS[run.RecurrenceType]} · verze metodiky v${run.VersionNumber}`}
        actions={
          <>
            <PaRef id="run.edit" inline>
              <Button icon={PenLine} disabled={!canEditPlan} title={canEditPlan ? undefined : canReschedule(session, run).reason} onClick={() => setEditOpen('date')}>
                Změnit termín / odpovědnost
              </Button>
            </PaRef>
            {canCancel(session, run).allowed && (
              <PaRef id="run.cancel" inline>
                <Button icon={Ban} variant="ghost" onClick={() => setCancelOpen(true)}>
                  Zrušit běh
                </Button>
              </PaRef>
            )}
            {canCorrect(session, run).allowed && (
              <PaRef id="run.correct" inline>
                <Button icon={Wrench} variant="ghost" onClick={() => setCorrectOpen(true)}>
                  Řízená oprava
                </Button>
              </PaRef>
            )}
          </>
        }
      />

      <PaRef id="run.header">
        <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-[var(--shadow-card)] md:grid-cols-4 xl:grid-cols-7">
          {[
            ['Stav', <RunStatus key="s" run={run} today={today} dueSoonDays={settings.dueSoonDays} />],
            ['Plánováno', fmtDate(run.ScheduledDate)],
            ['Termín splnění', <span key="d">{fmtDate(run.DueDate)} <span className="text-xs text-slate-400">({fmtRelative(run.DueDate, today)})</span></span>],
            ['Odpovědná osoba', name(run.AssignedOwnerEmail)],
            ['Schvalovatel', run.ApprovalRequired ? name(run.ReviewerEmail) : 'bez schválení'],
            ['Útvar / oblast', `${deptLabel(run.Department)} · ${catLabel(run.Category)}`],
            ['Rizikovost', <RiskBadge key="r" risk={run.RiskLevel} />],
          ].map(([k, v], i) => (
            <div key={i} className="bg-white px-4 py-3">
              <p className="text-[11.5px] font-medium text-slate-500">{k}</p>
              <div className="mt-1 text-[13.5px] text-slate-800">{v}</div>
            </div>
          ))}
        </div>
      </PaRef>

      <Notice tone="teal" icon={CalendarRange} className="mb-3">
        Pracujete s <b>provedením kontroly za konkrétní období</b>. Změny se týkají pouze tohoto běhu – metodiku a plán opakování upravíte v{' '}
        <Link className="font-medium underline" to={`/controls/${run.ControlId}`}>
          definici kontroly
        </Link>
        .
      </Notice>
      {run.IsOneTimeOverride && (
        <Notice tone="violet" className="mb-3" title="Jednorázově upravený výskyt">
          {run.OverrideNote || 'Termín nebo osoby byly změněny jen pro tento výskyt.'}
        </Notice>
      )}
      {run.IsSuperseded && (
        <Notice tone="neutral" className="mb-3" title="Nahrazený výskyt">
          {run.ExceptionReason}
        </Notice>
      )}
      {run.WorkflowState === 'Cancelled' && !run.IsSuperseded && (
        <Notice tone="neutral" icon={Ban} className="mb-3" title="Běh byl zrušen">
          {run.ExceptionReason} – zrušené běhy se nezapočítávají do míry plnění.
        </Notice>
      )}
      {run.IsCorrection && (
        <Notice tone="amber" icon={Wrench} className="mb-3" title="Probíhá řízená oprava uzavřeného záznamu">
          {run.ExceptionReason}. Původní protokol zůstává archivován; po opětovném uzavření vznikne nová verze protokolu.
        </Notice>
      )}
      {run.WorkflowState === 'Returned' && run.ReturnComment && (
        <Notice tone="amber" icon={RotateCcw} className="mb-3" title={`Vráceno k doplnění (${run.ReturnCount}×)`}>
          {run.ReturnComment}
        </Notice>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Přehled', icon: Eye },
          { value: 'execution', label: 'Provedení', icon: ClipboardCheck },
          { value: 'attachments', label: 'Přílohy', icon: Paperclip, count: data.docs.filter((d) => !d.IsRemoved && d.DocumentType !== 'Protocol').length },
          { value: 'findings', label: 'Nápravná opatření', icon: ShieldAlert, count: data.findings.length },
          { value: 'protocols', label: 'Protokoly', icon: FileText, count: data.protocols.length },
          { value: 'audit', label: 'Auditní historie', icon: History, count: audit.length },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Metodika a účel" subtitle={`Verze v${run.VersionNumber}${ver ? ` platná od ${fmtDate(ver.EffectiveFrom)}` : ''} – platí pro tento běh i při pozdější změně definice`} />
            {ver ? (
              <div className="space-y-4 text-[13.5px]">
                <DescriptionList columns={1} items={[{ label: 'Cíl kontroly', value: ver.ControlObjective }, { label: 'Popis', value: ver.Description }]} />
                <div>
                  <p className="text-xs font-medium text-slate-500">Postup</p>
                  <p className="mt-1 whitespace-pre-line text-slate-800">{ver.Instructions}</p>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Požadované dokumenty</p>
                  {ver.RequiredEvidence.length ? (
                    <ul className="space-y-1">
                      {ver.RequiredEvidence.map((e) => (
                        <li key={e.id} className="flex items-center gap-2">
                          <Paperclip className="size-3.5 text-slate-400" /> {e.name} {e.mandatory ? <Badge tone="amber">povinné</Badge> : <Badge>doporučené</Badge>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500">Žádné.</p>
                  )}
                </div>
              </div>
            ) : (
              <p>Verze nenalezena.</p>
            )}
          </Card>
          <Card>
            <CardHeader title="Průběh" />
            <Timeline run={run} />
            <div className="mt-5 border-t border-line pt-4">
              <DescriptionList
                columns={1}
                items={[
                  { label: 'Výsledek', value: <ResultBadge result={run.Result} /> },
                  { label: 'Komentář', value: run.ResultComment || '—' },
                  { label: 'Zástupce', value: name(run.BackupOwnerEmail) },
                  { label: 'Pravidlo opakování', value: ver ? describeRecurrence(ver) : '—' },
                  { label: 'Termín splnění', value: ver ? describeDueRule(ver.DueDateRule) : '—' },
                  { label: 'Identifikátor výskytu', value: <span className="font-mono text-xs break-all">{run.OccurrenceKey}</span> },
                  { label: 'Složka dokumentů', value: <span className="font-mono text-xs break-all">IC_ControlDocuments/{run.ControlCode}/{run.RunCode}</span> },
                ]}
              />
            </div>
          </Card>
        </div>
      )}

      {tab === 'execution' && ver && <Execution run={run} key={`${run.RunId}-${run.WorkflowState}`} />}
      {tab === 'attachments' && <Attachments run={run} />}
      {tab === 'findings' && <Findings run={run} />}
      {tab === 'protocols' && <Protocols run={run} protocols={data.protocols} />}
      {tab === 'audit' && (
        <Card>
          <AuditTable entries={audit} />
        </Card>
      )}

      {editOpen && <RunEditDialog run={run} open onClose={() => setEditOpen(null)} focus={editOpen} />}
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Zrušit běh kontroly?"
        tone="danger"
        confirmLabel="Zrušit běh"
        reasonLabel="Důvod zrušení"
        reasonRequired
        onConfirm={async (reason) => {
          const ok = await exec(() => cancelRun(ctx, run.RunId, run.RowVersion, reason), 'Běh byl zrušen.');
          if (ok !== undefined) setCancelOpen(false);
        }}
      >
        Zrušený běh se nebude provádět a nezapočítá se do míry plnění. Historie zůstává zachována (záznam se nemaže).
      </ConfirmDialog>
      <ConfirmDialog
        open={correctOpen}
        onClose={() => setCorrectOpen(false)}
        title="Zahájit řízenou opravu uzavřeného běhu?"
        confirmLabel="Otevřít k opravě"
        reasonLabel="Důvod opravy"
        reasonRequired
        minReason={10}
        onConfirm={async (reason) => {
          const ok = await exec(() => reopenForCorrection(ctx, run.RunId, run.RowVersion, reason), 'Běh byl otevřen k řízené opravě.');
          if (ok !== undefined) {
            setCorrectOpen(false);
            setTab('execution');
          }
        }}
      >
        Běh se vrátí do stavu Rozpracováno. Stávající protokol {run.ProtocolId} zůstane archivován beze změny; po opětovném dokončení (a případném schválení) vznikne nová, verzovaná podoba protokolu. Datum provedení pro účely včasnosti se nemění.
      </ConfirmDialog>
    </div>
  );
}

function Timeline({ run }: { run: ControlRun }) {
  const { name } = useUsers();
  const steps = [
    { label: 'Naplánováno', at: run.CreatedAt, who: null, done: true },
    { label: 'Zahájeno', at: run.StartedAt, who: null, done: !!run.StartedAt },
    { label: run.ApprovalRequired ? 'Odesláno ke schválení' : 'Provedeno', at: run.SubmittedAt, who: run.CompletedBy, done: !!run.SubmittedAt },
    ...(run.ApprovalRequired ? [{ label: 'Schváleno', at: run.ApprovedAt, who: run.ApprovedBy, done: !!run.ApprovedAt }] : []),
    { label: 'Dokončeno', at: run.CompletedAt, who: null, done: run.WorkflowState === 'Completed' },
  ];
  return (
    <ol className="relative space-y-3 border-l border-line pl-5">
      {steps.map((s) => (
        <li key={s.label} className="relative">
          <span className={cx('absolute top-1 -left-[25px] size-2.5 rounded-full ring-4 ring-white', s.done ? 'bg-emerald-500' : 'bg-slate-300')} />
          <p className={cx('text-[13px] font-medium', s.done ? 'text-slate-800' : 'text-slate-400')}>{s.label}</p>
          <p className="text-xs text-slate-500">
            {s.at && s.done ? fmtDateTime(s.at) : '—'}
            {s.who && s.done ? ` · ${name(s.who)}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Execution({ run }: { run: ControlRun }) {
  const { store, session, ctx, run: exec, version, today } = useApp();
  const { name } = useUsers();
  const nav = useNavigate();
  const ver = store.versions.get(run.VersionId)!;
  const decision = canExecute(session, run);
  const review = canReview(session, run);
  const editable = decision.allowed && (run.WorkflowState === 'InProgress' || run.WorkflowState === 'Returned');
  const [form, setForm] = useState<ExecutionData>({ ChecklistResults: run.ChecklistResults, Result: run.Result, ResultComment: run.ResultComment, ExceptionReason: run.IsCorrection ? '' : run.ExceptionReason });
  const baseVersion = useRef(run.RowVersion);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [findingOpen, setFindingOpen] = useState(false);
  const live = store.runs.get(run.RunId)!;
  const staleByOther = live.RowVersion !== baseVersion.current && live.ModifiedBy !== session.user.Email;
  useEffect(() => {
    if (!dirty) {
      baseVersion.current = live.RowVersion;
      setForm({ ChecklistResults: live.ChecklistResults, Result: live.Result, ResultComment: live.ResultComment, ExceptionReason: live.IsCorrection ? '' : live.ExceptionReason });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.RowVersion]);

  const setItem = (i: number, patch: Partial<{ answer: ChecklistAnswer | null; comment: string }>) => {
    setDirty(true);
    setForm((f) => ({ ...f, ChecklistResults: f.ChecklistResults.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  };
  const check = validateSubmission({ ...live, ...form }, ver, store.documents.all(), store.findings.all());
  void version;

  const doSave = async () => {
    setBusy('save');
    const r = await exec(() => saveRunDraft(ctx, run.RunId, baseVersion.current, form), 'Rozpracované provedení uloženo.');
    if (r) {
      baseVersion.current = r.RowVersion;
      setDirty(false);
    }
    setBusy(null);
  };
  const doSubmit = async () => {
    setBusy('submit');
    const r = await exec(() => submitRun(ctx, run.RunId, baseVersion.current, form), run.ApprovalRequired ? 'Kontrola odeslána ke schválení.' : 'Kontrola dokončena, protokol vygenerován.');
    if (r) setDirty(false);
    setBusy(null);
  };

  if (run.WorkflowState === 'Planned') {
    return (
      <Card>
        <CardHeader title="Provedení zatím nebylo zahájeno" subtitle="Před zahájením se seznamte s metodikou na záložce Přehled." icon={Play} />
        {decision.allowed ? (
          <div className="flex flex-wrap items-center gap-3">
            <PaRef id="run.start" inline>
              <Button
                variant="primary"
                icon={Play}
                loading={busy === 'start'}
                disabled={run.ScheduledDate > today && false}
                onClick={async () => {
                  setBusy('start');
                  await exec(() => startRun(ctx, run.RunId, run.RowVersion), 'Provedení zahájeno.');
                  setBusy(null);
                }}
              >
                Zahájit provedení
              </Button>
            </PaRef>
            {run.ScheduledDate > today && <span className="text-[13px] text-amber-700">Běh je naplánován na {fmtDate(run.ScheduledDate)} – zahájení předem je možné.</span>}
          </div>
        ) : (
          <Notice tone="neutral" icon={Lock}>
            {decision.reason} Kontrolu provádí {name(run.AssignedOwnerEmail)}
            {run.BackupOwnerEmail ? ` (zástup ${name(run.BackupOwnerEmail)})` : ''}.
          </Notice>
        )}
      </Card>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {staleByOther && (
          <Notice tone="red" icon={AlertTriangle} title="Záznam mezitím změnil jiný uživatel" actions={<Button size="sm" onClick={() => { setDirty(false); baseVersion.current = live.RowVersion; setForm({ ChecklistResults: live.ChecklistResults, Result: live.Result, ResultComment: live.ResultComment, ExceptionReason: live.ExceptionReason }); }}>Načíst aktuální</Button>}>
            Změnil(a) {name(live.ModifiedBy)} {fmtDateTime(live.ModifiedAt)}. Uložení vašich změn by bylo odmítnuto (optimistická souběžnost – RowVersion).
          </Notice>
        )}
        {!editable && run.WorkflowState !== 'Submitted' && run.WorkflowState !== 'Completed' && (
          <Notice tone="neutral" icon={Lock}>
            {decision.reason ?? 'Režim pouze pro čtení.'}
          </Notice>
        )}
        <PaRef id="run.checklist">
          <Card>
            <CardHeader title="Kontrolní kroky" subtitle={`${form.ChecklistResults.filter((c) => c.answer).length} z ${form.ChecklistResults.length} vyplněno`} />
            <ol className="space-y-3">
              {form.ChecklistResults.map((c, i) => {
                const def = ver.ChecklistDefinition.find((d) => d.id === c.itemId);
                return (
                  <li key={c.itemId} className={cx('rounded-lg border p-3.5', c.answer === 'NOK' ? 'border-rose-200 bg-rose-50/40' : 'border-line')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-slate-800">
                          {i + 1}. {c.label} {c.required && <span className="text-rose-600">*</span>}
                        </p>
                        {def?.guidance && <p className="mt-0.5 text-xs text-slate-500">{def.guidance}</p>}
                      </div>
                      <div className="flex gap-1" role="radiogroup" aria-label={`Výsledek kroku ${i + 1}`}>
                        {(['OK', 'NOK', 'NA'] as ChecklistAnswer[]).map((a) => (
                          <button
                            key={a}
                            type="button"
                            role="radio"
                            aria-checked={c.answer === a}
                            disabled={!editable}
                            onClick={() => setItem(i, { answer: c.answer === a ? null : a })}
                            className={cx(
                              'h-8 rounded-md px-2.5 text-xs font-medium ring-1 ring-inset disabled:cursor-default',
                              c.answer === a
                                ? a === 'OK'
                                  ? 'bg-emerald-600 text-white ring-emerald-600'
                                  : a === 'NOK'
                                    ? 'bg-rose-600 text-white ring-rose-600'
                                    : 'bg-slate-600 text-white ring-slate-600'
                                : 'bg-white text-slate-600 ring-slate-300 enabled:hover:bg-slate-50',
                            )}
                          >
                            {ANSWER_LABELS[a]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(editable || c.comment) && (
                      <Textarea
                        rows={1}
                        className="mt-2 min-h-[36px] text-[13px]"
                        placeholder={c.answer === 'NOK' ? 'Popište nedostatek (povinné)' : 'Komentář (nepovinné)'}
                        value={c.comment}
                        disabled={!editable}
                        onChange={(e) => setItem(i, { comment: e.target.value })}
                        aria-label={`Komentář ke kroku ${i + 1}`}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>
        </PaRef>
        <PaRef id="run.result">
          <Card>
            <CardHeader title="Celkový výsledek" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Výsledek kontroly" required>
                <Select
                  value={form.Result ?? ''}
                  disabled={!editable}
                  onChange={(e) => {
                    setDirty(true);
                    setForm({ ...form, Result: (e.target.value || null) as RunResult | null });
                  }}
                >
                  <option value="">— vyberte —</option>
                  {Object.entries(RESULT_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              {form.Result === 'NotAssessable' && (
                <Field label="Důvod výjimky" required>
                  <Textarea rows={1} disabled={!editable} value={form.ExceptionReason} onChange={(e) => { setDirty(true); setForm({ ...form, ExceptionReason: e.target.value }); }} />
                </Field>
              )}
              <Field label="Komentář k výsledku" required={!!form.Result && form.Result !== 'NoFindings'} className="sm:col-span-2">
                <Textarea rows={3} disabled={!editable} value={form.ResultComment} onChange={(e) => { setDirty(true); setForm({ ...form, ResultComment: e.target.value }); }} />
              </Field>
            </div>
            {editable && form.Result && NEGATIVE_RESULTS.includes(form.Result) && (
              <Notice tone="amber" icon={ShieldAlert} className="mt-4" title="Negativní výsledek" actions={<PaRef id="run.findings" inline><Button size="sm" icon={FilePlus2} onClick={() => setFindingOpen(true)}>Založit nápravné opatření</Button></PaRef>}>
                Zaznamenejte zjištěné nedostatky jako nápravná opatření s odpovědnou osobou a termínem.
              </Notice>
            )}
          </Card>
        </PaRef>
        {run.WorkflowState === 'Submitted' && (
          <Card className={review.allowed ? 'border-violet-300' : ''}>
            <CardHeader title="Schválení" subtitle={`Odesláno ${fmtDateTime(run.SubmittedAt)} · provedl(a) ${name(run.CompletedBy)} · schvalovatel ${name(run.ReviewerEmail)}`} icon={UserCheck} />
            {review.allowed ? (
              <div className="space-y-3">
                <Field label="Komentář schvalovatele" hint="Při vrácení k doplnění je komentář povinný.">
                  <Textarea rows={2} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <PaRef id="run.approve" inline>
                    <Button variant="success" icon={CheckCircle2} loading={busy === 'approve'} onClick={async () => { setBusy('approve'); await exec(() => approveRun(ctx, run.RunId, live.RowVersion, reviewComment), 'Kontrola schválena, protokol vygenerován.'); setBusy(null); }}>
                      Schválit
                    </Button>
                  </PaRef>
                  <PaRef id="run.return" inline>
                    <Button icon={RotateCcw} disabled={!reviewComment.trim()} loading={busy === 'return'} onClick={async () => { setBusy('return'); await exec(() => returnRun(ctx, run.RunId, live.RowVersion, reviewComment), 'Kontrola vrácena k doplnění.'); setBusy(null); }}>
                      Vrátit k doplnění
                    </Button>
                  </PaRef>
                </div>
              </div>
            ) : (
              <Notice tone="violet" icon={Lock}>
                {review.reason}
              </Notice>
            )}
          </Card>
        )}
      </div>
      <div className="space-y-5">
        <Card className="xl:sticky xl:top-20">
          <CardHeader title="Kontrola před odesláním" />
          <ul className="space-y-2 text-[13px]">
            <CheckItem ok={!form.ChecklistResults.some((c) => c.required && !c.answer)} label="Povinné kroky vyplněny" />
            <CheckItem ok={!!form.Result} label="Celkový výsledek zvolen" />
            <CheckItem ok={check.missingEvidence.length === 0} label={check.missingEvidence.length ? `Chybí přílohy: ${check.missingEvidence.join(', ')}` : 'Povinné přílohy nahrány'} action={check.missingEvidence.length && editable ? <button className="text-xs font-medium text-brand-700 hover:underline" onClick={() => nav(`/runs/${run.RunId}?tab=attachments`)}>Nahrát</button> : undefined} />
            {form.Result && ['WithFindings', 'NotMet'].includes(form.Result) && <CheckItem ok={store.findings.all().some((f) => f.RunId === run.RunId)} label="Založeno zjištění" />}
          </ul>
          {editable && check.errors.length > 0 && (
            <ul className="mt-3 list-disc space-y-0.5 pl-4 text-xs text-rose-700">
              {check.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {editable && check.warnings.map((w) => <p key={w} className="mt-2 text-xs text-amber-700">{w}</p>)}
          {editable && (
            <div className="mt-4 flex flex-col gap-2">
              <PaRef id="run.submit">
                <Button variant="primary" className="w-full" icon={run.ApprovalRequired ? Send : CheckCircle2} disabled={check.errors.length > 0} loading={busy === 'submit'} onClick={doSubmit}>
                  {run.ApprovalRequired ? 'Odeslat ke schválení' : 'Dokončit kontrolu'}
                </Button>
              </PaRef>
              <PaRef id="run.save">
                <Button className="w-full" icon={Save} loading={busy === 'save'} disabled={!dirty} onClick={doSave}>
                  Uložit rozpracované
                </Button>
              </PaRef>
              <p className="text-[11.5px] leading-snug text-slate-500">
                {run.ApprovalRequired ? `Po odeslání posoudí kontrolu ${name(run.ReviewerEmail)}. Protokol vznikne po schválení.` : 'Po dokončení se automaticky vytvoří PDF protokol (FLOW-04).'}
              </p>
            </div>
          )}
          {run.WorkflowState === 'Completed' && (
            <Notice tone="teal" icon={Lock} className="mt-4">
              Dokončený běh je uzamčen. Opravu lze provést jen řízeně (Koordinátor / Administrátor) s novou verzí protokolu.
            </Notice>
          )}
        </Card>
      </div>
      <FindingDialog open={findingOpen} onClose={() => setFindingOpen(false)} run={live} />
    </div>
  );
}

function CheckItem({ ok, label, action }: { ok: boolean; label: string; action?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />}
      <span className={cx('flex-1', ok ? 'text-slate-700' : 'text-slate-800')}>{label}</span>
      {action}
    </li>
  );
}

function Attachments({ run }: { run: ControlRun }) {
  const { store, version, session, ctx, run: exec } = useApp();
  const { name } = useUsers();
  const ver = store.versions.get(run.VersionId);
  const [showRemoved, setShowRemoved] = useState(false);
  const [evidence, setEvidence] = useState<string>(ver?.RequiredEvidence[0]?.id ?? '');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const docs = useMemo(() => store.documents.filter((d) => d.RunId === run.RunId && d.DocumentType !== 'Protocol' && (showRemoved || !d.IsRemoved)), [store, version, run.RunId, showRemoved]);
  const canUpload = session.activeRole !== 'Auditor' && (isAssignee(run, session.user.Email) || ['Administrator', 'Coordinator'].includes(session.activeRole)) && ['Planned', 'InProgress', 'Returned'].includes(run.WorkflowState);
  const upload = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) await exec(() => uploadRunDocument(ctx, { run, file: f, fileName: f.name, evidenceDefId: evidence || null }), `Soubor ${f.name} nahrán.`);
  };
  return (
    <PaRef id="run.attachments">
      <Card>
        <CardHeader title="Přílohy a důkazy" subtitle={`Složka IC_ControlDocuments/${run.ControlCode}/${run.RunCode}/Evidence`} actions={<label className="flex items-center gap-2 text-[13px] text-slate-600"><input type="checkbox" className="accent-brand-600" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} /> Zobrazit odebrané</label>} />
        {canUpload && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void upload(e.dataTransfer.files);
            }}
            className={cx('mb-5 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-6 text-center sm:flex-row sm:text-left', drag ? 'border-brand-400 bg-brand-50' : 'border-slate-300 bg-slate-50/50')}
          >
            <Upload className="size-6 text-slate-400" />
            <div className="flex-1 text-[13px] text-slate-600">
              Přetáhněte soubory sem nebo je vyberte. Maximálně {MAX_FILE_SIZE / 1024 / 1024} MB na soubor. Soubory se ukládají lokálně (IndexedDB).
            </div>
            <Select className="w-auto max-w-[260px]" value={evidence} onChange={(e) => setEvidence(e.target.value)} aria-label="Typ dokumentu">
              {ver?.RequiredEvidence.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.mandatory ? ' (povinné)' : ''}
                </option>
              ))}
              <option value="">Ostatní příloha</option>
            </Select>
            <input ref={input} type="file" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
            <Button variant="primary" icon={Upload} onClick={() => input.current?.click()}>
              Vybrat soubory
            </Button>
          </div>
        )}
        <DataTable
          rows={docs}
          rowKey={(d) => d.DocumentId}
          emptyTitle="Zatím bez příloh"
          rowClassName={(d) => (d.IsRemoved ? 'opacity-50' : undefined)}
          columns={[
            { key: 'name', header: 'Soubor', sort: (d) => d.FileName, render: (d) => <span className="flex items-center gap-2 font-medium text-slate-800"><FileText className="size-4 text-slate-400" />{d.FileName}{d.Version > 1 && <Badge>v{d.Version}</Badge>}{d.IsRemoved && <Badge tone="red">odebráno</Badge>}</span> },
            { key: 'type', header: 'Požadovaný dokument', render: (d) => ver?.RequiredEvidence.find((e) => e.id === d.EvidenceDefId)?.name ?? DOCUMENT_TYPE_LABELS[d.DocumentType] },
            { key: 'size', header: 'Velikost', align: 'right', sort: (d) => d.FileSize, render: (d) => fmtSize(d.FileSize) },
            { key: 'at', header: 'Nahráno', sort: (d) => d.UploadedAt, render: (d) => <span className="whitespace-nowrap">{fmtDateTime(d.UploadedAt)}</span> },
            { key: 'by', header: 'Autor', render: (d) => name(d.UploadedBy) },
            {
              key: 'act',
              header: '',
              align: 'right',
              render: (d) => (
                <span className="inline-flex gap-1">
                  <Button size="sm" variant="ghost" icon={Download} onClick={async () => { const f = await getDocumentBlob(store, d.DocumentId); if (f) downloadBlob(f.blob, f.name); }}>
                    Stáhnout
                  </Button>
                  {!d.IsRemoved && canRemoveDocument(session, run, d.UploadedBy).allowed && (
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemoveId(d.DocumentId)} aria-label="Odebrat">
                      Odebrat
                    </Button>
                  )}
                </span>
              ),
            },
          ]}
        />
        <ConfirmDialog
          open={!!removeId}
          onClose={() => setRemoveId(null)}
          title="Odebrat přílohu?"
          tone="danger"
          confirmLabel="Odebrat"
          reasonLabel="Důvod odebrání"
          reasonRequired
          onConfirm={async (reason) => {
            const ok = await exec(() => removeDocument(ctx, removeId!, reason), 'Příloha odebrána.');
            if (ok !== undefined) setRemoveId(null);
          }}
        >
          Příloha se skryje (soft delete) – soubor i záznam zůstávají pro audit dohledatelné.
        </ConfirmDialog>
      </Card>
    </PaRef>
  );
}

function Findings({ run }: { run: ControlRun }) {
  const { store, version, session, today } = useApp();
  const { name } = useUsers();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const findings = useMemo(() => store.findings.filter((f) => f.RunId === run.RunId), [store, version, run.RunId]);
  const canCreate = session.activeRole !== 'Auditor' && (isAssignee(run, session.user.Email) || ['Administrator', 'Coordinator'].includes(session.activeRole) || run.ReviewerEmail === session.user.Email) && run.WorkflowState !== 'Cancelled';
  const editing = findings.find((f) => f.FindingId === edit);
  return (
    <PaRef id="run.findings">
      <Card>
        <CardHeader title="Zjištění a nápravná opatření" actions={canCreate && <Button variant="primary" icon={FilePlus2} onClick={() => setOpen(true)}>Nové zjištění</Button>} />
        {findings.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="K tomuto běhu nejsou evidována žádná zjištění" />
        ) : (
          <ul className="space-y-3">
            {findings.map((f) => (
              <li key={f.FindingId} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">{f.FindingCode}</span>
                      <SeverityBadge severity={f.Severity} />
                      <FindingStatusBadge status={f.Status} overdue={isFindingOverdue(f, today)} />
                    </div>
                    <p className="mt-1.5 text-[13.5px] font-medium text-slate-800">{f.FindingDescription}</p>
                    {f.CorrectiveAction && <p className="mt-0.5 text-[13px] text-slate-600">Opatření: {f.CorrectiveAction}</p>}
                    {f.ResolutionComment && <p className="mt-1 text-[13px] text-emerald-700">Vyřešení: {f.ResolutionComment}</p>}
                    <p className="mt-1.5 text-xs text-slate-500">
                      Odpovídá {name(f.ResponsiblePerson)} · termín {fmtDate(f.DueDate)} · založeno {fmtDateTime(f.CreatedAt)}
                      {f.ClosedAt && ` · uzavřeno ${fmtDateTime(f.ClosedAt)}`}
                    </p>
                  </div>
                  {session.activeRole !== 'Auditor' && (
                    <Button size="sm" icon={PenLine} onClick={() => setEdit(f.FindingId)}>
                      Upravit stav
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <FindingDialog open={open} onClose={() => setOpen(false)} run={run} />
        {editing && <FindingDialog open onClose={() => setEdit(null)} run={run} finding={editing} />}
      </Card>
    </PaRef>
  );
}

function Protocols({ run, protocols }: { run: ControlRun; protocols: ProtocolRecord[] }) {
  const { ctx, run: exec } = useApp();
  const { name } = useUsers();
  const [preview, setPreview] = useState<ProtocolRecord | null>(null);
  return (
    <PaRef id="run.protocols">
      <Card>
        <CardHeader title="Kontrolní protokoly" subtitle={`Složka IC_ControlDocuments/${run.ControlCode}/${run.RunCode}/Protocols · protokoly se vykreslují z neměnného snapshotu`} />
        {protocols.length === 0 ? (
          <EmptyState icon={FileText} title="Protokol zatím nevznikl" description={run.ApprovalRequired ? 'Protokol se vytvoří automaticky po finálním schválení.' : 'Protokol se vytvoří automaticky po dokončení kontroly.'} />
        ) : (
          <DataTable
            rows={protocols}
            rowKey={(p) => p.ProtocolId}
            columns={[
              { key: 'id', header: 'Protokol', render: (p) => <span className="font-mono text-xs">{p.ProtocolId}</span> },
              { key: 'v', header: 'Verze', render: (p) => `v${p.ProtocolVersion}` },
              { key: 'st', header: 'Stav', render: (p) => (p.Status === 'Valid' ? <Badge tone="green" icon={CheckCircle2}>Platný</Badge> : <Badge tone="neutral">Nahrazen ({p.SupersededBy})</Badge>) },
              { key: 'at', header: 'Vytvořen', render: (p) => <span className="whitespace-nowrap">{fmtDateTime(p.GeneratedAt)} · {name(p.GeneratedBy)}</span> },
              { key: 'hash', header: 'SHA-256', render: (p) => <span className="font-mono text-[11px] text-slate-500">{p.ContentHash.slice(0, 16)}…</span> },
              { key: 'pdf', header: 'PDF', render: (p) => (p.DocumentId ? <Badge tone="teal">uloženo</Badge> : <Badge>vykreslí se ze snapshotu</Badge>) },
              {
                key: 'a',
                header: '',
                align: 'right',
                render: (p) => (
                  <span className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" icon={Eye} onClick={() => setPreview(p)}>
                      Náhled
                    </Button>
                    <Button size="sm" variant="ghost" icon={Download} onClick={() => exec(() => downloadProtocol(ctx, p))}>
                      PDF
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        )}
        <ProtocolPreview protocol={preview} open={!!preview} onClose={() => setPreview(null)} />
      </Card>
    </PaRef>
  );
}
