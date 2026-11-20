import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, LayoutGrid, Plus, Rows3, Search } from 'lucide-react';
import { can } from '../../domain/permissions';
import { describeRecurrence } from '../../domain/recurrence';
import { latestVersion } from '../../domain/versioning';
import { RECURRENCE_LABELS, RISK_LABELS, RISK_WEIGHT } from '../../domain/labels';
import type { Control, ControlRun, ControlVersion } from '../../domain/types';
import { useApp } from '../AppContext';
import { useLookups, useUsers } from '../hooks';
import { DataTable } from '../components/DataTable';
import { MultiSelect } from '../components/Popover';
import { PaRef } from '../components/PaRef';
import { ActiveBadge, RiskBadge } from '../components/StatusBadges';
import { Button, Card, Checkbox, Input, PageHeader, Segmented } from '../components/ui';
import { ControlWizard } from '../dialogs/ControlWizard';
import { downloadCsv } from '../download';
import { fmtDate, fmtRelative } from '../format';

interface Row {
  control: Control;
  version: ControlVersion;
  next: ControlRun | null;
  overdue: number;
}

export function RegisterPage() {
  const { store, version, session, today } = useApp();
  const nav = useNavigate();
  const { departments, categories, deptLabel, catLabel } = useLookups();
  const { users, name } = useUsers();
  const [q, setQ] = useState('');
  const [depts, setDepts] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [freqs, setFreqs] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [mode, setMode] = useState<'table' | 'cards'>('table');
  const [wizard, setWizard] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const versions = store.versions.all();
    const runsByControl = new Map<string, ControlRun[]>();
    for (const r of store.runs.all()) if (!r.IsSuperseded) runsByControl.set(r.ControlId, [...(runsByControl.get(r.ControlId) ?? []), r]);
    return store.controls.all().map((c) => {
      const runs = runsByControl.get(c.ControlId) ?? [];
      const next = runs.filter((r) => r.IsOpen && r.WorkflowState !== 'Submitted' && r.DueDate >= today).sort((a, b) => a.DueDate.localeCompare(b.DueDate))[0] ?? null;
      return {
        control: c,
        version: latestVersion(versions.filter((v) => v.ControlId === c.ControlId))!,
        next,
        overdue: runs.filter((r) => ['Planned', 'InProgress', 'Returned'].includes(r.WorkflowState) && r.DueDate < today).length,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, today]);

  const filtered = rows.filter(({ control: c, version: v }) => {
    const s = q.trim().toLowerCase();
    return (
      (showArchived || c.IsActive) &&
      (!s || c.ControlCode.toLowerCase().includes(s) || c.Name.toLowerCase().includes(s) || v.Description.toLowerCase().includes(s)) &&
      (depts.length === 0 || depts.includes(c.Department)) &&
      (cats.length === 0 || cats.includes(c.Category)) &&
      (risks.length === 0 || risks.includes(v.RiskLevel)) &&
      (freqs.length === 0 || freqs.includes(v.RecurrenceType)) &&
      (owners.length === 0 || owners.includes(v.PrimaryOwnerEmail))
    );
  });

  const exportCsv = () =>
    downloadCsv(
      'registr-kontrol.csv',
      ['Kód', 'Název', 'Oblast', 'Útvar', 'Odpovědná osoba', 'Zástupce', 'Schvalovatel', 'Frekvence', 'Pravidlo', 'Nejbližší termín', 'Rizikovost', 'Stav', 'Verze'],
      filtered.map(({ control: c, version: v, next }) => [
        c.ControlCode,
        c.Name,
        catLabel(c.Category),
        deptLabel(c.Department),
        name(v.PrimaryOwnerEmail),
        name(v.BackupOwnerEmail),
        name(v.ReviewerEmail),
        RECURRENCE_LABELS[v.RecurrenceType],
        describeRecurrence(v),
        next?.DueDate ?? '',
        RISK_LABELS[v.RiskLevel],
        c.IsActive ? 'Aktivní' : 'Archivováno',
        v.VersionNumber,
      ]),
    );

  return (
    <div>
      <PageHeader
        title="Registr kontrol"
        subtitle="Centrální katalog definic kontrol. Každá kontrola má stabilní identitu (kód CTRL-xxxx) a historii verzí."
        actions={
          <>
            <PaRef id="reg.export" inline>
              <Button icon={Download} onClick={exportCsv}>
                Export CSV
              </Button>
            </PaRef>
            {can(session, 'manageControls') && (
              <PaRef id="reg.new" inline>
                <Button variant="primary" icon={Plus} onClick={() => setWizard(true)}>
                  Nová kontrola
                </Button>
              </PaRef>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 shadow-[var(--shadow-card)]">
        <PaRef id="reg.search" className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
          <Input className="pl-9" placeholder="Kód, název nebo popis…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Vyhledat v registru" />
        </PaRef>
        <MultiSelect label="Útvar" value={depts} onChange={setDepts} options={departments.map((d) => ({ value: d.Code, label: d.Label }))} />
        <MultiSelect label="Oblast" value={cats} onChange={setCats} options={categories.map((d) => ({ value: d.Code, label: d.Label }))} />
        <MultiSelect label="Osoba" value={owners} onChange={setOwners} options={users.map((u) => ({ value: u.Email, label: u.DisplayName }))} />
        <MultiSelect label="Frekvence" value={freqs} onChange={setFreqs} options={Object.entries(RECURRENCE_LABELS).map(([k, l]) => ({ value: k, label: l }))} />
        <MultiSelect label="Riziko" value={risks} onChange={setRisks} options={Object.entries(RISK_LABELS).map(([k, l]) => ({ value: k, label: l }))} width={200} />
        <Checkbox label="Archivované" checked={showArchived} onChange={setShowArchived} />
        <div className="ml-auto">
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'table', label: 'Tabulka', icon: Rows3 },
              { value: 'cards', label: 'Karty', icon: LayoutGrid },
            ]}
          />
        </div>
      </div>

      {mode === 'table' ? (
        <PaRef id="reg.table">
          <Card>
            <DataTable
              rows={filtered}
              rowKey={(r) => r.control.ControlId}
              onRowClick={(r) => nav(`/controls/${r.control.ControlId}`)}
              initialSort={{ key: 'code', dir: 'asc' }}
              pageSize={50}
              emptyTitle="Žádná kontrola neodpovídá filtrům"
              rowClassName={(r) => (r.control.IsActive ? undefined : 'opacity-60')}
              columns={[
                { key: 'code', header: 'Kód', sort: (r) => r.control.ControlCode, render: (r) => <span className="font-mono text-xs whitespace-nowrap text-slate-600">{r.control.ControlCode}</span> },
                { key: 'name', header: 'Název / oblast', sort: (r) => r.control.Name, render: (r) => <div className="min-w-[260px]"><p className="font-medium leading-snug text-slate-800">{r.control.Name}</p><p className="text-xs text-slate-500">{catLabel(r.control.Category)}</p></div> },
                { key: 'dept', header: 'Útvar', sort: (r) => deptLabel(r.control.Department), render: (r) => <span className="text-slate-600">{deptLabel(r.control.Department)}</span> },
                { key: 'owner', header: 'Odpovědná osoba', sort: (r) => name(r.version.PrimaryOwnerEmail), render: (r) => <span className="whitespace-nowrap">{name(r.version.PrimaryOwnerEmail)}</span> },
                { key: 'freq', header: 'Frekvence', sort: (r) => r.version.RecurrenceType, render: (r) => <span className="text-slate-600" title={describeRecurrence(r.version)}>{RECURRENCE_LABELS[r.version.RecurrenceType]}{r.version.RecurrenceInterval > 1 ? ` (×${r.version.RecurrenceInterval})` : ''}</span> },
                {
                  key: 'next',
                  header: 'Nejbližší výskyt',
                  sort: (r) => r.next?.DueDate ?? '9999',
                  render: (r) =>
                    r.next ? (
                      <span className="whitespace-nowrap tabular">
                        {fmtDate(r.next.DueDate)} <span className="block text-xs text-slate-400">{fmtRelative(r.next.DueDate, today)}</span>
                        {r.overdue > 0 && <span className="block text-xs font-medium text-rose-600">+ {r.overdue} po termínu</span>}
                      </span>
                    ) : (
                      '—'
                    ),
                },
                { key: 'risk', header: 'Rizikovost', sort: (r) => RISK_WEIGHT[r.version.RiskLevel], render: (r) => <RiskBadge risk={r.version.RiskLevel} /> },
                { key: 'active', header: 'Stav', sort: (r) => (r.control.IsActive ? 0 : 1), render: (r) => <ActiveBadge active={r.control.IsActive} /> },
              ]}
            />
          </Card>
        </PaRef>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered
            .sort((a, b) => a.control.ControlCode.localeCompare(b.control.ControlCode))
            .map((r) => (
              <button key={r.control.ControlId} onClick={() => nav(`/controls/${r.control.ControlId}`)} className="flex flex-col rounded-xl border border-line bg-white p-4 text-left shadow-[var(--shadow-card)] transition hover:border-brand-300 hover:shadow-md">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-slate-500">{r.control.ControlCode}</span>
                  <span className="flex gap-1">
                    <RiskBadge risk={r.version.RiskLevel} />
                    {!r.control.IsActive && <ActiveBadge active={false} />}
                  </span>
                </div>
                <p className="text-[14.5px] leading-snug font-semibold text-slate-900">{r.control.Name}</p>
                <p className="mt-1 line-clamp-2 text-[13px] text-slate-500">{r.version.Description}</p>
                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
                  <span className="text-slate-500">
                    {deptLabel(r.control.Department)}
                    <br />
                    <span className="text-slate-700">{name(r.version.PrimaryOwnerEmail)}</span>
                  </span>
                  <span className="text-right text-slate-500">
                    {describeRecurrence(r.version)}
                    <br />
                    <span className="text-slate-700">{r.next ? `termín ${fmtDate(r.next.DueDate)}` : '—'}</span>
                  </span>
                </div>
              </button>
            ))}
        </div>
      )}
      <ControlWizard open={wizard} onClose={() => setWizard(false)} onSaved={(id) => nav(`/controls/${id}`)} />
    </div>
  );
}
