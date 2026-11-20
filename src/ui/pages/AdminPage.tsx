import { useMemo, useRef, useState } from 'react';
import { Activity, BellRing, CalendarCog, Database, Download, FileUp, FlaskConical, History, ListOrdered, Plus, RefreshCw, RotateCcw, Save, Users } from 'lucide-react';
import { can } from '../../domain/permissions';
import { DUE_UNIT_LABELS, INVALID_DAY_LABELS, ROLE_LABELS, SHIFT_LABELS } from '../../domain/labels';
import { czechPublicHolidays, parseISODate } from '../../domain/dates';
import type { AppSettings, AuditEntityType, DueUnit, InvalidDayPolicy, LookupItem, LookupType, RoleName, ShiftRule } from '../../domain/types';
import { exportData, importData, resetDemoData, saveLookup, saveRoleAssignment, setPaReferenceMode, setTestDate, updateSettings, validateImport, type ExportFile } from '../../services/adminService';
import { generateOccurrences } from '../../services/controlService';
import { useApp } from '../AppContext';
import { useLookups, useUsers } from '../hooks';
import { AuditTable } from '../components/AuditTable';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { DataTable } from '../components/DataTable';
import { MultiSelect, UserPicker } from '../components/Popover';
import { PaRef } from '../components/PaRef';
import { Avatar, Badge, Button, Card, CardHeader, Checkbox, Field, Input, Notice, PageHeader, Segmented, Select, Switch, Tabs, cx } from '../components/ui';
import { NumberListInput } from '../dialogs/ControlWizard';
import { downloadCsv, downloadJson } from '../download';
import { fmtDate, fmtDateTime } from '../format';

type Tab = 'roles' | 'lookups' | 'rules' | 'planning' | 'audit' | 'tech' | 'demo';

export function AdminPage() {
  const { session } = useApp();
  const admin = can(session, 'administer');
  const [tab, setTab] = useState<Tab>(admin ? 'roles' : 'audit');
  return (
    <div>
      <PageHeader title="Administrace" subtitle={admin ? 'Konfigurace aplikace, uživatelé a role, číselníky, pravidla, audit a technický stav.' : 'Auditní log a technický stav (režim pouze pro čtení).'} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'roles', label: 'Uživatelé a role', icon: Users, hidden: !admin },
          { value: 'lookups', label: 'Číselníky', icon: ListOrdered, hidden: !admin },
          { value: 'rules', label: 'Pravidla upozornění', icon: BellRing, hidden: !admin },
          { value: 'planning', label: 'Nastavení opakování', icon: CalendarCog, hidden: !admin },
          { value: 'audit', label: 'Auditní log', icon: History },
          { value: 'tech', label: 'Technický stav', icon: Activity },
          { value: 'demo', label: 'Demo režim', icon: FlaskConical, hidden: !admin },
        ]}
      />
      {tab === 'roles' && <RolesTab />}
      {tab === 'lookups' && <LookupsTab />}
      {tab === 'rules' && <RulesTab />}
      {tab === 'planning' && <PlanningTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'tech' && <TechTab />}
      {tab === 'demo' && <DemoTab />}
    </div>
  );
}

