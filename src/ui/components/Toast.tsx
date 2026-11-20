import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

type Tone = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  details?: string[];
}
interface ToastApi {
  push(t: Omit<ToastItem, 'id'>): void;
}

const Ctx = createContext<ToastApi>({ push: () => undefined });
let seq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = seq++;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === 'error' ? 9000 : 4500);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ push }), [push]);
  const icon = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
  const tone = {
    success: 'border-emerald-200 text-emerald-700',
    error: 'border-rose-200 text-rose-700',
    info: 'border-brand-200 text-brand-700',
    warning: 'border-amber-200 text-amber-700',
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite" role="status">
        {items.map((t) => {
          const Icon = icon[t.tone];
          return (
            <div key={t.id} className={`pointer-events-auto flex gap-3 rounded-lg border bg-white p-3.5 shadow-[var(--shadow-pop)] ${tone[t.tone]}`}>
              <Icon className="mt-0.5 size-4.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{t.title}</p>
                {t.details && t.details.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-slate-600">
                    {t.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => dismiss(t.id)} aria-label="Zavřít oznámení">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
