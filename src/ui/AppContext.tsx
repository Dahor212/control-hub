/**
 * Kořenový kontext aplikace: datové úložiště, simulovaný přihlášený uživatel a role,
 * dnešní (případně testovací) datum a pomocník pro volání služeb s chybovými hláškami.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Session } from '../domain/permissions';
import type { AppSettings, ISODate, RoleName } from '../domain/types';
import { openLocalDataStore, type DataStore } from '../data/store';
import { seedDemoData, SEED_VERSION } from '../data/seed';
import { ServiceError, today as todayOf, type ServiceContext } from '../services/core';
import { generateOccurrences } from '../services/controlService';
import { ConcurrencyError } from '../data/repository';
import { DuplicateKeyError } from '../data/backend';
import { toPragueDate } from '../domain/dates';
import { useToast } from './components/Toast';

interface AppValue {
  store: DataStore;
  session: Session;
  ctx: ServiceContext;
  settings: AppSettings;
  today: ISODate;
  version: number;
  switchUser(email: string, role?: RoleName): void;
  run<T>(fn: () => Promise<T>, success?: string | ((r: T) => string)): Promise<T | undefined>;
}

const AppCtx = createContext<AppValue | null>(null);
const SESSION_KEY = 'controlhub.session';
const DEFAULT_USER = 'katerina.markova@ic-demo.example';

function readSession(): { email: string; role?: RoleName } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(v: { email: string; role: RoleName }) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(v));
  } catch {
    /* localStorage nedostupné – relace jen v paměti */
  }
}

export function buildSession(store: DataStore, email: string, role?: RoleName): Session {
  const users = store.directory.all();
  const user = users.find((u) => u.Email === email) ?? users.find((u) => u.Email === DEFAULT_USER) ?? users[0];
  const assignments = store.roles.filter((r) => r.UserEmail === user.Email && r.IsActive);
  const activeRole = assignments.find((a) => a.Role === role)?.Role ?? assignments[0]?.Role ?? 'ControlOwner';
  return { user, activeRole, assignments };
}

export function errorMessages(e: unknown): { title: string; details: string[] } {
  if (e instanceof ServiceError) return { title: e.message, details: e.details };
  if (e instanceof ConcurrencyError) return { title: 'Souběžná změna záznamu', details: [e.message] };
  if (e instanceof DuplicateKeyError) return { title: 'Duplicitní záznam', details: [e.message] };
  if (e instanceof Error) return { title: 'Operace se nezdařila', details: [e.message] };
  return { title: 'Operace se nezdařila', details: [String(e)] };
}

/** Jediný sdílený bootstrap (StrictMode spouští efekty dvakrát – nesmí vzniknout dvě souběžná generování dat). */
let bootPromise: Promise<DataStore> | null = null;
let statusListener: ((s: string) => void) | null = null;
function bootstrap(): Promise<DataStore> {
  bootPromise ??= (async () => {
    const s = await openLocalDataStore();
    const meta = (await s.getMeta('seed')) as { version?: number } | undefined;
    if (!meta || meta.version !== SEED_VERSION || s.controls.all().length === 0) {
      statusListener?.('Připravuji syntetická demo data…');
      await s.clearAll();
      await seedDemoData(s, toPragueDate(new Date()));
    }
    return s;
  })();
  return bootPromise;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<DataStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Otevírám lokální databázi…');

  useEffect(() => {
    let cancelled = false;
    statusListener = setStatus;
    bootstrap().then(
      (s) => !cancelled && setStore(s),
      (e) => !cancelled && setError(e instanceof Error ? `${e.name}: ${e.message}` : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (error)
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg rounded-xl border border-rose-200 bg-white p-6 shadow-[var(--shadow-card)]">
          <h1 className="text-lg font-semibold text-rose-700">Aplikaci se nepodařilo spustit</h1>
          <p className="mt-2 text-sm text-slate-600">
            Lokální úložiště IndexedDB není dostupné. Zkontrolujte, zda prohlížeč nepracuje v anonymním režimu s blokovaným úložištěm.
          </p>
          <pre className="mt-3 rounded bg-slate-50 p-3 text-xs text-slate-500">{error}</pre>
        </div>
      </div>
    );
  if (!store)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-navy-900 text-white">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-lg font-semibold tracking-wide">CONTROL HUB</span>
        </div>
        <div className="h-1 w-48 overflow-hidden rounded bg-navy-700">
          <div className="h-full w-1/3 animate-pulse rounded bg-teal-400" />
        </div>
        <p className="text-sm text-navy-200">{status}</p>
      </div>
    );
  return <Ready store={store}>{children}</Ready>;
}

function Ready({ store, children }: { store: DataStore; children: ReactNode }) {
  const toast = useToast();
  const version = useSyncExternalStore(
    (cb) => store.bus.subscribe(cb),
    () => store.bus.getVersion(),
  );
  const [sessionKey, setSessionKey] = useState(() => readSession() ?? { email: DEFAULT_USER });
  const session = useMemo(() => buildSession(store, sessionKey.email, sessionKey.role), [store, sessionKey, version]);
  const settings = store.settings.get();
  const today = todayOf(store);
  const ctx = useMemo<ServiceContext>(() => ({ store, session }), [store, session]);

  // Simulace plánovače FLOW-01: jednou denně doplnit horizont výskytů.
  useEffect(() => {
    if (store.settings.get().lastGenerationDate !== today) {
      void generateOccurrences({ store, session }, { silent: true, trigger: 'Denní spuštění plánovače (simulace)' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const switchUser = useCallback((email: string, role?: RoleName) => {
    const s = buildSession(store, email, role);
    writeSession({ email: s.user.Email, role: s.activeRole });
    setSessionKey({ email: s.user.Email, role: s.activeRole });
  }, [store]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string | ((r: T) => string)) => {
      try {
        const r = await fn();
        if (success) toast.push({ tone: 'success', title: typeof success === 'function' ? success(r) : success });
        return r;
      } catch (e) {
        const m = errorMessages(e);
        toast.push({ tone: 'error', title: m.title, details: m.details });
        return undefined;
      }
    },
    [toast],
  );

  const value = useMemo<AppValue>(
    () => ({ store, session, ctx, settings, today, version, switchUser, run }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, session, ctx, settings, today, version, switchUser, run],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(AppCtx);
  if (!v) throw new Error('useApp mimo AppProvider');
  return v;
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#12305a" />
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="7.25" fill="none" stroke="#2dd4bf" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M9 16.5l4.2 4.2L23 11" fill="none" stroke="#2dd4bf" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