function RolesTab() {
  const { store, version, ctx, run } = useApp();
  const { users } = useUsers();
  const { departments, deptLabel } = useLookups();
  const [dlg, setDlg] = useState<null | { AssignmentId?: string; UserEmail: string | null; Role: RoleName; DepartmentScope: string; IsActive: boolean }>(null);
  const [reason, setReason] = useState('');
  const roles = useMemo(() => store.roles.all(), [store, version]);
  return (
    <PaRef id="adm.roles">
      <Notice tone="amber" className="mb-4" title="Role v aplikaci ≠ zabezpečení">
        Přiřazení rolí řídí, co aplikace zobrazí a nabídne. Skutečné zabezpečení dat musí v produkci vynucovat oprávnění SharePointu (skupiny, úrovně oprávnění) a Microsoft 365 – skrytí ovládacího prvku samo o sobě není zabezpečení.
      </Notice>
      <Card>
        <CardHeader title="Uživatelé a přiřazení rolí" subtitle="Seznam IC_RoleAssignments · uživatelé z adresáře Microsoft 365 (zde simulovaný)" actions={<Button variant="primary" icon={Plus} onClick={() => { setReason(''); setDlg({ UserEmail: null, Role: 'ControlOwner', DepartmentScope: 'ALL', IsActive: true }); }}>Přidat roli</Button>} />
        <DataTable
          rows={users}
          rowKey={(u) => u.Email}
          pageSize={25}
          columns={[
            { key: 'u', header: 'Uživatel', sort: (u) => u.DisplayName, render: (u) => <span className="flex items-center gap-2.5"><Avatar initials={u.Initials} size="sm" /><span><span className="block font-medium text-slate-800">{u.DisplayName}</span><span className="block text-xs text-slate-500">{u.Email}</span></span></span> },
            { key: 'job', header: 'Pozice', hideBelow: 'lg', render: (u) => <span className="text-slate-600">{u.JobTitle}</span> },
            { key: 'dept', header: 'Útvar', render: (u) => deptLabel(u.Department) },
            {
              key: 'roles',
              header: 'Role (rozsah)',
              render: (u) => (
                <span className="flex flex-wrap gap-1">
                  {roles
                    .filter((r) => r.UserEmail === u.Email)
                    .map((r) => (
                      <button key={r.AssignmentId} onClick={() => { setReason(''); setDlg({ ...r }); }} className="focus:outline-none">
                        <Badge tone={r.IsActive ? 'blue' : 'neutral'} className={cx(!r.IsActive && 'line-through')}>
                          {ROLE_LABELS[r.Role]} · {r.DepartmentScope === 'ALL' ? 'vše' : r.DepartmentScope}
                        </Badge>
                      </button>
                    ))}
                </span>
              ),
            },
          ]}
        />
      </Card>
      <Dialog
        open={!!dlg}
        onClose={() => setDlg(null)}
        title={dlg?.AssignmentId ? 'Upravit přiřazení role' : 'Přidat roli'}
        size="sm"
        footer={
          <>
            <Button onClick={() => setDlg(null)}>Zrušit</Button>
            <Button
              variant="primary"
              disabled={!dlg?.UserEmail || reason.trim().length < 3}
              onClick={async () => {
                if (!dlg?.UserEmail) return;
                const ok = await run(() => saveRoleAssignment(ctx, { ...dlg, UserEmail: dlg.UserEmail! }, reason), 'Přiřazení role uloženo.');
                if (ok !== undefined) setDlg(null);
              }}
            >
              Uložit
            </Button>
          </>
        }
      >
        {dlg && (
          <div className="space-y-4">
            <Field label="Uživatel" required>
              {dlg.AssignmentId ? <Input value={dlg.UserEmail ?? ''} disabled /> : <UserPicker users={users} value={dlg.UserEmail} onChange={(v) => setDlg({ ...dlg, UserEmail: v })} />}
            </Field>
            <Field label="Role">
              <Select value={dlg.Role} onChange={(e) => setDlg({ ...dlg, Role: e.target.value as RoleName })} disabled={!!dlg.AssignmentId}>
                {Object.entries(ROLE_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rozsah útvaru" hint="Manažer vidí jen kontroly svého útvaru, pokud není rozsah „Všechny útvary“.">
              <Select value={dlg.DepartmentScope} onChange={(e) => setDlg({ ...dlg, DepartmentScope: e.target.value })}>
                <option value="ALL">Všechny útvary</option>
                {departments.map((d) => (
                  <option key={d.Code} value={d.Code}>
                    {d.Label}
                  </option>
                ))}
              </Select>
            </Field>
            <Switch checked={dlg.IsActive} onChange={(v) => setDlg({ ...dlg, IsActive: v })} label="Aktivní přiřazení" />
            <Field label="Důvod změny" required>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
        )}
      </Dialog>
    </PaRef>
  );
}

const LOOKUP_TYPES: Record<LookupType, string> = { Department: 'Útvary', Category: 'Kategorie kontrol', Priority: 'Priority', RiskLevel: 'Rizikovost', ResultType: 'Typy výsledků' };

function LookupsTab() {
  const { store, version, ctx, run } = useApp();
  const { users, name } = useUsers();
  const [type, setType] = useState<LookupType>('Department');
  const [dlg, setDlg] = useState<(Omit<LookupItem, 'LookupId'> & { LookupId?: string }) | null>(null);
  const [reason, setReason] = useState('');
  const items = useMemo(() => store.lookups.filter((l) => l.LookupType === type).sort((a, b) => a.SortOrder - b.SortOrder), [store, version, type]);
  const fixed = type === 'Priority' || type === 'RiskLevel' || type === 'ResultType';
  return (
    <PaRef id="adm.lookups">
      <Card>
        <CardHeader
          title="Číselníky"
          subtitle="Seznam IC_Lookups. Kódy jsou stabilní identifikátory – ukládají se do záznamů, proto je nelze měnit."
          actions={!fixed && <Button variant="primary" icon={Plus} onClick={() => { setReason(''); setDlg({ LookupType: type, Code: '', Label: '', SortOrder: items.length + 1, IsActive: true, ManagerEmail: null }); }}>Nová položka</Button>}
        />
        <div className="mb-4">
          <Segmented value={type} onChange={setType} options={(Object.keys(LOOKUP_TYPES) as LookupType[]).map((t) => ({ value: t, label: LOOKUP_TYPES[t] }))} />
        </div>
        {fixed && <Notice className="mb-4">Hodnoty jsou vázané na business logiku (výpočty, validace). Lze měnit popisky a pořadí, ne přidávat kódy.</Notice>}
        <DataTable
          rows={items}
          rowKey={(l) => l.LookupId}
          onRowClick={(l) => { setReason(''); setDlg({ ...l }); }}
          columns={[
            { key: 'code', header: 'Kód', render: (l) => <span className="font-mono text-xs">{l.Code}</span> },
            { key: 'label', header: 'Název', render: (l) => <span className="font-medium text-slate-800">{l.Label}</span> },
            { key: 'order', header: 'Pořadí', align: 'right', render: (l) => l.SortOrder },
            ...(type === 'Department' ? [{ key: 'mgr', header: 'Vedoucí (eskalace)', render: (l: LookupItem) => name(l.ManagerEmail) }] : []),
            { key: 'act', header: 'Stav', render: (l) => (l.IsActive ? <Badge tone="teal">Aktivní</Badge> : <Badge>Neaktivní</Badge>) },
          ]}
        />
      </Card>
      <Dialog
        open={!!dlg}
        onClose={() => setDlg(null)}
        title={dlg?.LookupId ? `Upravit ${dlg.Code}` : `Nová položka – ${LOOKUP_TYPES[type]}`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setDlg(null)}>Zrušit</Button>
            <Button variant="primary" disabled={reason.trim().length < 3} onClick={async () => { const ok = await run(() => saveLookup(ctx, dlg!, reason), 'Číselník uložen.'); if (ok !== undefined) setDlg(null); }}>
              Uložit
            </Button>
          </>
        }
      >
        {dlg && (
          <div className="space-y-4">
            <Field label="Kód" required hint="2–20 znaků A–Z, 0–9, - a _; po uložení neměnný.">
              <Input value={dlg.Code} disabled={!!dlg.LookupId} onChange={(e) => setDlg({ ...dlg, Code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Název" required>
              <Input value={dlg.Label} onChange={(e) => setDlg({ ...dlg, Label: e.target.value })} />
            </Field>
            <Field label="Pořadí">
              <Input type="number" value={dlg.SortOrder} onChange={(e) => setDlg({ ...dlg, SortOrder: Number(e.target.value) || 0 })} />
            </Field>
            {dlg.LookupType === 'Department' && (
              <Field label="Vedoucí útvaru (příjemce eskalací)">
                <UserPicker users={users} value={dlg.ManagerEmail} allowEmpty onChange={(v) => setDlg({ ...dlg, ManagerEmail: v })} />
              </Field>
            )}
            {!fixed && <Switch checked={dlg.IsActive} onChange={(v) => setDlg({ ...dlg, IsActive: v })} label="Aktivní (nabízí se ve formulářích)" />}
            <Field label="Důvod změny" required>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
        )}
      </Dialog>
    </PaRef>
  );
}

function useSettingsForm() {
  const { settings } = useApp();
  const [form, setForm] = useState<AppSettings>(settings);
  const [reason, setReason] = useState('');
  return { form, setForm, reason, setReason, dirty: JSON.stringify(form) !== JSON.stringify(settings) };
}

function SaveBar({ dirty, reason, setReason, onSave }: { dirty: boolean; reason: string; setReason: (v: string) => void; onSave: () => void }) {
  return (
    <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
      <Field label="Důvod změny" required className="min-w-[280px] flex-1">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Uloží se do auditní historie" />
      </Field>
      <Button variant="primary" icon={Save} disabled={!dirty || reason.trim().length < 3} onClick={onSave}>
        Uložit nastavení
      </Button>
    </div>
  );
}

function RulesTab() {
  const { ctx, run } = useApp();
  const { users } = useUsers();
  const { form, setForm, reason, setReason, dirty } = useSettingsForm();
  const set = (p: Partial<AppSettings>) => setForm({ ...form, ...p });
  return (
    <PaRef id="adm.rules">
      <Card>
        <CardHeader title="Globální pravidla upozornění a eskalací" subtitle="IC_Settings · platí pro kontroly bez individuálních pravidel. Vyhodnocuje FLOW-02 a FLOW-03." />
        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Připomínky před termínem (dny)" hint="Výchozí 7, 3, 1, 0 (0 = v den termínu)">
            <NumberListInput ariaLabel="Připomínky před termínem" value={form.reminderDaysBefore} onChange={(v) => set({ reminderDaysBefore: v })} />
          </Field>
          <Field label="Upozornění po termínu (dny)" hint="Výchozí 1, 3, 7">
            <NumberListInput ariaLabel="Upozornění po termínu" value={form.overdueDaysAfter} onChange={(v) => set({ overdueDaysAfter: v.filter((x) => x > 0) })} />
          </Field>
          <Field label="Eskalace po (dnech po termínu)">
            <Input type="number" min={1} max={60} value={form.escalationAfterDays} onChange={(e) => set({ escalationAfterDays: Number(e.target.value) || 1 })} />
          </Field>
          <Field label="Čekající schválení – připomenout po (dnech)">
            <Input type="number" min={1} max={30} value={form.approvalReminderDays} onChange={(e) => set({ approvalReminderDays: Number(e.target.value) || 1 })} />
          </Field>
          <Field label="„Blíží se termín“ (dny)">
            <Input type="number" min={0} max={30} value={form.dueSoonDays} onChange={(e) => set({ dueSoonDays: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Režim doručování">
            <Select value={form.digestMode} onChange={(e) => set({ digestMode: e.target.value as AppSettings['digestMode'] })}>
              <option value="Immediate">Jednotlivá upozornění</option>
              <option value="DailyDigest">Jeden denní souhrn na příjemce</option>
            </Select>
          </Field>
          <div className="space-y-2 md:col-span-3">
            <Checkbox label="Eskalovat vedoucímu útvaru (z číselníku Útvary)" checked={form.escalateToManager} onChange={(v) => set({ escalateToManager: v })} />
            <Checkbox label="Eskalovat koordinátorovi interních kontrol" checked={form.escalateToCoordinator} onChange={(v) => set({ escalateToCoordinator: v })} />
          </div>
          <Field label="Koordinátor (příjemce eskalací)">
            <UserPicker users={users} value={form.coordinatorEmail} onChange={(v) => set({ coordinatorEmail: v ?? '' })} />
          </Field>
          <Field label="Administrátor (chyby automatizací)">
            <UserPicker users={users} value={form.adminEmail} onChange={(v) => set({ adminEmail: v ?? '' })} />
          </Field>
          <Field label="Odesílací schránka (produkce)" hint="Sdílená schránka; vyžaduje oprávnění Send As.">
            <Input value={form.senderMailbox} onChange={(e) => set({ senderMailbox: e.target.value })} />
          </Field>
          <Field label="Simulovaná chybovost doručení (%)">
            <Input type="number" min={0} max={50} value={Math.round(form.simulatedFailureRate * 100)} onChange={(e) => set({ simulatedFailureRate: (Number(e.target.value) || 0) / 100 })} />
          </Field>
          <Field label="Max. počet opakování">
            <Input type="number" min={0} max={10} value={form.maxRetries} onChange={(e) => set({ maxRetries: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <SaveBar dirty={dirty} reason={reason} setReason={setReason} onSave={() => run(() => updateSettings(ctx, form, reason), 'Pravidla upozornění uložena.')} />
      </Card>
    </PaRef>
  );
}

function PlanningTab() {
  const { ctx, run, today, store } = useApp();
  const { form, setForm, reason, setReason, dirty } = useSettingsForm();
  const set = (p: Partial<AppSettings>) => setForm({ ...form, ...p });
  const y = parseISODate(today).y;
  const custom = store.holidays.all().filter((h) => !czechPublicHolidays(parseISODate(h.HolidayDate).y).some((c) => c.date === h.HolidayDate));
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader title="Výchozí pravidla termínů a horizont" subtitle="Předvyplňují se v průvodci nové kontroly; plánovací horizont používá FLOW-01." />
        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Plánovací horizont (měsíce)">
            <Input type="number" min={1} max={24} value={form.planningHorizonMonths} onChange={(e) => set({ planningHorizonMonths: Number(e.target.value) || 12 })} />
          </Field>
          <Field label="Výchozí lhůta splnění">
            <div className="flex gap-2">
              <Input type="number" className="w-20" min={0} value={form.defaultDueRule.offset} onChange={(e) => set({ defaultDueRule: { ...form.defaultDueRule, offset: Number(e.target.value) || 0 } })} aria-label="Lhůta" />
              <Select value={form.defaultDueRule.unit} onChange={(e) => set({ defaultDueRule: { ...form.defaultDueRule, unit: e.target.value as DueUnit } })} aria-label="Jednotka">
                {Object.entries(DUE_UNIT_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Víkend / svátek">
            <Select value={form.defaultNonWorkingDayShift} onChange={(e) => set({ defaultNonWorkingDayShift: e.target.value as ShiftRule })}>
              {Object.entries(SHIFT_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Neexistující den v měsíci">
            <Select value={form.defaultInvalidDayPolicy} onChange={(e) => set({ defaultInvalidDayPolicy: e.target.value as InvalidDayPolicy })}>
              {Object.entries(INVALID_DAY_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <SaveBar dirty={dirty} reason={reason} setReason={setReason} onSave={() => run(() => updateSettings(ctx, form, reason), 'Nastavení opakování uloženo.')} />
        <div className="mt-6 rounded-lg border border-line bg-slate-50/60 p-4">
          <p className="mb-1 text-[13px] font-medium text-slate-800">FLOW-01 GenerateRecurringControls</p>
          <p className="mb-3 text-[13px] text-slate-600">Idempotentně doplní výskyty všech aktivních kontrol do {form.planningHorizonMonths} měsíců. Existující výskyty přeskočí (OccurrenceKey). Simulace plánovače běží automaticky jednou denně při otevření aplikace.</p>
          <PaRef id="ctl.generate" inline>
            <Button icon={RefreshCw} onClick={() => run(() => generateOccurrences(ctx, { trigger: 'Ruční spuštění z administrace' }), (r) => `Zpracováno ${r.controls} kontrol: nově ${r.created}, přeskočeno ${r.skipped} existujících.`)}>
              Spustit generování výskytů
            </Button>
          </PaRef>
        </div>
      </Card>
      <Card>
        <CardHeader title={`Státní svátky ${y}`} subtitle="Dopočteno (vč. Velikonoc); IC_Holidays může doplnit vlastní dny." />
        <ul className="space-y-1.5 text-[13px]">
          {czechPublicHolidays(y).map((h) => (
            <li key={h.date} className="flex justify-between gap-3">
              <span className="text-slate-700">{h.name}</span>
              <span className="shrink-0 text-slate-500 tabular">{fmtDate(h.date)}</span>
            </li>
          ))}
          {custom.map((h) => (
            <li key={h.HolidayId} className="flex justify-between gap-3">
              <span className="text-slate-700">{h.Name}</span>
              <span className="text-slate-500">{fmtDate(h.HolidayDate)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function AuditTab() {
  const { store, version } = useApp();
  const { users } = useUsers();
  const [q, setQ] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [who, setWho] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const all = useMemo(() => store.audit.all(), [store, version]);
  const controls = useMemo(() => new Map(store.controls.all().map((c) => [c.ControlId, c.ControlCode])), [store, version]);
  const rows = all.filter(
    (a) =>
      (types.length === 0 || types.includes(a.EntityType)) &&
      (who.length === 0 || who.includes(a.ChangedBy)) &&
      (!from || a.ChangedAt.slice(0, 10) >= from) &&
      (!to || a.ChangedAt.slice(0, 10) <= to) &&
      (!q || `${a.Action} ${a.FieldName ?? ''} ${a.OldValue ?? ''} ${a.NewValue ?? ''} ${a.ChangeReason ?? ''} ${a.ControlId ? controls.get(a.ControlId) ?? '' : ''}`.toLowerCase().includes(q.toLowerCase())),
  );
  const entityTypes: AuditEntityType[] = ['Control', 'ControlVersion', 'ControlRun', 'Finding', 'Document', 'Protocol', 'Settings', 'RoleAssignment', 'Lookup', 'Report', 'System'];
  return (
    <PaRef id="adm.audit">
      <Card>
        <CardHeader
          title="Auditní log"
          subtitle="IC_AuditLog je append-only: záznamy nelze upravit ani smazat (v SharePointu oprávnění „Přidat“ bez „Upravit/Odstranit“)."
          actions={
            <Button
              icon={Download}
              onClick={() =>
                downloadCsv(
                  'auditni-log.csv',
                  ['ChangedAt', 'ChangedBy', 'EntityType', 'EntityId', 'ControlCode', 'Action', 'FieldName', 'OldValue', 'NewValue', 'ChangeReason'],
                  rows.map((a) => [a.ChangedAt, a.ChangedBy, a.EntityType, a.EntityId, a.ControlId ? controls.get(a.ControlId) ?? '' : '', a.Action, a.FieldName ?? '', a.OldValue ?? '', a.NewValue ?? '', a.ChangeReason ?? '']),
                )
              }
            >
              Export CSV
            </Button>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input className="max-w-xs" placeholder="Hledat akci, hodnotu, důvod, kód…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hledat v auditu" />
          <MultiSelect label="Entita" value={types} onChange={setTypes} options={entityTypes.map((t) => ({ value: t, label: t }))} />
          <MultiSelect label="Uživatel" value={who} onChange={setWho} options={[...users.map((u) => ({ value: u.Email, label: u.DisplayName })), { value: 'flow-01@system', label: 'FLOW-01 (systém)' }, { value: 'system', label: 'Systém' }]} />
          <Input type="date" className="w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Od" />
          <span className="text-slate-400">–</span>
          <Input type="date" className="w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Do" />
        </div>
        <AuditTable entries={rows} pageSize={50} />
      </Card>
    </PaRef>
  );
}

function TechTab() {
  const { store, version } = useApp();
  const logs = useMemo(() => [...store.automation.all()].sort((a, b) => b.StartedAt.localeCompare(a.StartedAt)), [store, version]);
  const flows = ['FLOW-01 GenerateRecurringControls', 'FLOW-02 SendDueDateReminders', 'FLOW-03 EscalateOverdueControls', 'FLOW-04 OnControlCompleted', 'FLOW-05 GenerateMonthlyManagementReport', 'FLOW-06 AssignmentChangeNotification', 'FLOW-07 MonitorAutomationFailures'];
  const counts: Array<[string, number]> = [
    ['IC_Controls', store.controls.all().length],
    ['IC_ControlVersions', store.versions.all().length],
    ['IC_ControlRuns', store.runs.all().length],
    ['IC_Findings', store.findings.all().length],
    ['IC_AuditLog', store.audit.all().length],
    ['IC_Notifications', store.notifications.all().length],
    ['IC_Protocols', store.protocols.all().length],
    ['IC_ReportSnapshots', store.reports.all().length],
    ['IC_ControlDocuments', store.documents.filter((d) => d.Library === 'IC_ControlDocuments').length],
    ['IC_ManagementReports', store.documents.filter((d) => d.Library === 'IC_ManagementReports').length],
  ];
  const event = store.notifications.all().filter((n) => ['Assignment', 'AssignmentChange'].includes(n.NotificationType));
  return (
    <PaRef id="adm.tech">
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {flows.map((f) => {
          const last = logs.find((l) => l.FlowName === f);
          const isEvent = f.startsWith('FLOW-06');
          return (
            <Card key={f} className="p-4">
              <p className="text-[12.5px] font-semibold text-slate-800">{f}</p>
              {isEvent ? (
                <p className="mt-1.5 text-[12.5px] text-slate-500">Událostní flow – {event.length} oznámení o přidělení / změně (poslední {fmtDateTime(event.sort((a, b) => b.CreatedAt.localeCompare(a.CreatedAt))[0]?.CreatedAt)}).</p>
              ) : last ? (
                <>
                  <p className="mt-1.5 flex items-center gap-2">
                    <Badge tone={last.Status === 'Succeeded' ? 'green' : last.Status === 'Failed' ? 'red' : 'amber'}>{last.Status === 'Succeeded' ? 'Úspěch' : last.Status === 'Failed' ? 'Chyba' : 'Částečně'}</Badge>
                    <span className="text-xs text-slate-500">{fmtDateTime(last.StartedAt)}</span>
                  </p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    zpracováno {last.ItemsProcessed} · vytvořeno {last.ItemsCreated} · přeskočeno {last.ItemsSkipped} · chyb {last.ErrorCount}
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-[12.5px] text-slate-400">Zatím nespuštěno.</p>
              )}
            </Card>
          );
        })}
        <Card className="p-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-800">
            <Database className="size-3.5" /> Objem dat
          </p>
          <ul className="space-y-0.5 text-[12px] text-slate-600">
            {counts.map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span className="font-mono">{k}</span>
                <span className="tabular">{v.toLocaleString('cs-CZ')}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card>
        <CardHeader title="Historie běhů automatizací" subtitle="IC_AutomationLog · simulované běhy (v produkci zapisuje každý flow na konci běhu, i v chybové větvi)" />
        <DataTable
          rows={logs}
          rowKey={(l) => l.LogId}
          dense
          pageSize={25}
          initialSort={{ key: 'at', dir: 'desc' }}
          columns={[
            { key: 'at', header: 'Spuštěno', sort: (l) => l.StartedAt, render: (l) => <span className="whitespace-nowrap tabular">{fmtDateTime(l.StartedAt)}</span> },
            { key: 'flow', header: 'Flow', sort: (l) => l.FlowName, render: (l) => <span className="font-medium text-slate-800">{l.FlowName}</span> },
            { key: 'st', header: 'Stav', render: (l) => <Badge tone={l.Status === 'Succeeded' ? 'green' : l.Status === 'Failed' ? 'red' : 'amber'}>{l.Status}</Badge> },
            { key: 'n', header: 'Zprac. / vytv. / přesk. / chyb', render: (l) => <span className="tabular">{l.ItemsProcessed} / {l.ItemsCreated} / {l.ItemsSkipped} / {l.ErrorCount}</span> },
            { key: 'msg', header: 'Zpráva', render: (l) => <span className="text-[12.5px] text-slate-600">{l.Message}</span> },
            { key: 'by', header: 'Spustil', render: (l) => <span className="text-[12.5px] text-slate-500">{l.TriggeredBy}</span> },
          ]}
        />
      </Card>
    </PaRef>
  );
}

function DemoTab() {
  const { store, ctx, run, settings, today } = useApp();
  const [date, setDate] = useState(settings.testDate ?? today);
  const [resetOpen, setResetOpen] = useState(false);
  const [withFiles, setWithFiles] = useState(true);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [pending, setPending] = useState<ExportFile | null>(null);
  const file = useRef<HTMLInputElement>(null);
  return (
    <PaRef id="adm.demo">
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Testovací datum" subtitle="Simulace změny dne / měsíce pro pravidla termínů, upozornění a reporty" icon={FlaskConical} />
          <Notice tone="amber" className="mb-4">
            Testovací datum slouží výhradně k simulaci pravidel v demu. V produkčním řešení je zdrojem času vždy server – <code>Now()</code> / <code>Today()</code> v Power Apps a <code>utcNow()</code> převedené na Europe/Prague v Power Automate.
          </Notice>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Datum">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Button variant="primary" onClick={() => run(() => setTestDate(ctx, date), `Testovací datum nastaveno na ${fmtDate(date)}.`)}>
              Nastavit
            </Button>
            <Button icon={RotateCcw} disabled={!settings.testDate} onClick={() => run(() => setTestDate(ctx, null), 'Používá se systémové datum.')}>
              Systémové datum
            </Button>
          </div>
          <p className="mt-3 text-[13px] text-slate-500">
            Aktuálně: <b>{fmtDate(today)}</b> {settings.testDate ? '(testovací)' : '(systémové, Europe/Prague)'}. Po posunu data spusťte v Centru upozornění simulaci denní kontroly termínů; FLOW-01 doplní horizont automaticky.
          </p>
        </Card>
        <Card>
          <CardHeader title="Režim Power Apps Reference" subtitle="Zobrazí u vybraných prvků referenční ID, cílovou obrazovku, control, seznam a flow" />
          <Switch checked={settings.paReferenceMode} onChange={(v) => void setPaReferenceMode(store, v)} label="Zapnout režim reference" />
          <p className="mt-3 text-[13px] text-slate-500">Prvky se označí fialovým rámečkem a štítkem „PA“. Kliknutím na štítek zobrazíte mapování. Přepínač je i v horní liště.</p>
        </Card>
        <Card>
          <CardHeader title="Export a import dat (JSON)" subtitle="Všechny seznamy, nastavení a volitelně i soubory (Base64)" icon={FileUp} />
          <div className="flex flex-wrap items-center gap-3">
            <Checkbox label="Včetně souborů (příloh a PDF)" checked={withFiles} onChange={setWithFiles} />
            <Button icon={Download} onClick={() => run(async () => downloadJson(`control-hub-export-${today}.json`, await exportData(ctx, withFiles)), 'Export připraven ke stažení.')}>
              Exportovat JSON
            </Button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const data = JSON.parse(await f.text());
                  const errs = validateImport(data);
                  setImportErrors(errs);
                  setPending(errs.length ? null : data);
                } catch {
                  setImportErrors(['Soubor není platný JSON.']);
                  setPending(null);
                }
              }}
            />
            <Button icon={FileUp} onClick={() => file.current?.click()}>
              Importovat JSON…
            </Button>
          </div>
          {importErrors && importErrors.length > 0 && (
            <Notice tone="red" className="mt-4" title="Import nelze provést – validace selhala">
              <ul className="list-disc pl-4">
                {importErrors.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Notice>
          )}
          {pending && (
            <Notice
              tone="amber"
              className="mt-4"
              title="Soubor prošel validací"
              actions={
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    const ok = await run(() => importData(ctx, pending), 'Data importována.');
                    if (ok !== undefined) {
                      setPending(null);
                      setImportErrors(null);
                    }
                  }}
                >
                  Nahradit data importem
                </Button>
              }
            >
              Export z {fmtDateTime(pending.exportedAt)} ({pending.lists.controls.length} kontrol, {pending.lists.runs.length} běhů). Import nahradí všechna současná data.
            </Notice>
          )}
        </Card>
        <Card>
          <CardHeader title="Obnovit demonstrační data" subtitle="Smaže všechna lokální data a znovu vygeneruje syntetický dataset vztažený k aktuálnímu (testovacímu) datu" icon={RotateCcw} />
          <Button variant="danger" icon={RotateCcw} onClick={() => setResetOpen(true)}>
            Obnovit původní demo data
          </Button>
        </Card>
      </div>
      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Obnovit demo data?"
        tone="danger"
        confirmLabel="Smazat a obnovit"
        onConfirm={async () => {
          const ok = await run(() => resetDemoData(store), (r) => `Obnoveno: ${r.controls} kontrol, ${r.runs} běhů.`);
          if (ok) setResetOpen(false);
        }}
      >
        Všechny změny, nahrané soubory, protokoly a auditní záznamy v tomto prohlížeči budou nenávratně odstraněny a nahrazeny čerstvými demo daty. Pro zachování dat nejdříve proveďte export.
      </ConfirmDialog>
    </PaRef>
  );
}
