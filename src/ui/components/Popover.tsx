/** Rozbalovací panel, vícenásobný výběr a výběr osoby (Power Apps: ComboBox + Office365Users.SearchUserV2). */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { DirectoryUser } from '../../domain/types';
import { Avatar, cx } from './ui';

export function Popover({
  trigger,
  children,
  align = 'left',
  width = 280,
  open: controlled,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  width?: number;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setInner(v));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div ref={ref} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen(!open) })}
      {open && (
        <div className={cx('absolute top-full z-40 mt-1.5 rounded-lg border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]', align === 'right' ? 'right-0' : 'left-0')} style={{ width }}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MultiSelect({ label, options, value, onChange, width = 260 }: { label: string; options: Array<{ value: string; label: string; hint?: string }>; value: string[]; onChange: (v: string[]) => void; width?: number }) {
  const [q, setQ] = useState('');
  const filtered = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  const summary = value.length === 0 ? 'Vše' : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? '1 vybráno' : `${value.length} vybráno`;
  return (
    <Popover
      width={width}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cx('inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-[13px] shadow-xs', value.length ? 'border-brand-300 text-brand-800' : 'border-slate-300 text-slate-700', 'hover:bg-slate-50')}
        >
          <span className="text-slate-500">{label}:</span>
          <span className="max-w-[140px] truncate font-medium">{summary}</span>
          <ChevronDown className="size-3.5 text-slate-400" />
        </button>
      )}
    >
      {options.length > 7 && (
        <div className="relative mb-1">
          <Search className="absolute top-2.5 left-2.5 size-3.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat…" className="h-8 w-full rounded-md border border-slate-200 pr-2 pl-8 text-[13px] focus:border-brand-400 focus:outline-none" />
        </div>
      )}
      <div className="max-h-64 overflow-y-auto scroll-thin">
        {filtered.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-slate-50"
            >
              <span className={cx('flex size-4 items-center justify-center rounded border', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300')}>{on && <Check className="size-3" />}</span>
              <span className="flex-1 truncate">{o.label}</span>
              {o.hint && <span className="text-xs text-slate-400">{o.hint}</span>}
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-brand-700 hover:bg-brand-50">
          Zrušit výběr
        </button>
      )}
    </Popover>
  );
}

export function UserPicker({
  users,
  value,
  onChange,
  placeholder = 'Vyhledat osobu…',
  allowEmpty,
  exclude = [],
  invalid,
  id,
}: {
  users: DirectoryUser[];
  value: string | null;
  onChange: (email: string | null) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  exclude?: string[];
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = users.find((u) => u.Email === value) ?? null;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users
      .filter((u) => !exclude.includes(u.Email))
      .filter((u) => !s || u.DisplayName.toLowerCase().includes(s) || u.Email.toLowerCase().includes(s) || u.JobTitle.toLowerCase().includes(s))
      .slice(0, 12);
  }, [users, q, exclude]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cx('flex h-9 w-full items-center gap-2 rounded-lg border bg-white px-2.5 text-left text-sm shadow-xs', invalid ? 'border-rose-400' : 'border-slate-300', 'focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none')}
      >
        {selected ? (
          <>
            <Avatar initials={selected.Initials} size="sm" />
            <span className="flex-1 truncate text-slate-800">{selected.DisplayName}</span>
            <span className="hidden truncate text-xs text-slate-400 sm:inline">{selected.JobTitle}</span>
          </>
        ) : (
          <span className="flex-1 text-slate-400">{placeholder}</span>
        )}
        {selected && allowEmpty ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Odebrat osobu"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="size-3.5" />
          </span>
        ) : (
          <ChevronDown className="size-3.5 text-slate-400" />
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1 rounded-lg border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]">
          <div className="relative mb-1">
            <Search className="absolute top-2.5 left-2.5 size-3.5 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jméno, e-mail nebo pozice" className="h-8 w-full rounded-md border border-slate-200 pr-2 pl-8 text-[13px] focus:border-brand-400 focus:outline-none" />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto scroll-thin">
            {list.map((u) => (
              <li key={u.Email}>
                <button
                  type="button"
                  role="option"
                  aria-selected={u.Email === value}
                  onClick={() => {
                    onChange(u.Email);
                    setOpen(false);
                    setQ('');
                  }}
                  className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50', u.Email === value && 'bg-brand-50')}
                >
                  <Avatar initials={u.Initials} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-800">{u.DisplayName}</span>
                    <span className="block truncate text-xs text-slate-500">{u.JobTitle}</span>
                  </span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-2 py-3 text-center text-[13px] text-slate-500">Nikdo neodpovídá hledání.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
