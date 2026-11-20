import { useMemo, useState } from 'react';
import { CalendarCheck2, Download, Eye, FilePlus2, Info } from 'lucide-react';
import { can, departmentScope } from '../../domain/permissions';
import { MONTH_NAMES } from '../../domain/labels';
import { closedMonths } from '../../domain/reports';
import type { ReportSnapshot } from '../../domain/types';
import { generateMonthlyReport } from '../../services/reportService';
import { useApp } from '../AppContext';
import { useLookups, useUsers } from '../hooks';
import { DataTable } from '../components/DataTable';
import { Dialog } from '../components/Dialog';
import { PaRef } from '../components/PaRef';
import { Badge, Button, Card, CardHeader, Field, Notice, PageHeader, Select } from '../components/ui';
import { ReportPreview, downloadReport } from '../dialogs/SnapshotPreviews';
import { fmtDateTime, fmtPct } from '../format';

export function ReportsPage() {
  const { store, version, session, today, ctx, run } = useApp();
  const { departments, deptLabel } = useLookups();
  const { name } = useUsers();
  const [preview, setPreview] = useState<ReportSnapshot | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const months = closedMonths(today, 12);
  const [month, setMonth] = useState(months[0]);
  const myScope = departmentScope(session);
  const [scope, setScope] = useState(session.activeRole === 'Manager' && myScope !== 'ALL' ? myScope : 'ALL');
  const [busy, setBusy] = useState(false);
  const reports = useMemo(
    () => store.reports.filter((r) => session.activeRole !== 'Manager' || myScope === 'ALL' || r.DepartmentScope === myScope || r.DepartmentScope === 'ALL'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version, session],
  );
  const label = (r: ReportSnapshot) => `${MONTH_NAMES[r.ReportingMonth - 1]} ${r.ReportingYear}`;
  return (
    <div>
      <PageHeader
        title="Reporty"
        subtitle="Měsíční manažerské reporty za uzavřené měsíce. Každý report je archivní snapshot metrik k okamžiku vytvoření – historické reporty se podle aktuálních dat nemění."
        actions={
          can(session, 'generateReports') && (
            <PaRef id="rep.generate" inline>
              <Button variant="primary" icon={FilePlus2} onClick={() => setGenOpen(true)}>
                Vygenerovat měsíční report
              </Button>
            </PaRef>
          )
        }
      />
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Notice tone="blue" icon={CalendarCheck2} title="Produkční automatizace (FLOW-05)" className="lg:col-span-2">
          Power Automate vytvoří report každý první pracovní den v měsíci v 7:00 (Europe/Prague) za uplynulý měsíc, uloží snapshot do IC_ReportSnapshots a PDF do knihovny IC_ManagementReports/RRRR/RRRR-MM. Tlačítko „Vygenerovat“ je ruční spuštění pro demo.
        </Notice>
        <Notice tone="neutral" icon={Info} title="Opakované vygenerování">
          Vytvoří novou verzi reportu (v2, v3…). Předchozí verze zůstávají v archivu beze změny.
        </Notice>
      </div>
      <PaRef id="rep.archive">
        <Card>
          <CardHeader title="Archiv reportů" subtitle={`${reports.length} archivovaných reportů`} />
          <DataTable
            rows={reports}
            rowKey={(r) => r.ReportId}
            initialSort={{ key: 'period', dir: 'desc' }}
            emptyTitle="Zatím žádné reporty"
            onRowClick={(r) => setPreview(r)}
            columns={[
              { key: 'period', header: 'Období', sort: (r) => `${r.ReportingYear}-${String(r.ReportingMonth).padStart(2, '0')}-${r.ReportVersion}`, render: (r) => <span className="font-medium text-slate-800 capitalize">{label(r)}</span> },
              { key: 'scope', header: 'Rozsah', render: (r) => (r.DepartmentScope === 'ALL' ? 'Všechny útvary' : deptLabel(r.DepartmentScope)) },
              { key: 'v', header: 'Verze', render: (r) => <Badge tone={r.ReportVersion > 1 ? 'violet' : 'neutral'}>v{r.ReportVersion}</Badge> },
              { key: 'planned', header: 'Plán', align: 'right', render: (r) => r.SnapshotData.total.planned },
              { key: 'rate', header: 'Včasnost', align: 'right', render: (r) => fmtPct(r.SnapshotData.total.onTimeRate, 1) },
              { key: 'nc', header: 'Nedokončeno', align: 'right', render: (r) => r.SnapshotData.total.notCompleted },
              { key: 'gen', header: 'Vytvořeno', sort: (r) => r.GeneratedAt, render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.GeneratedAt)} · {name(r.GeneratedBy)}</span> },
              { key: 'pdf', header: 'PDF', render: (r) => (r.DocumentId ? <Badge tone="teal">uloženo</Badge> : <Badge>ze snapshotu</Badge>) },
              {
                key: 'a',
                header: '',
                align: 'right',
                render: (r) => (
                  <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" icon={Eye} onClick={() => setPreview(r)}>
                      Náhled
                    </Button>
                    <Button size="sm" variant="ghost" icon={Download} onClick={() => run(() => downloadReport(ctx, r))}>
                      PDF
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        </Card>
      </PaRef>
      <Dialog
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Vygenerovat měsíční report"
        size="sm"
        footer={
          <>
            <Button onClick={() => setGenOpen(false)}>Zrušit</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const [y, m] = month.split('-').map(Number);
                const r = await run(() => generateMonthlyReport(ctx, y, m, scope), (x) => `Report ${x.ReportId} vytvořen a archivován.`);
                setBusy(false);
                if (r) {
                  setGenOpen(false);
                  setPreview(r);
                }
              }}
            >
              Vygenerovat a archivovat
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Uzavřený měsíc">
            <Select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((mk) => {
                const [y, m] = mk.split('-').map(Number);
                const existing = store.reports.filter((r) => r.ReportingYear === y && r.ReportingMonth === m && r.DepartmentScope === scope).length;
                return (
                  <option key={mk} value={mk}>
                    {MONTH_NAMES[m - 1]} {y}
                    {existing ? ` (existuje v${existing})` : ''}
                  </option>
                );
              })}
            </Select>
          </Field>
          <Field label="Rozsah">
            <Select value={scope} onChange={(e) => setScope(e.target.value)} disabled={session.activeRole === 'Manager' && myScope !== 'ALL'}>
              <option value="ALL">Všechny útvary</option>
              {departments.map((d) => (
                <option key={d.Code} value={d.Code}>
                  {d.Label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-[13px] text-slate-500">Stav běhů se zmrazí k dnešnímu dni ({fmtDateTime(new Date().toISOString())}). Report dostane SHA-256 otisk pro ověření integrity.</p>
        </div>
      </Dialog>
      <ReportPreview report={preview} open={!!preview} onClose={() => setPreview(null)} />
    </div>
  );
}
