/** PDF kontrolního protokolu – vykresluje se výhradně z neměnného snapshotu. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { ANSWER_LABELS, FINDING_STATUS_LABELS, RESULT_LABELS, RISK_LABELS, SEVERITY_LABELS } from '../domain/labels';
import type { ProtocolSnapshot } from '../domain/types';
import { COLORS, LOGO_SVG, baseStyles, fmtDate, fmtDateTime, fmtSize, renderPdf, sectionTitle, tableLayout } from './pdfmake';

const resultColor = (r: string | null) =>
  r === 'NoFindings' ? COLORS.green : r === 'NotAssessable' ? COLORS.muted : r === 'PartiallyMet' || r === 'WithFindings' ? COLORS.amber : COLORS.red;

function kv(label: string, value: string): any {
  return { stack: [{ text: label, style: 'label' }, { text: value || '—', style: 'value', margin: [0, 1, 0, 0] }], margin: [0, 0, 0, 6] };
}

export function protocolDocDefinition(s: ProtocolSnapshot, contentHash: string): TDocumentDefinitions {
  const r = s.run;
  const info = [
    [kv('Kontrola', `${s.control.code} – ${s.control.name}`), kv('Kontrolované období', `${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)} (${r.runCode})`)],
    [kv('Odpovědný útvar', s.control.departmentName), kv('Oblast / kategorie', s.control.category)],
    [kv('Rizikovost', RISK_LABELS[s.control.riskLevel]), kv('Frekvence', s.version.recurrence)],
    [kv('Odpovědná osoba', r.owner?.name ?? '—'), kv('Kontrolu provedl(a)', r.performedBy?.name ?? '—')],
    [kv('Plánováno / termín splnění', `${fmtDate(r.scheduledDate)} / ${fmtDate(r.dueDate)}`), kv('Včasnost', r.onTime ? 'Provedeno včas' : `Provedeno po termínu (${r.daysLate} dní)`)],
    [kv('Zahájení provedení', fmtDateTime(r.startedAt)), kv('Provedení (odeslání)', fmtDateTime(r.submittedAt))],
    [kv('Dokončení', fmtDateTime(r.completedAt)), kv('Verze metodiky', `v${s.version.number} (účinná od ${fmtDate(s.version.effectiveFrom)})`)],
  ];

  const checklistBody: any[] = [
    [
      { text: '#', style: 'th' },
      { text: 'Kontrolní krok', style: 'th' },
      { text: 'Výsledek', style: 'th' },
      { text: 'Komentář', style: 'th' },
    ],
    ...s.checklist.map((c, i) => [
      { text: String(i + 1), style: 'td' },
      { text: `${c.label}${c.required ? '' : ' (nepovinné)'}`, style: 'td' },
      { text: c.answer ? ANSWER_LABELS[c.answer] : '—', style: 'td', color: c.answer === 'NOK' ? COLORS.red : c.answer === 'OK' ? COLORS.green : COLORS.muted, bold: c.answer === 'NOK' },
      { text: c.comment || '—', style: 'td' },
    ]),
  ];

  const attachmentsBody: any[] = [
    [
      { text: 'Soubor', style: 'th' },
      { text: 'Požadovaný dokument', style: 'th' },
      { text: 'Velikost', style: 'th' },
      { text: 'Nahráno', style: 'th' },
      { text: 'Autor', style: 'th' },
    ],
    ...s.attachments.map((a) => [
      { text: a.fileName, style: 'td' },
      { text: a.evidence ?? 'Ostatní', style: 'td' },
      { text: fmtSize(a.fileSize), style: 'td' },
      { text: fmtDateTime(a.uploadedAt), style: 'td' },
      { text: a.uploadedBy, style: 'td' },
    ]),
  ];

  const findingsBody: any[] = [
    [
      { text: 'Kód', style: 'th' },
      { text: 'Zjištění / nápravné opatření', style: 'th' },
      { text: 'Závažnost', style: 'th' },
      { text: 'Odpovědná osoba', style: 'th' },
      { text: 'Termín', style: 'th' },
      { text: 'Stav', style: 'th' },
    ],
    ...s.findings.map((f) => [
      { text: f.code, style: 'td' },
      { stack: [{ text: f.description, style: 'td' }, { text: f.correctiveAction ? `Opatření: ${f.correctiveAction}` : '', style: 'small' }] },
      { text: SEVERITY_LABELS[f.severity], style: 'td' },
      { text: f.responsible, style: 'td' },
      { text: fmtDate(f.dueDate), style: 'td' },
      { text: FINDING_STATUS_LABELS[f.status], style: 'td' },
    ]),
  ];

  const content: any[] = [
    { text: 'KONTROLNÍ PROTOKOL', style: 'small', characterSpacing: 1.5, color: COLORS.teal, bold: true },
    { text: `${s.control.code} · ${s.control.name}`, style: 'h1', margin: [0, 2, 0, 2] },
    { text: `Běh ${r.runCode} · období ${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)}`, style: 'small', margin: [0, 0, 0, 10] },
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              columns: [
                { stack: [{ text: 'Celkový výsledek', style: 'label' }, { text: r.result ? RESULT_LABELS[r.result] : '—', fontSize: 13, bold: true, color: resultColor(r.result) }] },
                { stack: [{ text: 'Identifikátor protokolu', style: 'label', alignment: 'right' }, { text: s.protocolId, fontSize: 9, bold: true, alignment: 'right', color: COLORS.navy }] },
              ],
              margin: [8, 6, 8, 6],
            },
          ],
        ],
      },
      layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => COLORS.line, vLineColor: () => COLORS.line, fillColor: () => COLORS.soft },
      margin: [0, 0, 0, 10],
    },
    ...(s.correction.isCorrection
      ? [
          {
            text: `Opravená verze protokolu (v${s.protocolVersion}). Nahrazuje ${s.correction.supersedesProtocolId ?? 'předchozí verzi'}. Důvod opravy: ${s.correction.reason}`,
            style: 'small',
            color: COLORS.amber,
            margin: [0, 0, 0, 8],
          },
        ]
      : []),
    { columns: [{ stack: info.map((x) => x[0]) }, { stack: info.map((x) => x[1]) }], columnGap: 20 },
    sectionTitle('Účel a metodika kontroly'),
    kv('Cíl kontroly', s.version.objective),
    kv('Popis', s.version.description),
    kv('Postup (metodika)', s.version.instructions),
    sectionTitle('Kontrolní kroky a jejich výsledek'),
    { table: { headerRows: 1, widths: [14, '*', 70, '*'], body: checklistBody }, layout: tableLayout },
    sectionTitle('Komentáře'),
    kv('Komentář k výsledku', r.resultComment || 'Bez komentáře.'),
    ...(r.exceptionReason ? [kv('Důvod výjimky', r.exceptionReason)] : []),
    ...(r.returnCount ? [kv('Vrácení k doplnění', `${r.returnCount}×`)] : []),
    sectionTitle(`Seznam příloh (${s.attachments.length})`),
    s.attachments.length
      ? { table: { headerRows: 1, widths: ['*', 110, 45, 70, 80], body: attachmentsBody }, layout: tableLayout }
      : { text: 'Bez příloh.', style: 'small' },
    sectionTitle(`Zjištěné nedostatky a nápravná opatření (${s.findings.length})`),
    s.findings.length
      ? { table: { headerRows: 1, widths: [62, '*', 45, 75, 48, 45], body: findingsBody }, layout: tableLayout }
      : { text: 'Bez zjištění.', style: 'small' },
    sectionTitle('Schválení'),
    s.version.approvalRequired
      ? {
          columns: [
            kv('Schvalovatel', r.approvedBy?.name ?? r.reviewer?.name ?? '—'),
            kv('Datum schválení', fmtDateTime(r.approvedAt)),
            kv('Princip čtyř očí', r.approvedBy && r.performedBy && r.approvedBy.email !== r.performedBy.email ? 'Dodržen (provedl a schválil jiný pracovník)' : '—'),
          ],
          columnGap: 16,
        }
      : { text: 'Kontrola nevyžaduje schválení – uzavřena provedením.', style: 'small' },
    {
      text: `Protokol vygenerován ${fmtDateTime(s.generatedAt)} (${s.generatedBy.name}) ze zmrazeného snapshotu. Integrita: SHA-256 ${contentHash}`,
      style: 'small',
      margin: [0, 18, 0, 0],
    },
  ];

  return {
    pageSize: 'A4',
    pageMargins: [40, 64, 40, 48],
    info: { title: `Protokol ${s.protocolId}`, author: 'CONTROL HUB', subject: `${s.control.code} ${r.runCode}`, creator: 'CONTROL HUB – Internal Control Management' },
    header: () => ({
      margin: [40, 22, 40, 0],
      columns: [
        { svg: LOGO_SVG, width: 20 },
        { stack: [{ text: 'CONTROL HUB', bold: true, fontSize: 10, color: COLORS.navy }, { text: 'Internal Control Management', fontSize: 7, color: COLORS.muted }], margin: [6, 1, 0, 0] },
        { text: s.protocolId, alignment: 'right', fontSize: 7.5, color: COLORS.muted, margin: [0, 6, 0, 0] },
      ],
    }),
    footer: (current: number, total: number) => ({
      margin: [40, 14, 40, 0],
      columns: [
        { text: `Interní dokument – demo data · ${s.protocolId} · hash ${contentHash.slice(0, 16)}…`, fontSize: 7, color: COLORS.muted },
        { text: `Strana ${current} / ${total}`, alignment: 'right', fontSize: 7, color: COLORS.muted },
      ],
    }),
    content,
    styles: baseStyles as any,
    defaultStyle: { font: 'Roboto', fontSize: 9, color: COLORS.text, lineHeight: 1.15 },
  };
}

export function renderProtocolPdf(snapshot: ProtocolSnapshot, hash: string): Promise<Blob> {
  return renderPdf(protocolDocDefinition(snapshot, hash));
}
