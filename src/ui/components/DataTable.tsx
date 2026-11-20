/** Znovupoužitelná tabulka: řazení, stránkování, prázdný stav. (Power Apps: Gallery / Data table + SortByColumns.) */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState, Select, cx } from './ui';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sort?: (row: T) => string | number | null;
  width?: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  hideBelow?: 'md' | 'lg' | 'xl';
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  pageSize = 25,
  initialSort,
  emptyTitle = 'Žádné záznamy',
  emptyDescription,
  dense,
  footer,
  rowClassName,
}: {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  dense?: boolean;
  footer?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  useEffect(() => setPage(0), [rows.length, sort, size]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'cs')) * dir;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const visible = sorted.slice(page * size, page * size + size);
  const hide = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' };

  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-line scroll-thin">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    style={{ width: c.width }}
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cx(
                      'border-b border-line px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      c.hideBelow && hide[c.hideBelow],
                    )}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        className={cx('inline-flex items-center gap-1 uppercase hover:text-slate-800', active && 'text-slate-800')}
                        onClick={() => setSort(active ? { key: c.key, dir: sort!.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' })}
                      >
                        {c.header}
                        {active ? sort!.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cx('border-b border-line/70 last:border-0', onRowClick && 'cursor-pointer hover:bg-brand-50/40 focus:bg-brand-50/60 focus:outline-none', rowClassName?.(r))}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx(dense ? 'px-3 py-2' : 'px-3 py-2.5', 'align-middle text-slate-700', c.align === 'right' && 'text-right tabular', c.align === 'center' && 'text-center', c.className, c.hideBelow && hide[c.hideBelow])}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-slate-500">
        <div className="flex items-center gap-3">
          <span className="tabular">
            {sorted.length > size ? `${page * size + 1}–${Math.min(sorted.length, (page + 1) * size)} z ` : ''}
            {sorted.length} záznamů
          </span>
          {footer}
        </div>
        {sorted.length > 10 && (
          <div className="flex items-center gap-2">
            <Select aria-label="Počet řádků na stránku" className="h-8 w-[86px] text-[13px]" value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} / str.
                </option>
              ))}
            </Select>
            <button type="button" aria-label="Předchozí stránka" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-30">
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular">
              {page + 1} / {pages}
            </span>
            <button type="button" aria-label="Další stránka" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-30">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
