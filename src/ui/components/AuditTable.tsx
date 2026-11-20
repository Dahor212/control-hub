import type { AuditEntry } from '../../domain/types';
import { useUsers } from '../hooks';
import { fmtDateTime } from '../format';
import { DataTable } from './DataTable';
import { Badge } from './ui';

const ENTITY_LABELS: Record<string, string> = {
  Control: 'Kontrola',
  ControlVersion: 'Verze',
  ControlRun: 'Běh',
  Finding: 'Zjištění',
  Document: 'Dokument',
  Protocol: 'Protokol',
  Notification: 'Upozornění',
  Settings: 'Nastavení',
  RoleAssignment: 'Role',
  Lookup: 'Číselník',
  Report: 'Report',
  System: 'Systém',
};

function short(v: string | null) {
  if (!v) return '—';
  return v.length > 80 ? `${v.slice(0, 80)}…` : v;
}

export function AuditTable({ entries, pageSize = 25, showEntity = true }: { entries: AuditEntry[]; pageSize?: number; showEntity?: boolean }) {
  const { name } = useUsers();
  return (
    <DataTable
      rows={entries}
      rowKey={(a) => a.AuditId}
      pageSize={pageSize}
      dense
      initialSort={{ key: 'at', dir: 'desc' }}
      emptyTitle="Žádné auditní záznamy"
      columns={[
        { key: 'at', header: 'Kdy', sort: (a) => a.ChangedAt, render: (a) => <span className="whitespace-nowrap tabular text-slate-600">{fmtDateTime(a.ChangedAt)}</span> },
        { key: 'who', header: 'Kdo', sort: (a) => name(a.ChangedBy), render: (a) => <span className="whitespace-nowrap">{a.ChangedBy.includes('@system') || a.ChangedBy === 'system' ? 'Systém (automatizace)' : name(a.ChangedBy)}</span> },
        ...(showEntity ? [{ key: 'entity', header: 'Entita', sort: (a: AuditEntry) => a.EntityType, render: (a: AuditEntry) => <Badge tone="neutral">{ENTITY_LABELS[a.EntityType] ?? a.EntityType}</Badge> }] : []),
        { key: 'action', header: 'Akce', sort: (a) => a.Action, render: (a) => <span className="font-medium text-slate-800">{a.Action}</span> },
        {
          key: 'change',
          header: 'Změna',
          render: (a) =>
            a.FieldName ? (
              <span className="text-[12.5px]">
                <span className="font-mono text-[11.5px] text-slate-500">{a.FieldName}</span>: <span className="text-slate-500">{short(a.OldValue)}</span> → <span className="text-slate-900">{short(a.NewValue)}</span>
              </span>
            ) : (
              '—'
            ),
        },
        { key: 'reason', header: 'Důvod', render: (a) => <span className="text-[12.5px] text-slate-600">{a.ChangeReason ?? '—'}</span> },
      ]}
    />
  );
}
