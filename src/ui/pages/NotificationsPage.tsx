import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, CheckCheck, CopyX, MailWarning, PlayCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { can } from '../../domain/permissions';
import { NOTIFICATION_TYPE_LABELS, DELIVERY_LABELS } from '../../domain/labels';
import type { NotificationRecord, NotificationType, DeliveryStatus } from '../../domain/types';
import { markNotificationsRead, retryFailedNotifications, runDailyDeadlineCheck, type DeadlineCheckResult } from '../../services/notificationService';
import { useApp } from '../AppContext';
import { useUsers } from '../hooks';
import { DataTable } from '../components/DataTable';
import { MultiSelect } from '../components/Popover';
import { PaRef } from '../components/PaRef';
import { DeliveryBadge } from '../components/StatusBadges';
import { Badge, Button, Card, CardHeader, EmptyState, Notice, PageHeader, Tabs, cx } from '../components/ui';
import { fmtDate, fmtDateTime } from '../format';

type Tab = 'inbox' | 'log' | 'simulate';

export function NotificationsPage() {
  const { store, version, session, ctx, run, today, settings } = useApp();
  const { name } = useUsers();
  const nav = useNavigate();
  const canLog = can(session, 'viewNotificationLog');
  const canSim = can(session, 'simulateAutomation');
  const [tab, setTab] = useState<Tab>('inbox');
  const [types, setTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [result, setResult] = useState<DeadlineCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const all = useMemo(() => [...store.notifications.all()].sort((a, b) => b.CreatedAt.localeCompare(a.CreatedAt)), [store, version]);
  const mine = all.filter((n) => n.RecipientEmail === session.user.Email && n.DeliveryStatus !== 'Digested');
  const log = all.filter((n) => (types.length === 0 || types.includes(n.NotificationType)) && (statuses.length === 0 || statuses.includes(n.DeliveryStatus)) && (recipients.length === 0 || recipients.includes(n.RecipientEmail)));
  const failed = all.filter((n) => n.DeliveryStatus === 'Failed');
  const recipientOptions = [...new Set(all.map((n) => n.RecipientEmail))].map((e) => ({ value: e, label: name(e) })).sort((a, b) => a.label.localeCompare(b.label, 'cs'));

  return (
    <div>
      <PageHeader
        title="Centrum upozornění"
        subtitle="Upozornění na přidělení, blížící se termíny, prodlení, eskalace a schvalování. V cílovém řešení je odesílá Power Automate přes Outlook – zde jde o simulaci bez skutečných e-mailů."
        actions={
          canSim && (
            <PaRef id="ntf.simulate" inline>
              <Button
                variant="primary"
                icon={PlayCircle}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await run(() => runDailyDeadlineCheck(ctx), (x) => `Simulace k ${fmtDate(x.runDate)}: vytvořeno ${x.created.length}, duplicit zabráněno ${x.duplicates.length}.`);
                  setBusy(false);
                  if (r) {
                    setResult(r);
                    setTab('simulate');
                  }
                }}
              >
                Simulovat denní kontrolu termínů
              </Button>
            </PaRef>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'inbox', label: 'Moje upozornění', count: mine.filter((n) => !n.ReadAt).length, icon: BellRing },
          { value: 'log', label: 'Evidence všech upozornění', count: all.length, icon: MailWarning, hidden: !canLog },
          { value: 'simulate', label: 'Simulace a doručování', icon: RefreshCw, hidden: !canSim },
        ]}
      />

      {tab === 'inbox' && (
        <Card>
          <CardHeader
            title="Moje upozornění"
            subtitle={`Příjemce ${session.user.Email}`}
            actions={
              mine.some((n) => !n.ReadAt) && (
                <Button size="sm" icon={CheckCheck} onClick={() => markNotificationsRead(ctx, mine.filter((n) => !n.ReadAt).map((n) => n.NotificationId))}>
                  Označit vše jako přečtené
                </Button>
              )
            }
          />
          {mine.length === 0 ? (
            <EmptyState icon={BellRing} title="Nemáte žádná upozornění" />
          ) : (
            <ul className="divide-y divide-line">
              {mine.slice(0, 100).map((n) => (
                <li key={n.NotificationId} className={cx('flex gap-3 py-3', !n.ReadAt && 'bg-brand-50/40')}>
                  <span className={cx('mt-2 ml-1 size-2 shrink-0 rounded-full', n.ReadAt ? 'bg-slate-200' : 'bg-brand-500')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeBadge type={n.NotificationType} />
                      <span className="text-xs text-slate-400">{fmtDateTime(n.CreatedAt)}</span>
                    </div>
                    <p className="mt-1 text-[13.5px] font-medium text-slate-800">{n.Subject}</p>
                    <p className="text-[13px] whitespace-pre-line text-slate-600">{n.Body}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 pr-1">
                    {(n.RunId || n.ControlId) && (
                      <Button
                        size="sm"
                        onClick={() => {
                          void markNotificationsRead(ctx, [n.NotificationId]);
                          nav(n.RunId ? `/runs/${n.RunId}` : `/controls/${n.ControlId}`);
                        }}
                      >
                        Otevřít
                      </Button>
                    )}
                    {!n.ReadAt && (
                      <button className="text-xs text-brand-700 hover:underline" onClick={() => markNotificationsRead(ctx, [n.NotificationId])}>
                        Přečteno
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'log' && canLog && (
        <PaRef id="ntf.log">
          <Card>
            <div className="mb-4 flex flex-wrap gap-2">
              <MultiSelect label="Typ" value={types} onChange={setTypes} options={(Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[]).map((t) => ({ value: t, label: NOTIFICATION_TYPE_LABELS[t] }))} />
              <MultiSelect label="Doručení" value={statuses} onChange={setStatuses} options={(Object.keys(DELIVERY_LABELS) as DeliveryStatus[]).map((t) => ({ value: t, label: DELIVERY_LABELS[t] }))} width={220} />
              <MultiSelect label="Příjemce" value={recipients} onChange={setRecipients} options={recipientOptions} />
            </div>
            <NotificationTable rows={log} />
          </Card>
        </PaRef>
      )}

      {tab === 'simulate' && canSim && (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Jak simulace funguje" icon={ShieldCheck} />
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-slate-600">
                <li>Vyhodnotí všechny otevřené běhy aktivních kontrol k datu {fmtDate(today)}{settings.testDate ? ' (testovací datum)' : ''}.</li>
                <li>Připomínky: {settings.reminderDaysBefore.join(', ')} dní před termínem; po termínu {settings.overdueDaysAfter.join(', ')}. den; eskalace po {settings.escalationAfterDays} dnech vedoucímu útvaru{settings.escalateToCoordinator ? ' a koordinátorovi' : ''}; individuální pravidla kontroly mají přednost.</li>
                <li>Každé upozornění má deduplikační klíč (běh | typ | práh | příjemce). Opakované spuštění téhož dne nic nezdvojí.</li>
                <li>Při dohánění zmeškaných dní se posílá jen nejrelevantnější připomínka, ne „lavina“. Po dokončení běhu se další upozornění negenerují.</li>
                <li>Doručení je simulované (chybovost {Math.round(settings.simulatedFailureRate * 100)} %); neúspěšná odeslání lze opakovat (max. {settings.maxRetries} pokusy). Režim: {settings.digestMode === 'DailyDigest' ? 'denní souhrn' : 'jednotlivá upozornění'}.</li>
              </ul>
            </Card>
            <Card>
              <CardHeader title="Neúspěšná doručení" icon={MailWarning} />
              <p className="text-3xl font-semibold text-slate-900 tabular">{failed.length}</p>
              <p className="mb-4 text-[13px] text-slate-500">čeká na opakování (retry)</p>
              <PaRef id="ntf.retry" inline>
                <Button icon={RefreshCw} disabled={!failed.some((f) => f.RetryCount < settings.maxRetries)} onClick={() => run(() => retryFailedNotifications(ctx), (r) => `Opakováno ${r.attempted}: doručeno ${r.sent}, stále chyba ${r.stillFailed}.`)}>
                  Zopakovat neúspěšná odeslání
                </Button>
              </PaRef>
              <p className="mt-2 text-xs text-slate-500">Poslední kontrola termínů: {settings.lastDeadlineCheckDate ? fmtDate(settings.lastDeadlineCheckDate) : '—'}</p>
            </Card>
          </div>
          {result ? (
            <>
              <Card>
                <CardHeader title={`Výsledek simulace k ${fmtDate(result.runDate)}`} subtitle={`Vyhodnoceno ${result.evaluatedRuns} otevřených běhů · vytvořeno ${result.created.length} záznamů · chyb doručení ${result.failed}${result.digests ? ` · denních souhrnů ${result.digests}` : ''}`} />
                {result.created.length === 0 ? (
                  <Notice tone="teal">Systém by dnes nevytvořil žádné nové upozornění – vše relevantní už bylo odesláno (viz zabráněné duplicity níže).</Notice>
                ) : (
                  <NotificationTable rows={result.created} showReason />
                )}
              </Card>
              <Card>
                <CardHeader title={`Zabráněno duplicitám (${result.duplicates.length})`} subtitle="Tato upozornění by vznikla, ale jejich deduplikační klíč už existuje" icon={CopyX} />
                <DataTable
                  rows={result.duplicates}
                  rowKey={(d) => d.dedupKey}
                  dense
                  pageSize={10}
                  emptyTitle="Žádné duplicity"
                  columns={[
                    { key: 'type', header: 'Typ', render: (d) => <TypeBadge type={d.type} /> },
                    { key: 'to', header: 'Příjemce', render: (d) => name(d.recipient) },
                    { key: 'subj', header: 'Předmět', render: (d) => d.subject },
                    { key: 'key', header: 'Deduplikační klíč', render: (d) => <span className="font-mono text-[11px] break-all text-slate-500">{d.dedupKey}</span> },
                  ]}
                />
              </Card>
            </>
          ) : (
            <Card>
              <EmptyState icon={PlayCircle} title="Spusťte simulaci" description="Tlačítkem „Simulovat denní kontrolu termínů“ zobrazíte, která upozornění by systém dnes vytvořil, komu a proč. Testovací datum nastavíte v Administraci → Demo režim." />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: NotificationType }) {
  const tone = type === 'Escalation' || type === 'Overdue' || type === 'AutomationFailure' ? 'red' : type === 'DueReminder' ? 'amber' : type === 'ApprovalRequest' || type === 'ApprovalPending' ? 'violet' : type === 'Returned' ? 'orange' : type === 'Approved' ? 'green' : type === 'DailyDigest' ? 'teal' : 'blue';
  return <Badge tone={tone}>{NOTIFICATION_TYPE_LABELS[type]}</Badge>;
}

function NotificationTable({ rows, showReason }: { rows: NotificationRecord[]; showReason?: boolean }) {
  const { name } = useUsers();
  const nav = useNavigate();
  return (
    <DataTable
      rows={rows}
      rowKey={(n) => n.NotificationId}
      dense
      initialSort={{ key: 'at', dir: 'desc' }}
      onRowClick={(n) => (n.RunId ? nav(`/runs/${n.RunId}`) : n.ControlId ? nav(`/controls/${n.ControlId}`) : undefined)}
      columns={[
        { key: 'at', header: 'Vytvořeno', sort: (n) => n.CreatedAt, render: (n) => <span className="whitespace-nowrap tabular">{fmtDateTime(n.CreatedAt)}</span> },
        { key: 'type', header: 'Typ', sort: (n) => n.NotificationType, render: (n) => <TypeBadge type={n.NotificationType} /> },
        { key: 'to', header: 'Příjemce', sort: (n) => name(n.RecipientEmail), render: (n) => <span className="whitespace-nowrap">{name(n.RecipientEmail)}</span> },
        { key: 'subj', header: 'Předmět', render: (n) => <span className="text-slate-800">{n.Subject}</span> },
        ...(showReason ? [{ key: 'reason', header: 'Proč', render: (n: NotificationRecord) => <span className="text-[12.5px] text-slate-600">{n.Reason}</span> }] : []),
        { key: 'st', header: 'Doručení', sort: (n) => n.DeliveryStatus, render: (n) => <span className="inline-flex flex-col gap-0.5"><DeliveryBadge status={n.DeliveryStatus} />{n.ErrorMessage && <span className="max-w-[220px] text-[11px] text-rose-600">{n.ErrorMessage}</span>}</span> },
        { key: 'retry', header: 'Pokusy', align: 'right', sort: (n) => n.RetryCount, render: (n) => n.RetryCount },
      ]}
    />
  );
}
