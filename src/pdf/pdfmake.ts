/**
 * Líné načtení pdfmake (≈ 2 MB včetně fontu Roboto – plná podpora české diakritiky).
 * PDF se generuje v prohlížeči jako skutečný soubor (Blob), uloží se do IndexedDB
 * a lze jej stáhnout. Není použit tisk obrazovky ani rastrový snímek.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

let loader: Promise<any> | null = null;

export function loadPdfMake(): Promise<any> {
  loader ??= (async () => {
    const mod: any = await import('pdfmake/build/pdfmake');
    const fonts: any = await import('pdfmake/build/vfs_fonts');
    const pdfMake = mod.default ?? mod;
    const vfs = fonts.default ?? fonts;
    if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs);
    else pdfMake.vfs = vfs;
    return pdfMake;
  })();
  return loader;
}

export async function renderPdf(doc: TDocumentDefinitions): Promise<Blob> {
  const pdfMake = await loadPdfMake();
  return new Promise<Blob>((resolve, reject) => {
    try {
      pdfMake.createPdf(doc).getBlob((blob: Blob) => resolve(blob));
    } catch (e) {
      reject(e);
    }
  });
}

export const COLORS = {
  navy: '#0b1f3a',
  navy2: '#1b3a63',
  blue: '#1f5bd0',
  teal: '#0f9488',
  text: '#1e293b',
  muted: '#64748b',
  line: '#dbe2ea',
  soft: '#f3f6fa',
  green: '#047857',
  amber: '#b45309',
  red: '#b91c1c',
};

export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0b1f3a"/><path d="M9 16.5l4.2 4.2L23 11" fill="none" stroke="#2dd4bf" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const tableLayout = {
  hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => COLORS.line,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  fillColor: (row: number) => (row === 0 ? COLORS.soft : null),
};

export function sectionTitle(text: string): any {
  return {
    stack: [
      { text, style: 'h2' },
      { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 515, y2: 2, lineWidth: 0.8, lineColor: COLORS.line }] },
    ],
    margin: [0, 14, 0, 6],
  };
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day}. ${m}. ${y}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export const baseStyles = {
  h1: { fontSize: 16, bold: true, color: COLORS.navy },
  h2: { fontSize: 11, bold: true, color: COLORS.navy },
  label: { fontSize: 7.5, color: COLORS.muted },
  value: { fontSize: 9, color: COLORS.text },
  small: { fontSize: 8, color: COLORS.muted },
  th: { fontSize: 8, bold: true, color: COLORS.navy2 },
  td: { fontSize: 8.5, color: COLORS.text },
};
