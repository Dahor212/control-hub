/** Náhledy protokolu a měsíčního reportu – vykreslené výhradně ze zmrazených snapshotů. */
import { useState } from 'react';
import { Download, FileCheck2, ShieldCheck } from 'lucide-react';
import { ANSWER_LABELS, FINDING_STATUS_LABELS, MONTH_NAMES, RESULT_LABELS, RISK_LABELS, SEVERITY_LABELS } from '../../domain/labels';
import { verifyProtocolIntegrity } from '../../domain/protocol';
import { canonicalJson, sha256Hex } from '../../domain/ids';
import type { ProtocolRecord, ReportSnapshot } from '../../domain/types';
import { ensureProtocolPdf, getDocumentBlob } from '../../services/documentService';
import { ensureReportPdf } from '../../services/reportService';
import { useApp, Logo } from '../AppContext';
import { Dialog } from '../components/Dialog';
import { Badge, Button, cx } from '../components/ui';
import { useToast } from '../components/Toast';
import { downloadBlob } from '../download';
import { fmtDate, fmtDateTime, fmtPct, fmtSize } from '../format';

export async function downloadProtocol(ctx: ReturnType<typeof useApp>['ctx'], p: ProtocolRecord) {
  const doc = await ensureProtocolPdf(ctx, p.ProtocolId);
  const file = await getDocumentBlob(ctx.store, doc.DocumentId);
  if (!file) throw new Error('Soubor PDF nebyl v úložišti nalezen.');
  downloadBlob(file.blob, file.name);
}

export async function downloadReport(ctx: ReturnType<typeof useApp>['ctx'], r: ReportSnapshot) {
  const doc = await ensureReportPdf(ctx, r.ReportId);
  const file = await getDocumentBlob(ctx.store, doc.DocumentId);
  if (!file) throw new Error('Soubor PDF nebyl v úložišti nalezen.');
  downloadBlob(file.blob, file.name);
}

function Paper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[820px] rounded-md border border-slate-200 bg-white px-10 py-8 text-[13px] text-slate-800 shadow-sm">{children}</div>;
}

