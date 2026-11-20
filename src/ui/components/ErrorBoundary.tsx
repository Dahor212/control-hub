import { Component, type ReactNode } from 'react';

/** Zachytí neočekávanou chybu vykreslení a nabídne srozumitelné zotavení místo prázdné stránky. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-lg rounded-xl border border-rose-200 bg-white p-6 shadow-[var(--shadow-card)]">
        <h1 className="text-lg font-semibold text-rose-700">Obrazovku se nepodařilo zobrazit</h1>
        <p className="mt-2 text-sm text-slate-600">Došlo k neočekávané chybě. Data v úložišti zůstávají zachována. Zkuste stránku načíst znovu.</p>
        <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-500">{this.state.error.message}</pre>
        <button className="mt-4 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={() => location.reload()}>
          Načíst znovu
        </button>
      </div>
    );
  }
}
