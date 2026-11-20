import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { computeTiming } from '../../domain/status';
import { RECURRENCE_LABELS, RISK_LABELS, RISK_WEIGHT, WORKFLOW_LABELS, RESULT_LABELS } from '../../domain/labels';
import type { ControlRun } from '../../domain/types';
import { useApp } from '../AppContext';
import { downloadCsv } from '../download';
import { fmtDate, fmtDateTime, fmtPeriod } from '../format';
import { useLookups, useUsers } from '../hooks';
import { DataTable, type Column } from './DataTable';
import { ResultBadge, RiskBadge, RunStatus } from './StatusBadges';
import { Button } from './ui';

export function RunTable({
  runs,
  showControl = true,
  pageSize = 25,
  hideColumns = [],
  emptyTitle = 'Žádné běhy',
  emptyDescription,
  exportName,
  initialSort = { key: 'due', dir: 'asc' as const },
}: {
  runs: ControlRun[];
  showControl?: boolean;
  pageSize?: number;
  hideColumns?: string[];
  emptyTitle?: string;
  emptyDescription?: string;
  exportName?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
}) {
  const nav = useNavigate();
  const { today, settings } = useApp();
  const { name } = useUsers();
  const { deptLabel } = useLookups();
  const cols: Array<Column<ControlRun>> = [
    ...(showControl
      ? [
          {
            key: 'control',
            header: 'Kontrola',
            sort: (r: ControlRun) => r.ControlCode,
            render: (r: ControlRun) => (
              <div className="min-w-[220px]">
                <span className="font-mono text-xs text-slate-500">{r.ControlCode}</span>
                <p className="leading-snug font-medium text-slate-800">{r.ControlName}</p>
              </div>
            ),
          },
        ]
      : []),
    { key: 'run', header: 'Běh', sort: (r) => r.RunCode, render: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.RunCode}</span> },
    { key: 'period', header: 'Období', hideBelow: 'xl', sort: (r) => r.PeriodFrom, render: (r) => <span className="whitespace-nowrap text-slate-600">{fmtPeriod(r.PeriodFrom, r.PeriodTo)}</span> },
    { key: 'due', header: 'Termín', sort: (r) => r.DueDate, render: (r) => <span className="whitespace-nowrap tabular">{fmtDate(r.DueDate)}</span> },
    { key: 'owner', header: 'Odpovědná osoba', sort: (r) => name(r.AssignedOwnerEmail), render: (r) => <span className="whitespace-nowrap">{name(r.AssignedOwnerEmail)}</span> },
    { key: 'dept', header: 'Útvar', hideBelow: 'lg', sort: (r) => r.Department, render: (r) => <span className="whitespace-nowrap text-slate-600">{deptLabel(r.Department)}</span> },
    { key: 'status', header: 'Stav', sort: (r) => r.WorkflowState + r.DueDate, render: (r) => <RunStatus run={r} today={today} dueSoonDays={settings.dueSoonDays} /> },
    { key: 'result', header: 'Výsledek', hideBelow: 'xl', sort: (r) => r.Result ?? '', render: (r) => <ResultBadge result={r.Result} /> },
    { key: 'risk', header: 'Riziko', sort: (r) => RISK_WEIGHT[r.RiskLevel], render: (r) => <RiskBadge risk={r.RiskLevel} /> },
  ];
  const columns = cols.filter((c) => !hideColumns.includes(c.key));
  const exportCsv = () =>
    downloadCsv(
      `${exportName ?? 'behy'}.csv`,
      ['Kód kontroly', 'Kontrola', 'Běh', 'Období od', 'Období do', 'Plánováno', 'Termín', 'Odpovědná osoba', 'Útvar', 'Frekvence', 'Stav workflow', 'Po termínu (dny)', 'Výsledek', 'Rizikovost', 'Provedeno', 'Dokončeno', 'OccurrenceKey'],
      runs.map((r) => {
        const t = computeTiming(r, today);
        return [
          r.ControlCode,
          r.ControlName,
          r.RunCode,
          r.PeriodFrom,
          r.PeriodTo,
          r.ScheduledDate,
          r.DueDate,
          name(r.AssignedOwnerEmail),
          deptLabel(r.Department),
          RECURRENCE_LABELS[r.RecurrenceType],
          WORKFLOW_LABELS[r.WorkflowState],
          t.daysLate || '',
          r.Result ? RESULT_LABELS[r.Result] : '',
          RISK_LABELS[r.RiskLevel],
          fmtDateTime(r.SubmittedAt),
          fmtDateTime(r.CompletedAt),
          r.OccurrenceKey,
        ];
      }),
    );
  return (
    <DataTable
      rows={runs}
      columns={columns}
      rowKey={(r) => r.RunId}
      onRowClick={(r) => nav(`/runs/${r.RunId}`)}
      pageSize={pageSize}
      initialSort={initialSort}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      footer={
        exportName && runs.length > 0 ? (
          <Button size="sm" variant="ghost" icon={Download} onClick={exportCsv}>
            Export CSV
          </Button>
        ) : undefined
      }
    />
  );
}
