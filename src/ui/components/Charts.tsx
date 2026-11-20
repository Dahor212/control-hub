/**
 * Grafy (Recharts). Barvy = stavové role ověřené validátorem palety; identita nikdy jen barvou:
 * vždy legenda, tooltip a 2px mezera mezi segmenty. Jedna osa Y na graf (žádné dvojí osy).
 */
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { fmtPct } from '../format';

export const VIZ = {
  onTime: '#0ca30c',
  late: '#eda100',
  pending: '#6250d6',
  overdue: '#d03b3b',
  progress: '#2a78d6',
  returned: '#eb6834',
  open: '#a9b1bd',
  planned: '#d5dbe3',
  cancelled: '#e7eaee',
  primary: '#2a78d6',
  grid: '#e8edf3',
  axis: '#8a94a3',
};

export const SEVERITY_RAMP = { Low: '#86b6ef', Medium: '#3987e5', High: '#1c5cab', Critical: '#0d366b' };

export function Legend({ items }: { items: Array<{ color: string; label: string; value?: ReactNode }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
          {i.value !== undefined && <span className="font-medium text-slate-800 tabular">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

function TooltipBox({ active, payload, label, fmt }: Pick<TooltipProps<ValueType, NameType>, 'active' | 'payload' | 'label'> & { fmt?: (v: number, name: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      {label !== undefined && <p className="mb-1 font-semibold text-slate-800">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-slate-600">
          <span className="size-2 rounded-sm" style={{ background: (p.color as string) ?? (p.payload?.fill as string) }} />
          <span className="flex-1">{p.name}</span>
          <span className="font-medium text-slate-800 tabular">{fmt ? fmt(Number(p.value), String(p.name)) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

const axisProps = { tick: { fontSize: 11, fill: VIZ.axis }, tickLine: false, axisLine: false } as const;

export interface StackSeries {
  key: string;
  label: string;
  color: string;
}

export function StackedBars({
  data,
  xKey,
  series,
  height = 240,
  onClick,
  extraTooltip,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: StackSeries[];
  height?: number;
  onClick?: (row: Record<string, unknown>) => void;
  extraTooltip?: (row: Record<string, unknown>) => ReactNode;
}) {
  return (
    <div>
      <div className="mb-3">
        <Legend items={series.map((s) => ({ color: s.color, label: s.label }))} />
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -18 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={VIZ.grid} />
            <XAxis dataKey={xKey} {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ fill: 'rgba(42,120,214,0.06)' }}
              content={(p) => (
                <div>
                  <TooltipBox active={p.active} payload={p.payload} label={p.label} />
                  {extraTooltip && p.active && p.payload?.[0] && <div className="-mt-1 rounded-b-lg border border-t-0 border-line bg-white px-3 pb-2 text-xs text-slate-600">{extraTooltip(p.payload[0].payload)}</div>}
                </div>
              )}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="a"
                fill={s.color}
                stroke="#ffffff"
                strokeWidth={2}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                maxBarSize={46}
                isAnimationActive={false}
                onClick={onClick ? (d) => onClick((d as unknown as { payload: Record<string, unknown> }).payload) : undefined}
                cursor={onClick ? 'pointer' : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function Donut({
  data,
  height = 220,
  onClick,
  centerLabel,
}: {
  data: Array<{ key: string; label: string; value: number; color: string }>;
  height?: number;
  onClick?: (key: string) => void;
  centerLabel?: string;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="92%" paddingAngle={1.5} stroke="#ffffff" strokeWidth={2} onClick={onClick ? (d) => onClick((d as unknown as { key: string }).key) : undefined} cursor={onClick ? 'pointer' : undefined} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={(p) => <TooltipBox active={p.active} payload={p.payload} label={p.label} fmt={(v) => `${v} (${fmtPct(total ? v / total : 0)})`} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-slate-900 tabular">{total}</span>
          <span className="text-[11px] text-slate-500">{centerLabel ?? 'celkem'}</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-1 gap-y-1 text-[13px]">
        {data.map((d) => (
          <li key={d.key}>
            <button type="button" disabled={!onClick} onClick={() => onClick?.(d.key)} className="flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left hover:bg-slate-50 disabled:hover:bg-transparent">
              <span className="size-2.5 rounded-[3px]" style={{ background: d.color }} />
              <span className="min-w-0 flex-1 truncate text-slate-600">{d.label}</span>
              <span className="font-medium text-slate-900 tabular">{d.value}</span>
              <span className="w-10 text-right text-[11px] text-slate-400 tabular">{fmtPct(total ? d.value / total : 0)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Vodorovné pruhy míry (0–1) – jedna řada, popisky přímo u pruhů. */
export function RateBars({ data, onClick, target = 0.95 }: { data: Array<{ key: string; label: string; value: number | null; sub?: string }>; onClick?: (key: string) => void; target?: number }) {
  return (
    <ul className="space-y-3">
      {data.map((d) => {
        const v = d.value ?? 0;
        const color = d.value === null ? VIZ.open : v >= target ? VIZ.onTime : v >= 0.85 ? VIZ.late : VIZ.overdue;
        return (
          <li key={d.key}>
            <button type="button" onClick={() => onClick?.(d.key)} disabled={!onClick} className="group w-full text-left">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate text-slate-700 group-hover:text-brand-700">{d.label}</span>
                <span className="shrink-0 font-semibold text-slate-900 tabular">
                  {fmtPct(d.value, 1)}
                  {d.sub && <span className="ml-1.5 text-xs font-normal text-slate-400">{d.sub}</span>}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-slate-100">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${v * 100}%`, background: color }} />
                <div className="absolute -top-0.5 h-3 w-px bg-slate-400" style={{ left: `${target * 100}%` }} title={`Cíl ${fmtPct(target)}`} />
              </div>
            </button>
          </li>
        );
      })}
      <li className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-400">
        <span className="h-3 w-px bg-slate-400" /> cílová hodnota {fmtPct(target)} · zelená ≥ cíl, žlutá ≥ 85 %, červená &lt; 85 %
      </li>
    </ul>
  );
}

export function RateLines({ data, series, height = 240 }: { data: Array<Record<string, unknown>>; series: StackSeries[]; height?: number }) {
  return (
    <div>
      <div className="mb-3">
        <Legend items={series.map((s) => ({ color: s.color, label: s.label }))} />
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={VIZ.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)} %`} {...axisProps} />
            <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} content={(p) => <TooltipBox active={p.active} payload={p.payload} label={p.label} fmt={(v) => fmtPct(v, 1)} />} />
            {series.map((s) => (
              <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: s.color }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