function PaperHeader({ right }: { right: string }) {
  return (
    <div className="mb-6 flex items-center gap-3 border-b border-slate-200 pb-3">
      <Logo size={24} />
      <div className="flex-1 leading-tight">
        <p className="text-[13px] font-semibold text-navy-900">CONTROL HUB</p>
        <p className="text-[10.5px] text-slate-500">Internal Control Management</p>
      </div>
      <span className="text-[11px] text-slate-500">{right}</span>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 mb-2 border-b border-slate-200 pb-1 text-[13px] font-semibold text-navy-900">{children}</h3>;
}

export function ProtocolPreview({ protocol, open, onClose }: { protocol: ProtocolRecord | null; open: boolean; onClose: () => void }) {
  const { ctx, run } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!protocol) return null;
  const s = protocol.SnapshotData;
  const r = s.run;
  const kv = (k: string, v: React.ReactNode) => (
    <div>
      <p className="text-[10.5px] text-slate-500">{k}</p>
      <p className="text-[12.5px]">{v || '—'}</p>
    </div>
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={`Protokol ${protocol.ProtocolId}`}
      description={protocol.Status === 'Superseded' ? `Nahrazená verze – platná je ${protocol.SupersededBy}` : 'Platná verze protokolu. Obsah je neměnný snapshot z okamžiku uzavření běhu.'}
      footer={
        <>
          <Button
            icon={ShieldCheck}
            onClick={async () => {
              const ok = await verifyProtocolIntegrity(protocol);
              toast.push(ok ? { tone: 'success', title: 'Integrita ověřena', details: [`SHA-256 snapshotu odpovídá uloženému hashi ${protocol.ContentHash.slice(0, 16)}…`] } : { tone: 'error', title: 'Integrita NEODPOVÍDÁ', details: ['Snapshot byl změněn mimo řízený proces.'] });
            }}
          >
            Ověřit integritu
          </Button>
          <Button
            variant="primary"
            icon={Download}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await run(() => downloadProtocol(ctx, protocol));
              setBusy(false);
            }}
          >
            Stáhnout PDF
          </Button>
        </>
      }
    >
      <div className="bg-slate-100/70 p-4">
        <Paper>
          <PaperHeader right={s.protocolId} />
          <p className="text-[10.5px] font-bold tracking-[0.15em] text-teal-700">KONTROLNÍ PROTOKOL</p>
          <h2 className="mt-1 text-lg font-semibold text-navy-900">
            {s.control.code} · {s.control.name}
          </h2>
          <p className="text-[12px] text-slate-500">
            Běh {r.runCode} · období {fmtDate(r.periodFrom)} – {fmtDate(r.periodTo)}
          </p>
          <div className="mt-4 flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-[10.5px] text-slate-500">Celkový výsledek</p>
              <p className={cx('text-base font-bold', r.result === 'NoFindings' ? 'text-emerald-700' : r.result === 'NotMet' ? 'text-rose-700' : 'text-amber-700')}>{r.result ? RESULT_LABELS[r.result] : '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10.5px] text-slate-500">Verze protokolu</p>
              <p className="font-semibold">v{s.protocolVersion}</p>
            </div>
          </div>
          {s.correction.isCorrection && <p className="mt-2 text-[12px] text-amber-700">Opravená verze. Důvod: {s.correction.reason} (nahrazuje {s.correction.supersedesProtocolId})</p>}
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2.5">
            {kv('Odpovědný útvar', s.control.departmentName)}
            {kv('Rizikovost', RISK_LABELS[s.control.riskLevel])}
            {kv('Frekvence', s.version.recurrence)}
            {kv('Verze metodiky', `v${s.version.number} (od ${fmtDate(s.version.effectiveFrom)})`)}
            {kv('Odpovědná osoba', r.owner?.name)}
            {kv('Kontrolu provedl(a)', r.performedBy?.name)}
            {kv('Plánováno / termín', `${fmtDate(r.scheduledDate)} / ${fmtDate(r.dueDate)}`)}
            {kv('Včasnost', r.onTime ? 'Provedeno včas' : `Po termínu (${r.daysLate} dní)`)}
            {kv('Zahájení', fmtDateTime(r.startedAt))}
            {kv('Provedení (odeslání)', fmtDateTime(r.submittedAt))}
          </div>
          <H2>Účel a metodika</H2>
          <p className="mb-1.5">
            <b>Cíl:</b> {s.version.objective}
          </p>
          <p className="mb-1.5 text-slate-600">{s.version.description}</p>
          <p className="whitespace-pre-line text-slate-600">{s.version.instructions}</p>
          <H2>Kontrolní kroky</H2>
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-left text-[11px] text-slate-500">
              <tr>
                <th className="px-2 py-1">#</th>
                <th className="px-2 py-1">Krok</th>
                <th className="px-2 py-1">Výsledek</th>
                <th className="px-2 py-1">Komentář</th>
              </tr>
            </thead>
            <tbody>
              {s.checklist.map((c, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1">{i + 1}</td>
                  <td className="px-2 py-1">{c.label}</td>
                  <td className={cx('px-2 py-1 font-medium', c.answer === 'NOK' ? 'text-rose-700' : c.answer === 'OK' ? 'text-emerald-700' : 'text-slate-500')}>{c.answer ? ANSWER_LABELS[c.answer] : '—'}</td>
                  <td className="px-2 py-1 text-slate-600">{c.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <H2>Komentáře</H2>
          <p>{r.resultComment || 'Bez komentáře.'}</p>
          {r.exceptionReason && <p className="mt-1 text-slate-600">Výjimka: {r.exceptionReason}</p>}
          <H2>Přílohy ({s.attachments.length})</H2>
          {s.attachments.length ? (
            <ul className="space-y-0.5 text-[12px]">
              {s.attachments.map((a, i) => (
                <li key={i}>
                  {a.fileName} · {a.evidence ?? 'Ostatní'} · {fmtSize(a.fileSize)} · {a.uploadedBy}, {fmtDateTime(a.uploadedAt)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">Bez příloh.</p>
          )}
          <H2>Zjištění a nápravná opatření ({s.findings.length})</H2>
          {s.findings.length ? (
            <ul className="space-y-1 text-[12px]">
              {s.findings.map((f) => (
                <li key={f.code}>
                  <b>{f.code}</b> ({SEVERITY_LABELS[f.severity]}) – {f.description} · opatření: {f.correctiveAction || '—'} · {f.responsible}, termín {fmtDate(f.dueDate)} · {FINDING_STATUS_LABELS[f.status]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">Bez zjištění.</p>
          )}
          <H2>Schválení</H2>
          {s.version.approvalRequired ? (
            <p>
              Schválil(a) <b>{r.approvedBy?.name ?? '—'}</b> dne {fmtDateTime(r.approvedAt)} · princip čtyř očí {r.approvedBy && r.performedBy && r.approvedBy.email !== r.performedBy.email ? 'dodržen' : '—'}
            </p>
          ) : (
            <p className="text-slate-500">Kontrola nevyžaduje schválení.</p>
          )}
          <p className="mt-6 border-t border-slate-200 pt-2 text-[10.5px] break-all text-slate-400">
            Vygenerováno {fmtDateTime(s.generatedAt)} ({s.generatedBy.name}) · SHA-256 {protocol.ContentHash}
          </p>
        </Paper>
      </div>
    </Dialog>
  );
}

export function ReportPreview({ report, open, onClose }: { report: ReportSnapshot | null; open: boolean; onClose: () => void }) {
  const { ctx, run } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!report) return null;
  const d = report.SnapshotData;
  const t = d.total;
  const month = `${MONTH_NAMES[d.reportingMonth - 1]} ${d.reportingYear}`;
  const max = Math.max(1, ...d.trend.map((x) => x.planned));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={`Měsíční report – ${month}`}
      description={`Archivní snapshot (verze ${report.ReportVersion}) vytvořený ${fmtDateTime(report.GeneratedAt)}. Nepřepočítává se podle aktuálních dat.`}
      footer={
        <>
          <Button
            icon={ShieldCheck}
            onClick={async () => {
              const ok = (await sha256Hex(canonicalJson(report.SnapshotData))) === report.ContentHash;
              toast.push(ok ? { tone: 'success', title: 'Integrita reportu ověřena' } : { tone: 'error', title: 'Integrita reportu NEODPOVÍDÁ' });
            }}
          >
            Ověřit integritu
          </Button>
          <Button
            variant="primary"
            icon={Download}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await run(() => downloadReport(ctx, report));
              setBusy(false);
            }}
          >
            Stáhnout PDF
          </Button>
        </>
      }
    >
      <div className="bg-slate-100/70 p-4">
        <Paper>
          <PaperHeader right={`${report.ReportId}`} />
          <p className="text-[10.5px] font-bold tracking-[0.15em] text-teal-700">MĚSÍČNÍ MANAŽERSKÝ REPORT</p>
          <h2 className="mt-1 text-lg font-semibold text-navy-900">Plnění interních kontrol – {month}</h2>
          <p className="text-[12px] text-slate-500">
            {d.scopeLabel} · stav k {fmtDate(d.asOfDate)} · vytvořil(a) {d.generatedBy.name}
          </p>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {[
              ['Naplánováno', t.planned],
              ['Dokončeno', t.completed],
              ['Opožděně', t.late],
              ['Nedokončeno', t.notCompleted],
              ['Včasné plnění', fmtPct(t.onTimeRate, 1)],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded border border-slate-200 px-3 py-2">
                <p className="text-[10.5px] text-slate-500">{k}</p>
                <p className="text-lg font-bold text-navy-900 tabular">{v}</p>
              </div>
            ))}
          </div>
          <H2>Plnění podle útvarů</H2>
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-[11px] text-slate-500">
              <tr>
                {['Útvar', 'Plán', 'Dokonč.', 'Včas', 'Pozdě', 'Nedok.', 'Zruš.', 'Včasnost'].map((h, i) => (
                  <th key={h} className={cx('px-2 py-1', i ? 'text-right' : 'text-left')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...d.departments, t].map((r) => (
                <tr key={r.key} className={cx('border-t border-slate-100', r.key === 'TOTAL' && 'font-semibold')}>
                  <td className="px-2 py-1">{r.label}</td>
                  {[r.planned, r.completed, r.onTime, r.late, r.notCompleted, r.cancelled].map((v, i) => (
                    <td key={i} className="px-2 py-1 text-right tabular">
                      {v}
                    </td>
                  ))}
                  <td className={cx('px-2 py-1 text-right tabular', r.onTimeRate !== null && r.onTimeRate < 0.85 && 'text-rose-700')}>{fmtPct(r.onTimeRate, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <H2>Vývoj za 6 měsíců</H2>
          <div className="flex h-36 items-end gap-3">
            {d.trend.map((x) => (
              <div key={x.monthKey} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full max-w-[46px] flex-col-reverse gap-[2px]" style={{ height: `${(x.planned / max) * 100}px` }}>
                  <div className="rounded-b-sm bg-[#0ca30c]" style={{ flex: x.onTime }} />
                  <div className="bg-[#eda100]" style={{ flex: x.late }} />
                  <div className="rounded-t-sm bg-[#cbd5e1]" style={{ flex: x.notCompleted }} />
                </div>
                <span className="text-[10.5px] text-slate-500">{x.label}</span>
                <span className="text-[10.5px] font-medium tabular">{fmtPct(x.onTimeRate)}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 flex gap-4 text-[10.5px] text-slate-500">
            <span>■ včas</span>
            <span className="text-amber-600">■ pozdě</span>
            <span className="text-slate-400">■ nedokončeno</span>
          </p>
          <H2>Významná zjištění v měsíci ({d.significantFindings.length})</H2>
          {d.significantFindings.length ? (
            <ul className="space-y-0.5 text-[12px]">
              {d.significantFindings.map((f) => (
                <li key={f.code}>
                  <b>{f.code}</b> {f.controlCode} – {f.description} ({SEVERITY_LABELS[f.severity]}, {FINDING_STATUS_LABELS[f.status]})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">Žádná zjištění vysoké nebo kritické závažnosti.</p>
          )}
          <H2>Otevřená nápravná opatření ({d.openFindings.length})</H2>
          {d.openFindings.length ? (
            <ul className="space-y-0.5 text-[12px]">
              {d.openFindings.slice(0, 15).map((f) => (
                <li key={f.code}>
                  <b>{f.code}</b> {f.controlCode} – {f.description} · {f.responsible} · termín {fmtDate(f.dueDate)} {f.overdue && <Badge tone="red">po termínu</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">Žádná.</p>
          )}
          <H2>Problémové kontroly</H2>
          {d.problemControls.length ? (
            <ul className="space-y-0.5 text-[12px]">
              {d.problemControls.map((p) => (
                <li key={p.controlCode}>
                  <b>{p.controlCode}</b> {p.name} – plán {p.planned}, pozdě {p.late}, po termínu {p.notCompleted}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">Bez problémových kontrol.</p>
          )}
          <H2>Definice ukazatelů</H2>
          <ul className="list-disc space-y-0.5 pl-4 text-[11.5px] text-slate-600">
            {Object.values(d.definitions).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="mt-6 flex items-center gap-1.5 border-t border-slate-200 pt-2 text-[10.5px] break-all text-slate-400">
            <FileCheck2 className="size-3 shrink-0" /> SHA-256 {report.ContentHash}
          </p>
        </Paper>
      </div>
    </Dialog>
  );
}
