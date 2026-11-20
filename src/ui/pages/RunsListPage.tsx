import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter } from 'lucide-react';
import { useApp } from '../AppContext';
import { useLookups, useScopedRuns, useUsers } from '../hooks';
import { DRILL_LABELS, parseDrill, selectRuns, type DrillView } from '../drilldown';
import { Badge, Card, PageHeader, Select } from '../components/ui';
import { RunTable } from '../components/RunTable';
import { fmtDate } from '../format';
import { RECURRENCE_LABELS, RISK_LABELS, WORKFLOW_LABELS } from '../../domain/labels';

/** Proklik ze statistik – „odpovídající filtrovaný seznam kontrol“ (Power Apps: scrRunList). */
export function RunsListPage() {
  const [sp, setSp] = useSearchParams();
  const { today } = useApp();
  const scoped = useScopedRuns();
  const { deptLabel, catLabel } = useLookups();
  const { name } = useUsers();
  const p = parseDrill(sp);
  const runs = useMemo(() => selectRuns(scoped, p, today), [scoped, sp.toString(), today]);
  const chips: string[] = [
    ...(p.from && p.to ? [`Termín ${fmtDate(p.from)} – ${fmtDate(p.to)}`] : []),
    ...(p.departments ?? []).map((d) => `Útvar: ${deptLabel(d)}`),
    ...(p.owners ?? []).map((o) => `Osoba: ${name(o)}`),
    ...(p.states ?? []).map((s) => `Stav: ${WORKFLOW_LABELS[s as keyof typeof WORKFLOW_LABELS] ?? s}`),
    ...(p.recurrenceTypes ?? []).map((s) => `Frekvence: ${RECURRENCE_LABELS[s as keyof typeof RECURRENCE_LABELS] ?? s}`),
    ...(p.categories ?? []).map((c) => `Kategorie: ${catLabel(c)}`),
    ...(p.riskLevels ?? []).map((r) => `Riziko: ${RISK_LABELS[r as keyof typeof RISK_LABELS] ?? r}`),
    ...(p.mine ? [`Jen: ${name(p.mine)}`] : []),
  ];
  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Seznam běhů' }]}
        title={p.title ?? DRILL_LABELS[p.view]}
        subtitle="Seznam vychází ze stejných definic jako ukazatele na dashboardu – počet řádků odpovídá hodnotě, ze které jste přišli."
        actions={
          <Select
            aria-label="Pohled"
            className="w-auto"
            value={p.view}
            onChange={(e) => {
              const next = new URLSearchParams(sp);
              next.set('view', e.target.value);
              next.delete('title');
              setSp(next);
            }}
          >
            {(Object.keys(DRILL_LABELS) as DrillView[]).map((v) => (
              <option key={v} value={v}>
                {DRILL_LABELS[v]}
              </option>
            ))}
          </Select>
        }
      />
      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <Filter className="size-3.5 text-slate-400" />
          {chips.map((c) => (
            <Badge key={c} tone="blue">
              {c}
            </Badge>
          ))}
        </div>
      )}
      <Card>
        <RunTable runs={runs} exportName={`behy-${p.view}`} emptyTitle="Výběru neodpovídají žádné běhy" />
      </Card>
    </div>
  );
}
