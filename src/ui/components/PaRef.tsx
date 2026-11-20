/**
 * Režim „Power Apps Reference“: po zapnutí se u označených prvků zobrazí malý štítek „PA“.
 * Kliknutí na štítek ukáže referenční ID, cílovou obrazovku, ovládací prvek, seznam a flow.
 * Ve vypnutém stavu komponenta nic nepřidává – běžný design zůstává nedotčen.
 */
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Code2, X } from 'lucide-react';
import { PA_REFS } from '../../powerapps/refRegistry';
import { useApp } from '../AppContext';
import { cx } from './ui';

export function PaRef({ id, children, className, inline }: { id: string; children: ReactNode; className?: string; inline?: boolean }) {
  const { settings } = useApp();
  const [open, setOpen] = useState(false);
  if (!settings.paReferenceMode) return <>{children}</>;
  const ref = PA_REFS[id];
  const Tag = inline ? 'span' : 'div';
  return (
    <Tag className={cx('pa-ref relative', inline ? 'inline-block' : '', className)}>
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        className="absolute -top-2.5 -right-2 z-20 inline-flex items-center gap-0.5 rounded bg-purple-600 px-1 py-px text-[9px] leading-none font-bold text-white shadow hover:bg-purple-700"
        title={`Power Apps reference: ${id}`}
      >
        PA
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-navy-950/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div role="dialog" aria-label="Power Apps reference" className="w-full max-w-md rounded-xl border border-purple-200 bg-white p-5 shadow-[var(--shadow-pop)]">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md bg-purple-100 text-purple-700">
                  <Code2 className="size-4" />
                </span>
                <div className="flex-1">
                  <p className="text-xs font-medium tracking-wide text-purple-700 uppercase">Power Apps Reference</p>
                  <p className="text-sm font-semibold text-slate-900">{ref?.label ?? id}</p>
                </div>
                <button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Zavřít">
                  <X className="size-4" />
                </button>
              </div>
              <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-[13px]">
                {[
                  ['Referenční ID', id],
                  ['React akce', ref?.reactAction],
                  ['Power Apps obrazovka', ref?.screen],
                  ['Power Apps control', ref?.control],
                  ['SharePoint zdroj', ref?.list],
                  ['Power Automate', ref?.flow],
                  ['Poznámka', ref?.note],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="font-mono text-[12px] break-words text-slate-800">{v}</dd>
                    </div>
                  ))}
              </dl>
              <p className="mt-4 text-xs text-slate-500">Podrobnosti v docs/SCREEN_MAP.md a docs/POWERAPPS_MIGRATION.md.</p>
            </div>
          </div>,
          document.body,
        )}
    </Tag>
  );
}
