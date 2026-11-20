/** Společná lišta filtrů (období, útvar, osoba, stav, frekvence, kategorie, rizikovost). */
import { RotateCcw } from 'lucide-react';
import type { Period, RunFilter } from '../../domain/metrics';
import { RECURRENCE_LABELS, RISK_LABELS, WORKFLOW_LABELS } from '../../domain/labels';
import { PERIOD_LABELS, type PeriodPreset } from '../drilldown';
import { useLookups, useUsers } from '../hooks';
import { MultiSelect } from './Popover';
import { Button, Input, Select } from './ui';

export interface FilterState extends RunFilter {
  preset: PeriodPreset;
  custom: Period;
}

export const EMPTY_FILTERS = (today: string): FilterState => ({
  preset: 'thisMonth',
  custom: { from: `${today.slice(0, 7)}-01`, to: today },
  departments: [],
  owners: [],
  states: [],
  recurrenceTypes: [],
  categories: [],
  riskLevels: [],
});

export function isFiltered(f: FilterState) {
  return f.preset !== 'thisMonth' || [f.departments, f.owners, f.states, f.recurrenceTypes, f.categories, f.riskLevels].some((x) => x && x.length > 0);
}

export function FilterBar({
  value,
  onChange,
  onReset,
  showPeriod = true,
  hide = [],
  extra,
}: {
  value: FilterState;
  onChange: (f: FilterState) => void;
  onReset: () => void;
  showPeriod?: boolean;
  hide?: Array<keyof RunFilter>;
  extra?: React.ReactNode;
}) {
  const { departments, categories } = useLookups();
  const { users } = useUsers();
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const show = (k: keyof RunFilter) => !hide.includes(k);
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 shadow-[var(--shadow-card)]">
      {showPeriod && (
        <>
          <Select aria-label="Období" className="h-9 w-auto min-w-[170px] text-[13px]" value={value.preset} onChange={(e) => set({ preset: e.target.value as PeriodPreset })}>
            {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </Select>
          {value.preset === 'custom' && (
            <span className="flex items-center gap-1.5">
              <Input type="date" aria-label="Od" className="h-9 w-[150px] text-[13px]" value={value.custom.from} onChange={(e) => set({ custom: { ...value.custom, from: e.target.value } })} />
              <span className="text-slate-400">–</span>
              <Input type="date" aria-label="Do" className="h-9 w-[150px] text-[13px]" value={value.custom.to} onChange={(e) => set({ custom: { ...value.custom, to: e.target.value } })} />
            </span>
          )}
          <span className="mx-1 h-6 w-px bg-line" />
        </>
      )}
      {show('departments') && <MultiSelect label="Útvar" value={value.departments ?? []} onChange={(v) => set({ departments: v })} options={departments.map((d) => ({ value: d.Code, label: d.Label }))} />}
      {show('owners') && <MultiSelect label="Osoba" value={value.owners ?? []} onChange={(v) => set({ owners: v })} options={users.map((u) => ({ value: u.Email, label: u.DisplayName }))} />}
      {show('states') && <MultiSelect label="Stav" value={value.states ?? []} onChange={(v) => set({ states: v })} options={Object.entries(WORKFLOW_LABELS).map(([k, l]) => ({ value: k, label: l }))} />}
      {show('recurrenceTypes') && <MultiSelect label="Frekvence" value={value.recurrenceTypes ?? []} onChange={(v) => set({ recurrenceTypes: v })} options={Object.entries(RECURRENCE_LABELS).map(([k, l]) => ({ value: k, label: l }))} />}
      {show('categories') && <MultiSelect label="Kategorie" value={value.categories ?? []} onChange={(v) => set({ categories: v })} options={categories.map((c) => ({ value: c.Code, label: c.Label }))} />}
      {show('riskLevels') && <MultiSelect label="Riziko" value={value.riskLevels ?? []} onChange={(v) => set({ riskLevels: v })} options={Object.entries(RISK_LABELS).map(([k, l]) => ({ value: k, label: l }))} width={200} />}
      {extra}
      <div className="ml-auto">
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onReset} disabled={!isFiltered(value)}>
          Resetovat filtry
        </Button>
      </div>
    </div>
  );
}
