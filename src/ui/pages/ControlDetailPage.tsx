/** Detail definice kontroly (stabilní identita + verze). Odlišeno od detailu běhu modrým pruhem „Definice“. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, BookOpen, Download, Eye, FileText, GitBranch, History, ListTree, Paperclip, PenLine, RefreshCw, RotateCcw, ShieldAlert, Layers } from 'lucide-react';
import { can } from '../../domain/permissions';
import { describeDueRule, describeRecurrence } from '../../domain/recurrence';
import { computeKpis, isFindingOverdue } from '../../domain/metrics';
import { addDays } from '../../domain/dates';
import { latestVersion, planArchive, versionForDate } from '../../domain/versioning';
import { PERIOD_MODE_LABELS, PRIORITY_LABELS, SHIFT_LABELS, DOCUMENT_TYPE_LABELS } from '../../domain/labels';
import type { ControlVersion, ProtocolRecord } from '../../domain/types';
import { archiveControl, generateOccurrences, reactivateControl } from '../../services/controlService';
import { getDocumentBlob } from '../../services/documentService';
import { useApp } from '../AppContext';
import { useLookups, useUsers } from '../hooks';
import { AuditTable } from '../components/AuditTable';
import { ConfirmDialog } from '../components/Dialog';
import { DataTable } from '../components/DataTable';
import { PaRef } from '../components/PaRef';
import { RunTable } from '../components/RunTable';
import { ActiveBadge, RiskBadge } from '../components/StatusBadges';
import { Badge, Button, Card, CardHeader, DescriptionList, EmptyState, Notice, PageHeader, Segmented, Tabs } from '../components/ui';
import { ControlWizard } from '../dialogs/ControlWizard';
import { ProtocolPreview, downloadProtocol } from '../dialogs/SnapshotPreviews';
import { FindingsList } from './FindingsPage';
import { downloadBlob } from '../download';
import { fmtDate, fmtDateTime, fmtPct, fmtSize } from '../format';

type Tab = 'overview' | 'runs' | 'versions' | 'attachments' | 'findings' | 'protocols' | 'audit';

export function ControlDetailPage() {
  const { controlId } = useParams();
  const [sp, setSp] = useSearchParams();
  const { store, version, session, today, ctx, run: exec } = useApp();
  const nav = useNavigate();
  const { name } = useUsers();
  const { deptLabel, catLabel } = useLookups();
  const control = controlId ? store.controls.get(controlId) : undefined;
  const tab = (sp.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => setSp(t === 'overview' ? {} : { tab: t }, { replace: true });
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [runFilter, setRunFilter] = useState<'all' | 'past' | 'future' | 'open'>('all');
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [preview, setPreview] = useState<ProtocolRecord | null>(null);

  const d = useMemo(() => {
    if (!control) return null;
    const versions = store.versions.filter((v) => v.ControlId === control.ControlId).sort((a, b) => b.VersionNumber - a.VersionNumber);
    const runs = store.runs.filter((r) => r.ControlId === control.ControlId);
    return {
      versions,
      runs,
      current: versionForDate(versions, today) ?? latestVersion(versions)!,
      latest: latestVersion(versions)!,
      docs: store.documents.filter((x) => x.ControlId === control.ControlId),
      findings: store.findings.filter((f) => f.ControlId === control.ControlId),
      protocols: store.protocols.filter((p) => p.ControlId === control.ControlId).sort((a, b) => b.GeneratedAt.localeCompare(a.GeneratedAt)),
      audit: store.audit.filter((a) => a.ControlId === control.ControlId),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, control, today]);

  if (!control || !d) return <EmptyState title="Kontrola nebyla nalezena" action={<Button onClick={() => nav('/controls')}>Do registru</Button>} />;
  const v = d.current;
  const manage = can(session, 'manageControls');
  const live = d.runs.filter((r) => !r.IsSuperseded);
  const next = live.filter((r) => r.IsOpen && r.DueDate >= today).sort((a, b) => a.DueDate.localeCompare(b.DueDate))[0];
  const k12 = computeKpis(live, { from: addDays(today, -365), to: today }, today);
  const openFindings = d.findings.filter((f) => f.Status !== 'Closed').length;
  const archivePlan = planArchive(d.runs, today);
  const runsShown = d.runs
    .filter((r) => showSuperseded || !r.IsSuperseded)
    .filter((r) => (runFilter === 'past' ? r.DueDate < today : runFilter === 'future' ? r.DueDate >= today : runFilter === 'open' ? r.IsOpen : true));

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Registr kontrol', to: '/controls' }, { label: control.ControlCode }]}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="blue" icon={BookOpen}>
              Definice kontroly
            </Badge>
            <span className="font-mono text-xs text-slate-500">{control.ControlCode}</span>
            <ActiveBadge active={control.IsActive} />
            <RiskBadge risk={v.RiskLevel} />
          </span>
        }
        title={control.Name}
        subtitle={`${catLabel(control.Category)} · ${deptLabel(control.Department)} · ${describeRecurrence(v)}`}
        actions={
          manage && (
            <>
              {control.IsActive && (
                <PaRef id="ctl.edit" inline>
                  <Button variant="primary" icon={PenLine} onClick={() => setEditOpen(true)}>
                    Upravit definici
                  </Button>
                </PaRef>
              )}
              {control.IsActive && (
                <PaRef id="ctl.generate" inline>
                  <Button icon={RefreshCw} onClick={() => exec(() => generateOccurrences(ctx, { controlIds: [control.ControlId], trigger: 'Ruční doplnění výskytů' }), (r) => (r.created ? `Doplněno ${r.created} výskytů (horizont do ${fmtDate(r.horizon)}).` : `Žádné nové výskyty – vše do ${fmtDate(r.horizon)} již existuje (${r.skipped} přeskočeno).`))}>
                    Vygenerovat výskyty
                  </Button>
                </PaRef>
              )}
              <PaRef id="ctl.archive" inline>
                {control.IsActive ? (
                  <Button icon={Archive} variant="ghost" onClick={() => setArchiveOpen(true)}>
                    Archivovat
                  </Button>
                ) : (
                  <Button icon={RotateCcw} onClick={() => setReactivateOpen(true)}>
                    Reaktivovat
                  </Button>
                )}
              </PaRef>
            </>
          )
        }
      />
      <PaRef id="ctl.header">
        <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-[var(--shadow-card)] md:grid-cols-3 xl:grid-cols-6">
          {[
            ['Odpovědná osoba', name(v.PrimaryOwnerEmail)],
            ['Nejbližší termín', next ? <Link key="n" className="text-brand-700 hover:underline" to={`/runs/${next.RunId}`}>{fmtDate(next.DueDate)} · {next.RunCode}</Link> : '—'],
            ['Platná verze', `v${v.VersionNumber} od ${fmtDate(v.EffectiveFrom)}${d.latest.VersionId !== v.VersionId ? ` (v${d.latest.VersionNumber} od ${fmtDate(d.latest.EffectiveFrom)})` : ''}`],
            ['Včasnost (12 měs.)', `${fmtPct(k12.onTimeRate, 1)} · ${k12.onTime}/${k12.evaluable}`],
            ['Po termínu', `${k12.overdueOpen}`],
            ['Otevřená zjištění', `${openFindings}`],
          ].map(([k, val], i) => (
            <div key={i} className="bg-white px-4 py-3">
              <p className="text-[11.5px] font-medium text-slate-500">{k}</p>
              <div className="mt-1 text-[13.5px] text-slate-800">{val}</div>
            </div>
          ))}
        </div>
      </PaRef>
      <Notice tone="blue" icon={BookOpen} className="mb-3">
        Upravujete <b>definici kontroly</b> – změna metodiky, osob nebo plánu vytvoří novou verzi s datem účinnosti a dotkne se jen budoucích výskytů. Provedení za konkrétní období otevřete v záložce Historie běhů.
      </Notice>
      {!control.IsActive && (
        <Notice tone="neutral" icon={Archive} className="mb-3" title={`Archivováno ${fmtDateTime(control.ArchivedAt)}`}>
          {control.ArchiveReason}
        </Notice>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Přehled', icon: Eye },
          { value: 'runs', label: 'Historie běhů', icon: ListTree, count: live.length },
          { value: 'versions', label: 'Verze', icon: GitBranch, count: d.versions.length },
          { value: 'attachments', label: 'Přílohy', icon: Paperclip, count: d.docs.filter((x) => !x.IsRemoved && x.DocumentType !== 'Protocol').length },
          { value: 'findings', label: 'Nápravná opatření', icon: ShieldAlert, count: d.findings.length },
          { value: 'protocols', label: 'Protokoly', icon: FileText, count: d.protocols.length },
          { value: 'audit', label: 'Auditní historie', icon: History, count: d.audit.length },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Popis, účel a metodika" subtitle={`Verze v${v.VersionNumber} · ${v.ChangeReason || 'bez poznámky'}`} />
            <div className="space-y-4 text-[13.5px]">
              <DescriptionList columns={1} items={[{ label: 'Cíl kontroly', value: v.ControlObjective }, { label: 'Popis', value: v.Description }]} />
              <div>
                <p className="text-xs font-medium text-slate-500">Postup</p>
                <p className="mt-1 whitespace-pre-line text-slate-800">{v.Instructions}</p>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">Kontrolní kroky</p>
                <ol className="list-decimal space-y-1 pl-5">
                  {v.ChecklistDefinition.map((c) => (
                    <li key={c.id}>
                      {c.label} {!c.required && <span className="text-xs text-slate-400">(nepovinné)</span>}
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">Požadované dokumenty</p>
                {v.RequiredEvidence.length ? (
                  <ul className="space-y-1">
                    {v.RequiredEvidence.map((e) => (
                      <li key={e.id} className="flex items-center gap-2">
                        <Paperclip className="size-3.5 text-slate-400" />
                        {e.name} {e.mandatory ? <Badge tone="amber">povinné</Badge> : <Badge>doporučené</Badge>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500">Žádné.</p>
                )}
              </div>
            </div>
          </Card>
          <div className="space-y-5">
            <Card>
              <CardHeader title="Odpovědnosti" />
              <DescriptionList
                columns={1}
                items={[
                  { label: 'Odpovědná osoba', value: name(v.PrimaryOwnerEmail) },
                  { label: 'Zástupce', value: name(v.BackupOwnerEmail) },
                  { label: 'Schvalovatel', value: v.ApprovalRequired ? `${name(v.ReviewerEmail)} (princip čtyř očí)` : 'Bez schvalování' },
                  { label: 'Priorita', value: PRIORITY_LABELS[v.Priority] },
                ]}
              />
            </Card>
            <Card>
              <CardHeader title="Harmonogram" />
              <DescriptionList
                columns={1}
                items={[
                  { label: 'Opakování', value: describeRecurrence(v) },
                  { label: 'První výskyt / ukončení', value: `${fmtDate(v.RecurrenceSettings.startDate)} / ${v.RecurrenceSettings.endDate ? fmtDate(v.RecurrenceSettings.endDate) : 'bez ukončení'}` },
                  { label: 'Termín splnění', value: describeDueRule(v.DueDateRule) },
                  { label: 'Nepracovní den', value: SHIFT_LABELS[v.RecurrenceSettings.nonWorkingDayShift] },
                  { label: 'Kontrolované období', value: PERIOD_MODE_LABELS[v.RecurrenceSettings.periodMode] },
                  { label: 'Upozornění', value: v.ReminderPolicy.useGlobal ? 'Globální pravidla' : `Před termínem ${v.ReminderPolicy.daysBefore.join(', ')} · po termínu ${v.ReminderPolicy.overdueDays.join(', ')} · eskalace ${v.ReminderPolicy.escalationAfterDays} dní` },
                ]}
              />
            </Card>
          </div>
        </div>
      )}

      {tab === 'runs' && (
        <PaRef id="ctl.runs">
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Segmented
                value={runFilter}
                onChange={setRunFilter}
                options={[
                  { value: 'all', label: 'Vše' },
                  { value: 'past', label: 'Minulé' },
                  { value: 'future', label: 'Budoucí' },
                  { value: 'open', label: 'Otevřené' },
                ]}
              />
              <label className="flex items-center gap-2 text-[13px] text-slate-600">
                <input type="checkbox" className="accent-brand-600" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} /> Zobrazit nahrazené výskyty
              </label>
            </div>
            <RunTable runs={runsShown} showControl={false} exportName={`${control.ControlCode}-behy`} initialSort={{ key: 'due', dir: 'desc' }} />
          </Card>
        </PaRef>
      )}

      {tab === 'versions' && (
        <PaRef id="ctl.versions">
          <div className="space-y-3">
            {d.versions.map((ver, i) => (
              <VersionCard key={ver.VersionId} v={ver} prev={d.versions[i + 1]} isCurrent={ver.VersionId === v.VersionId} runCount={d.runs.filter((r) => r.VersionId === ver.VersionId && !r.IsSuperseded).length} />
            ))}
          </div>
        </PaRef>
      )}

      {tab === 'attachments' && (
        <Card>
          <CardHeader title="Dokumenty ke kontrole" subtitle={`IC_ControlDocuments/${control.ControlCode} – všechny běhy`} />
          <DataTable
            rows={d.docs.filter((x) => !x.IsRemoved)}
            rowKey={(x) => x.DocumentId}
            initialSort={{ key: 'at', dir: 'desc' }}
            emptyTitle="Žádné dokumenty"
            columns={[
              { key: 'name', header: 'Soubor', sort: (x) => x.FileName, render: (x) => <span className="font-medium text-slate-800">{x.FileName}</span> },
              { key: 'run', header: 'Běh', sort: (x) => x.RunCode ?? '', render: (x) => (x.RunId ? <Link className="font-mono text-xs text-brand-700 hover:underline" to={`/runs/${x.RunId}?tab=attachments`}>{x.RunCode}</Link> : '—') },
              { key: 'type', header: 'Typ', render: (x) => <Badge tone={x.DocumentType === 'Protocol' ? 'teal' : 'neutral'}>{DOCUMENT_TYPE_LABELS[x.DocumentType]}</Badge> },
              { key: 'size', header: 'Velikost', align: 'right', sort: (x) => x.FileSize, render: (x) => fmtSize(x.FileSize) },
              { key: 'at', header: 'Nahráno', sort: (x) => x.UploadedAt, render: (x) => <span className="whitespace-nowrap">{fmtDateTime(x.UploadedAt)}</span> },
              { key: 'by', header: 'Autor', render: (x) => name(x.UploadedBy) },
              { key: 'dl', header: '', align: 'right', render: (x) => <Button size="sm" variant="ghost" icon={Download} onClick={async () => { const f = await getDocumentBlob(store, x.DocumentId); if (f) downloadBlob(f.blob, f.name); }}>Stáhnout</Button> },
            ]}
          />
        </Card>
      )}

      {tab === 'findings' && (
        <Card>
          <CardHeader title="Zjištění a nápravná opatření" subtitle={`${openFindings} otevřených · ${d.findings.filter((f) => isFindingOverdue(f, today)).length} po termínu`} />
          <FindingsList findings={d.findings} compact />
        </Card>
      )}

      {tab === 'protocols' && (
        <Card>
          <CardHeader title="Historické protokoly" subtitle="Každý protokol je neměnný snapshot – změna metodiky je zpětně nepřegeneruje." />
          <DataTable
            rows={d.protocols}
            rowKey={(p) => p.ProtocolId}
            emptyTitle="Zatím žádné protokoly"
            columns={[
              { key: 'id', header: 'Protokol', sort: (p) => p.ProtocolId, render: (p) => <span className="font-mono text-xs">{p.ProtocolId}</span> },
              { key: 'run', header: 'Běh', render: (p) => <Link className="font-mono text-xs text-brand-700 hover:underline" to={`/runs/${p.RunId}?tab=protocols`}>{p.SnapshotData.run.runCode}</Link> },
              { key: 'res', header: 'Výsledek', render: (p) => p.SnapshotData.run.result && <Badge tone={p.SnapshotData.run.result === 'NoFindings' ? 'green' : 'amber'}>{p.SnapshotData.run.result === 'NoFindings' ? 'Bez zjištění' : 'Se zjištěním / výjimkou'}</Badge> },
              { key: 'ver', header: 'Metodika', render: (p) => `v${p.SnapshotData.version.number}` },
              { key: 'st', header: 'Stav', render: (p) => (p.Status === 'Valid' ? <Badge tone="green">Platný</Badge> : <Badge>Nahrazen</Badge>) },
              { key: 'at', header: 'Vytvořen', sort: (p) => p.GeneratedAt, render: (p) => <span className="whitespace-nowrap">{fmtDateTime(p.GeneratedAt)}</span> },
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
          <ProtocolPreview protocol={preview} open={!!preview} onClose={() => setPreview(null)} />
        </Card>
      )}

      {tab === 'audit' && (
        <Card>
          <AuditTable entries={d.audit} />
        </Card>
      )}

      <ControlWizard open={editOpen} onClose={() => setEditOpen(false)} controlId={control.ControlId} />
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={`Archivovat ${control.ControlCode}?`}
        tone="danger"
        confirmLabel="Archivovat"
        reasonLabel="Důvod archivace"
        reasonRequired
        minReason={5}
        onConfirm={async (reason) => {
          const ok = await exec(() => archiveControl(ctx, control.ControlId, reason, control.RowVersion), (p) => `Kontrola archivována, zrušeno ${p.toCancel.length} budoucích výskytů.`);
          if (ok) setArchiveOpen(false);
        }}
      >
        <p>Kontrola se nemaže – zůstane v registru jako archivovaná včetně celé historie, protokolů a auditní stopy.</p>
        <ul className="mt-2 list-disc pl-5">
          <li>{archivePlan.toCancel.length} naplánovaných budoucích výskytů bude zrušeno.</li>
          <li>{archivePlan.remainOpen.length} rozpracovaných nebo po termínu zůstane otevřených – dořešte je ručně.</li>
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={reactivateOpen}
        onClose={() => setReactivateOpen(false)}
        title={`Reaktivovat ${control.ControlCode}?`}
        confirmLabel="Reaktivovat"
        reasonLabel="Důvod reaktivace"
        reasonRequired
        minReason={5}
        onConfirm={async (reason) => {
          const ok = await exec(() => reactivateControl(ctx, control.ControlId, reason, control.RowVersion), (r) => `Kontrola reaktivována, vygenerováno ${r.created} výskytů.`);
          if (ok) setReactivateOpen(false);
        }}
      >
        Výskyty se vygenerují od dnešního dne na plánovací horizont podle poslední verze definice.
      </ConfirmDialog>
    </div>
  );
}

function VersionCard({ v, prev, isCurrent, runCount }: { v: ControlVersion; prev?: ControlVersion; isCurrent: boolean; runCount: number }) {
  const { name } = useUsers();
  const [open, setOpen] = useState(false);
  const fields: Array<[keyof ControlVersion, string, (x: ControlVersion) => string]> = [
    ['ControlName', 'Název', (x) => x.ControlName],
    ['RiskLevel', 'Rizikovost', (x) => x.RiskLevel],
    ['PrimaryOwnerEmail', 'Odpovědná osoba', (x) => name(x.PrimaryOwnerEmail)],
    ['BackupOwnerEmail', 'Zástupce', (x) => name(x.BackupOwnerEmail)],
    ['ReviewerEmail', 'Schvalovatel', (x) => name(x.ReviewerEmail)],
    ['ApprovalRequired', 'Schvalování', (x) => (x.ApprovalRequired ? 'Ano' : 'Ne')],
    ['RecurrenceSettings', 'Opakování', (x) => describeRecurrence(x)],
    ['DueDateRule', 'Termín', (x) => describeDueRule(x.DueDateRule)],
    ['ChecklistDefinition', 'Kontrolní kroky', (x) => `${x.ChecklistDefinition.length} kroků`],
    ['RequiredEvidence', 'Dokumenty', (x) => x.RequiredEvidence.map((e) => e.name).join(', ') || '—'],
    ['Instructions', 'Metodika', (x) => (x.Instructions.length > 60 ? `${x.Instructions.slice(0, 60)}…` : x.Instructions)],
  ];
  const diffs = prev ? fields.filter(([k]) => JSON.stringify(prev[k]) !== JSON.stringify(v[k])) : [];
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 font-semibold text-brand-700">v{v.VersionNumber}</span>
          <div>
            <p className="text-[14px] font-semibold text-slate-900">
              Účinná {fmtDate(v.EffectiveFrom)} – {v.EffectiveTo ? fmtDate(v.EffectiveTo) : 'dosud'} {isCurrent && <Badge tone="teal">platná dnes</Badge>}
            </p>
            <p className="text-[13px] text-slate-500">
              {v.ChangeReason || '—'} · {name(v.CreatedBy)}, {fmtDateTime(v.CreatedAt)} · {runCount} běhů
            </p>
          </div>
        </div>
        {prev && (
          <Button size="sm" variant="ghost" icon={Layers} onClick={() => setOpen(!open)}>
            {open ? 'Skrýt rozdíly' : `Rozdíly oproti v${prev.VersionNumber} (${diffs.length})`}
          </Button>
        )}
      </div>
      {open && prev && (
        <table className="mt-4 w-full text-[13px]">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 font-medium">Pole</th>
              <th className="py-1 font-medium">v{prev.VersionNumber}</th>
              <th className="py-1 font-medium">v{v.VersionNumber}</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map(([k, label, f]) => (
              <tr key={String(k)} className="border-t border-line/70">
                <td className="py-1.5 pr-3 text-slate-500">{label}</td>
                <td className="py-1.5 pr-3 text-slate-500 line-through">{f(prev)}</td>
                <td className="py-1.5 font-medium text-slate-900">{f(v)}</td>
              </tr>
            ))}
            {diffs.length === 0 && (
              <tr>
                <td colSpan={3} className="py-2 text-slate-500">
                  Bez změn sledovaných polí (změna popisu nebo upozornění).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}
