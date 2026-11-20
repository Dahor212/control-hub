import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { isFindingOverdue } from '../../domain/metrics';
import { FINDING_STATUS_LABELS, SEVERITY_LABELS } from '../../domain/labels';
import type { Finding } from '../../domain/types';
import { useApp } from '../AppContext';
import { useLookups, useScopedRuns, useUsers } from '../hooks';
import { DataTable } from '../components/DataTable';
import { MultiSelect } from '../components/Popover';
import { FindingStatusBadge, SeverityBadge } from '../components/StatusBadges';
import { Button, Card, Input, PageHeader, Segmented } from '../components/ui';
import { downloadCsv } from '../download';
import { fmtDate } from '../format';

export function FindingsList({ findings, compact }: { findings: Finding[]; compact?: boolean }) {
  const nav = useNavigate();
  const { today } = useApp();
  const { name } = useUsers();
  const { deptLabel } = useLookups();
  return (
    <DataTable
      rows={findings}
      rowKey={(f) => f.FindingId}
      onRowClick={(f) => nav(`/runs/${f.RunId}?tab=findings`)}
      initialSort={{ key: 'due', dir: 'asc' }}
      pageSize={compact ? 10 : 25}
      emptyTitle="Žádná zjištění"
      columns={[
        { key: 'code', header: 'Kód', sort: (f) => f.FindingCode, render: (f) => <span className="font-mono text-xs whitespace-nowrap">{f.FindingCode}</span> },
        { key: 'control', header: 'Kontrola', sort: (f) => f.ControlCode, render: (f) => <span className="font-mono text-xs">{f.ControlCode}</span> },
        {
          key: 'desc',
          header: 'Zjištění / opatření',
          render: (f) => (
            <div className="min-w-[260px]">
              <p className="leading-snug text-slate-800">{f.FindingDescription}</p>
              {f.CorrectiveAction && <p className="text-xs text-slate-500">Opatření: {f.CorrectiveAction}</p>}
            </div>
          ),
        },
        { key: 'sev', header: 'Závažnost', sort: (f) => ['Low', 'Medium', 'High', 'Critical'].indexOf(f.Severity), render: (f) => <SeverityBadge severity={f.Severity} /> },
        { key: 'resp', header: 'Odpovědná osoba', sort: (f) => name(f.ResponsiblePerson), render: (f) => <span className="whitespace-nowrap">{name(f.ResponsiblePerson)}</span> },
        ...(compact ? [] : [{ key: 'dept', header: 'Útvar', hideBelow: 'lg' as const, render: (f: Finding) => deptLabel(f.Department) }]),
        { key: 'due', header: 'Termín', sort: (f) => f.DueDate, render: (f) => <span className="whitespace-nowrap tabular">{fmtDate(f.DueDate)}</span> },
        { key: 'status', header: 'Stav', sort: (f) => f.Status, render: (f) => <FindingStatusBadge status={f.Status} overdue={isFindingOverdue(f, today)} /> },
      ]}
    />
  );
}

export function FindingsPage() {
  const [sp] = useSearchParams();
  const { store, version, today } = useApp();
  const scoped = useScopedRuns();
  const { name } = useUsers();
  const [status, setStatus] = useState<'open' | 'overdue' | 'closed' | 'all'>((sp.get('status') as 'open') ?? 'open');
  const [sev, setSev] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const runIds = useMemo(() => new Set(scoped.map((r) => r.RunId)), [scoped]);
  const all = useMemo(() => store.findings.filter((f) => runIds.has(f.RunId)), [store, version, runIds]);
  const rows = all.filter(
    (f) =>
      (status === 'all' || (status === 'closed' ? f.Status === 'Closed' : status === 'overdue' ? isFindingOverdue(f, today) : f.Status !== 'Closed')) &&
      (sev.length === 0 || sev.includes(f.Severity)) &&
      (!q || `${f.FindingCode} ${f.ControlCode} ${f.FindingDescription}`.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Manažerský přehled', to: '/management' }, { label: 'Nápravná opatření' }]}
        title="Zjištění a nápravná opatření"
        subtitle="Přehled zjištění ze všech běhů ve vašem rozsahu. Kliknutím otevřete běh, ke kterému zjištění patří."
        actions={
          <Button
            icon={Download}
            onClick={() =>
              downloadCsv(
                'zjisteni.csv',
                ['Kód', 'Kontrola', 'Popis', 'Opatření', 'Závažnost', 'Odpovědná osoba', 'Termín', 'Stav', 'Uzavřeno'],
                rows.map((f) => [f.FindingCode, f.ControlCode, f.FindingDescription, f.CorrectiveAction, SEVERITY_LABELS[f.Severity], name(f.ResponsiblePerson), f.DueDate, FINDING_STATUS_LABELS[f.Status], f.ClosedAt ?? '']),
              )
            }
          >
            Export CSV
          </Button>
        }
      />
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: 'open', label: `Otevřená (${all.filter((f) => f.Status !== 'Closed').length})` },
              { value: 'overdue', label: `Po termínu (${all.filter((f) => isFindingOverdue(f, today)).length})` },
              { value: 'closed', label: 'Uzavřená' },
              { value: 'all', label: 'Vše' },
            ]}
          />
          <MultiSelect label="Závažnost" value={sev} onChange={setSev} options={Object.entries(SEVERITY_LABELS).map(([k, l]) => ({ value: k, label: l }))} width={200} />
          <Input className="ml-auto max-w-xs" placeholder="Hledat kód nebo text…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hledat zjištění" />
        </div>
        <FindingsList findings={rows} />
      </Card>
    </div>
  );
}
