/** PDF měsíčního manažerského reportu – vykresluje se ze snapshotu IC_ReportSnapshots. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { MONTH_NAMES, SEVERITY_LABELS, FINDING_STATUS_LABELS } from '../domain/labels';
import type { MonthlyReportData, ReportMetricsRow } from '../domain/types';
import { COLORS, LOGO_SVG, baseStyles, fmtDate, fmtDateTime, renderPdf, sectionTitle, tableLayout } from './pdfmake';

const pct = (v: number | null) => (v === null ? '–' : `${(v * 100).toFixed(1).replace('.', ',')} %`);

function tile(label: string, value: string, hint: string, color = COLORS.navy): any {
  return {
    table: {
      widths: ['*'],
      body: [[{ stack: [{ text: label, style: 'label' }, { text: value, fontSize: 16, bold: true, color, margin: [0, 2, 0, 1] }, { text: hint, fontSize: 6.5, color: COLORS.muted }], margin: [6, 5, 6, 5] }]],
    },
    layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => COLORS.line, vLineColor: () => COLORS.line },
  };
}

function metricsRow(r: ReportMetricsRow, bold = false): any[] {
  const s = { style: 'td', bold };
  return [
    { text: r.label, ...s },
    { text: String(r.planned), ...s, alignment: 'right' },
    { text: String(r.completed), ...s, alignment: 'right' },
    { text: String(r.onTime), ...s, alignment: 'right' },
    { text: String(r.late), ...s, alignment: 'right' },
    { text: String(r.notCompleted), ...s, alignment: 'right' },
    { text: String(r.cancelled), ...s, alignment: 'right' },
    { text: pct(r.onTimeRate), ...s, alignment: 'right', color: r.onTimeRate !== null && r.onTimeRate < 0.85 ? COLORS.red : COLORS.text },
  ];
}

function trendChart(trend: MonthlyReportData['trend']): any {
  const w = 515;
  const h = 120;
  const barArea = h - 24;
  const max = Math.max(1, ...trend.map((t) => t.planned));
  const slot = w / trend.length;
  const bw = Math.min(46, slot * 0.55);
  const shapes: any[] = [{ type: 'line', x1: 0, y1: barArea, x2: w, y2: barArea, lineWidth: 0.6, lineColor: COLORS.line }];
  const labels: any[] = [];
  trend.forEach((t, i) => {
    const x = i * slot + (slot - bw) / 2;
    let y = barArea;
    const seg = (value: number, color: string) => {
      if (!value) return;
      const hh = (value / max) * (barArea - 14);
      y -= hh;
      shapes.push({ type: 'rect', x, y, w: bw, h: hh, color });
    };
    seg(t.onTime, '#2f9e8f');
    seg(t.late, '#e0a43a');
    seg(t.notCompleted, '#cbd5e1');
    labels.push({ text: `${t.label}\n${pct(t.onTimeRate)}`, fontSize: 6.5, color: COLORS.muted, alignment: 'center', absolutePosition: undefined, width: slot });
  });
  return {
    stack: [
      { canvas: shapes },
      { columns: labels.map((l) => ({ ...l, width: slot })), columnGap: 0, margin: [0, 3, 0, 0] },
      {
        columns: [
          { text: '■ včas', color: '#2f9e8f', fontSize: 7, width: 'auto' },
          { text: '■ pozdě', color: '#e0a43a', fontSize: 7, width: 'auto' },
          { text: '■ nedokončeno', color: '#94a3b8', fontSize: 7, width: 'auto' },
        ],
        columnGap: 12,
        margin: [0, 4, 0, 0],
      },
    ],
  };
}

export function reportDocDefinition(d: MonthlyReportData, meta: { reportId: string; version: number; hash: string }): TDocumentDefinitions {
  const monthName = `${MONTH_NAMES[d.reportingMonth - 1]} ${d.reportingYear}`;
  const t = d.total;
  const head = ['Útvar', 'Plán', 'Dokonč.', 'Včas', 'Pozdě', 'Nedok.', 'Zruš.', 'Včasnost'].map((x, i) => ({ text: x, style: 'th', alignment: i ? 'right' : 'left' }));
  const prev = d.trend.length >= 2 ? d.trend[d.trend.length - 2] : null;
  const delta = prev && prev.onTimeRate !== null && t.onTimeRate !== null ? (t.onTimeRate - prev.onTimeRate) * 100 : null;

  const content: any[] = [
    { text: 'MĚSÍČNÍ MANAŽERSKÝ REPORT', style: 'small', characterSpacing: 1.5, color: COLORS.teal, bold: true },
    { text: `Plnění interních kontrol – ${monthName}`, style: 'h1', margin: [0, 2, 0, 2] },
    { text: `${d.scopeLabel} · období ${fmtDate(d.periodFrom)} – ${fmtDate(d.periodTo)} · stav k ${fmtDate(d.asOfDate)}`, style: 'small', margin: [0, 0, 0, 12] },
    {
      columns: [
        tile('Naplánováno', String(t.planned), 'běhy s termínem v měsíci'),
        tile('Dokončeno', String(t.completed), `z toho včas ${t.onTime}`),
        tile('Opožděně', String(t.late), 'dokončeno po termínu', COLORS.amber),
        tile('Nedokončeno', String(t.notCompleted), `po termínu ${t.overdueOpen}`, t.notCompleted ? COLORS.red : COLORS.navy),
        tile('Včasné plnění', pct(t.onTimeRate), delta === null ? 'bez srovnání' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')} p. b. vs. minulý měsíc`, t.onTimeRate !== null && t.onTimeRate < 0.85 ? COLORS.red : COLORS.green),
      ],
      columnGap: 6,
    },
    sectionTitle('Plnění podle útvarů'),
    {
      table: { headerRows: 1, widths: ['*', 34, 38, 32, 32, 36, 30, 50], body: [head, ...d.departments.map((r) => metricsRow(r)), metricsRow(t, true)] },
      layout: tableLayout,
    },
    sectionTitle('Vývoj za posledních 6 měsíců'),
    trendChart(d.trend),
    sectionTitle(`Významná zjištění v měsíci (${d.significantFindings.length})`),
    d.significantFindings.length
      ? {
          table: {
            headerRows: 1,
            widths: [62, 50, '*', 45, 70, 45],
            body: [
              ['Kód', 'Kontrola', 'Popis', 'Závažnost', 'Odpovědná osoba', 'Stav'].map((x) => ({ text: x, style: 'th' })),
              ...d.significantFindings.map((f) => [f.code, f.controlCode, f.description, SEVERITY_LABELS[f.severity], f.responsible, FINDING_STATUS_LABELS[f.status]].map((x) => ({ text: x, style: 'td' }))),
            ],
          },
          layout: tableLayout,
        }
      : { text: 'V měsíci nebyla založena žádná zjištění vysoké nebo kritické závažnosti.', style: 'small' },
    sectionTitle(`Otevřená nápravná opatření k ${fmtDate(d.asOfDate)} (${d.openFindings.length})`),
    d.openFindings.length
      ? {
          table: {
            headerRows: 1,
            widths: [62, 50, '*', 45, 70, 48],
            body: [
              ['Kód', 'Kontrola', 'Popis', 'Závažnost', 'Odpovědná osoba', 'Termín'].map((x) => ({ text: x, style: 'th' })),
              ...d.openFindings.map((f) => [
                { text: f.code, style: 'td' },
                { text: f.controlCode, style: 'td' },
                { text: f.description, style: 'td' },
                { text: SEVERITY_LABELS[f.severity], style: 'td' },
                { text: f.responsible, style: 'td' },
                { text: `${fmtDate(f.dueDate)}${f.overdue ? ' (po termínu)' : ''}`, style: 'td', color: f.overdue ? COLORS.red : COLORS.text },
              ]),
            ],
          },
          layout: tableLayout,
        }
      : { text: 'Žádná otevřená nápravná opatření.', style: 'small' },
    sectionTitle('Problémové kontroly'),
    d.problemControls.length
      ? {
          table: {
            headerRows: 1,
            widths: [55, '*', 50, 35, 35, 45],
            body: [
              ['Kód', 'Název', 'Útvar', 'Plán', 'Pozdě', 'Po termínu'].map((x) => ({ text: x, style: 'th' })),
              ...d.problemControls.map((p) => [p.controlCode, p.name, p.department, String(p.planned), String(p.late), String(p.notCompleted)].map((x) => ({ text: x, style: 'td' }))),
            ],
          },
          layout: tableLayout,
        }
      : { text: 'Bez problémových kontrol.', style: 'small' },
    sectionTitle('Definice ukazatelů'),
    { ul: Object.values(d.definitions).map((x) => ({ text: x, style: 'small' })) },
    { text: `Report ${meta.reportId} · verze ${meta.version} · vytvořil ${d.generatedBy.name} ${fmtDateTime(d.generatedAt)} · SHA-256 ${meta.hash}`, style: 'small', margin: [0, 14, 0, 0] },
  ];

  return {
    pageSize: 'A4',
    pageMargins: [40, 64, 40, 48],
    info: { title: `Měsíční report ${monthName}`, author: 'CONTROL HUB', creator: 'CONTROL HUB – Internal Control Management' },
    header: () => ({
      margin: [40, 22, 40, 0],
      columns: [
        { svg: LOGO_SVG, width: 20 },
        { stack: [{ text: 'CONTROL HUB', bold: true, fontSize: 10, color: COLORS.navy }, { text: 'Internal Control Management', fontSize: 7, color: COLORS.muted }], margin: [6, 1, 0, 0] },
        { text: `${monthName} · v${meta.version}`, alignment: 'right', fontSize: 7.5, color: COLORS.muted, margin: [0, 6, 0, 0] },
      ],
    }),
    footer: (current: number, total: number) => ({
      margin: [40, 14, 40, 0],
      columns: [
        { text: 'Interní dokument – syntetická demo data · archivní snapshot, nepřepočítává se', fontSize: 7, color: COLORS.muted },
        { text: `Strana ${current} / ${total}`, alignment: 'right', fontSize: 7, color: COLORS.muted },
      ],
    }),
    content,
    styles: baseStyles as any,
    defaultStyle: { font: 'Roboto', fontSize: 9, color: COLORS.text, lineHeight: 1.15 },
  };
}

export function renderReportPdf(d: MonthlyReportData, meta: { reportId: string; version: number; hash: string }): Promise<Blob> {
  return renderPdf(reportDocDefinition(d, meta));
}
