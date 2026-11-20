/** Odvozená data pro UI (memoizace podle verze dat). */
import { useMemo } from 'react';
import { runVisibleTo } from '../domain/permissions';
import type { ControlRun } from '../domain/types';
import { useApp } from './AppContext';

export function useLookups() {
  const { store, version } = useApp();
  return useMemo(() => {
    const all = store.lookups.all();
    const active = (t: string) => all.filter((l) => l.LookupType === t && l.IsActive).sort((a, b) => a.SortOrder - b.SortOrder);
    const departments = active('Department');
    const categories = active('Category');
    const label = (t: string, code: string) => all.find((l) => l.LookupType === t && l.Code === code)?.Label ?? code;
    return {
      departments,
      categories,
      deptLabel: (code: string) => label('Department', code),
      catLabel: (code: string) => label('Category', code),
      deptManager: (code: string) => all.find((l) => l.LookupType === 'Department' && l.Code === code)?.ManagerEmail ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);
}

export function useUsers() {
  const { store, version } = useApp();
  return useMemo(() => {
    const users = [...store.directory.all()].sort((a, b) => a.DisplayName.localeCompare(b.DisplayName, 'cs'));
    const map = new Map(users.map((u) => [u.Email, u]));
    return { users, map, name: (e: string | null | undefined) => (e ? map.get(e)?.DisplayName ?? e : '—'), user: (e: string | null | undefined) => (e ? map.get(e) : undefined) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);
}

/** Běhy viditelné aktivní roli (bez nahrazených výskytů). */
export function useScopedRuns(): ControlRun[] {
  const { store, session, version } = useApp();
  return useMemo(
    () => store.runs.filter((r) => !r.IsSuperseded && runVisibleTo(session, r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, session, version],
  );
}
