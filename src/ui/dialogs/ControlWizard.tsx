/**
 * Průvodce založením kontroly (7 kroků) a úpravou definice („tento a všechny následující výskyty“).
 * Režim úprav končí krokem „Účinnost a dopad“ s náhledem dopadu na budoucí výskyty a povinným důvodem.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle, Info } from 'lucide-react';
import { addDays, maxDate } from '../../domain/dates';
import { newGuid } from '../../domain/ids';
import {
  DUE_UNIT_LABELS,
  INVALID_DAY_LABELS,
  MONTHLY_MODE_LABELS,
  PERIOD_MODE_LABELS,
  PRIORITY_LABELS,
  RECURRENCE_LABELS,
  RISK_LABELS,
  SHIFT_LABELS,
  WEEKDAY_SHORT,
} from '../../domain/labels';
import { describeDueRule, describeRecurrence, generateOccurrences, isMonthlyFamily, previewOccurrences, validateSchedule } from '../../domain/recurrence';
import { IMPACT_LABELS, horizonEnd, latestVersion, validateVersionDraft, type ImpactAction, type VersionDraft } from '../../domain/versioning';
import type { ControlVersion, DueUnit, InvalidDayPolicy, MonthlyMode, PeriodMode, Priority, RecurrenceType, RiskLevel, ShiftRule } from '../../domain/types';
import { applyDefinitionChange, createControl, previewDefinitionChange } from '../../services/controlService';
import { calendar } from '../../services/core';
import { useApp } from '../AppContext';
import { useLookups, useUsers } from '../hooks';
import { Dialog } from '../components/Dialog';
import { UserPicker } from '../components/Popover';
import { Badge, Button, Checkbox, Field, Input, Notice, Select, Switch, Textarea, cx } from '../components/ui';
import { PaRef } from '../components/PaRef';
import { fmtDate, fmtPeriod } from '../format';

type StepKey = 'basic' | 'method' | 'resp' | 'schedule' | 'evidence' | 'reminders' | 'summary' | 'impact';
const STEP_LABELS: Record<StepKey, string> = {
  basic: 'Základní informace',
  method: 'Metodika a kontrolní kroky',
  resp: 'Odpovědnosti',
  schedule: 'Harmonogram a opakování',
  evidence: 'Požadované dokumenty',
  reminders: 'Upozornění a eskalace',
  summary: 'Rekapitulace a uložení',
  impact: 'Účinnost a náhled dopadu',
};

interface FormState {
  draft: VersionDraft;
  category: string;
  department: string;
}

function draftFromVersion(v: ControlVersion): VersionDraft {
  const { VersionId: _a, ControlId: _b, ControlCode: _c, VersionNumber: _d, EffectiveFrom: _e, EffectiveTo: _f, CreatedAt: _g, CreatedBy: _h, ChangeReason: _i, ...rest } = v;
  return structuredClone(rest);
}

export function ControlWizard({
  open,
  onClose,
  controlId,
  effectiveFrom: initialEffective,
  initialStep,
  onSaved,
  contextNote,
}: {
  open: boolean;
  onClose: () => void;
  controlId?: string;
  effectiveFrom?: string;
  initialStep?: StepKey;
  onSaved?: (controlId: string) => void;
  contextNote?: string;
}) {
  const { store, ctx, today, settings, run } = useApp();
  const edit = !!controlId;
  const control = controlId ? store.controls.get(controlId) : undefined;
  const steps: StepKey[] = ['basic', 'method', 'resp', 'schedule', 'evidence', 'reminders', edit ? 'impact' : 'summary'];
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setConfirmed(false);
    setReason('');
    setEffectiveFrom(initialEffective ?? today);
    setStep(initialStep ? Math.max(0, steps.indexOf(initialStep)) : 0);
    if (edit && control) {
      const v = latestVersion(store.versions.filter((x) => x.ControlId === control.ControlId))!;
      // Nejdříve možné datum účinnosti = účinnost poslední verze.
      setEffectiveFrom(maxDate(initialEffective ?? today, v.EffectiveFrom));
      setForm({ draft: draftFromVersion(v), category: control.Category, department: control.Department });
    } else {
      setForm({
        category: '',
        department: '',
        draft: {
          ControlName: '',
          Description: '',
          ControlObjective: '',
          Instructions: '',
          RiskLevel: 'Medium',
          Priority: 'Normal',
          PrimaryOwnerEmail: '',
          BackupOwnerEmail: null,
          ReviewerEmail: null,
          RecurrenceType: 'Monthly',
          RecurrenceInterval: 1,
          RecurrenceSettings: {
            startDate: addDays(today, 7),
            endDate: null,
            daysOfWeek: [1],
            monthlyMode: 'DayOfMonth',
            dayOfMonth: 10,
            workdayNumber: 5,
            invalidDayPolicy: settings.defaultInvalidDayPolicy,
            nonWorkingDayShift: settings.defaultNonWorkingDayShift,
            periodMode: 'Previous',
          },
          DueDateRule: { ...settings.defaultDueRule },
          RequiredEvidence: [],
          ChecklistDefinition: [{ id: newGuid().slice(0, 8), label: '', required: true, guidance: '' }],
          ApprovalRequired: false,
          ReminderPolicy: { useGlobal: true, daysBefore: settings.reminderDaysBefore, overdueDays: settings.overdueDaysAfter, escalationAfterDays: settings.escalationAfterDays },
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, controlId]);

  const errorsByStep = useMemo(() => {
    if (!form) return {} as Record<StepKey, string[]>;
    const d = form.draft;
    const all = validateVersionDraft(d);
    const sched = validateSchedule({ ...d, ControlCode: 'X' });
    const pick = (re: RegExp) => all.filter((e) => re.test(e));
    const basic = [...(!d.ControlName.trim() ? ['Název kontroly je povinný.'] : []), ...(!form.category ? ['Vyberte oblast kontroly.'] : []), ...(!form.department ? ['Vyberte odpovědný útvar.'] : []), ...(!d.ControlObjective.trim() ? ['Uveďte cíl kontroly.'] : [])];
    return {
      basic,
      method: [...(!d.Instructions.trim() ? ['Popište postup (metodiku) kontroly.'] : []), ...pick(/kontrolní krok|Definujte/)],
      resp: pick(/osobu|schvalovatel|čtyř očí|Zástupce/),
      schedule: sched,
      evidence: pick(/dokument/),
      reminders: d.ReminderPolicy.useGlobal ? [] : [...(d.ReminderPolicy.daysBefore.length === 0 ? ['Zadejte alespoň jednu připomínku před termínem.'] : []), ...(d.ReminderPolicy.escalationAfterDays < 1 ? ['Eskalace musí nastat nejdříve 1. den po termínu.'] : [])],
      summary: [],
      impact: [],
    } as Record<StepKey, string[]>;
  }, [form]);

  const plan = useMemo(() => {
    if (!edit || !form || !controlId || steps[step] !== 'impact') return null;
    try {
      return previewDefinitionChange(ctx, controlId, form.draft, effectiveFrom, reason || '—', form.category, form.department);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, form, controlId, effectiveFrom, reason, step, ctx]);

  if (!open || !form) return null;
  const d = form.draft;
  const setDraft = (patch: Partial<VersionDraft>) => setForm({ ...form, draft: { ...d, ...patch } });
  const key = steps[step];
  const stepErrors = errorsByStep[key] ?? [];
  const allErrors = steps.flatMap((s) => errorsByStep[s] ?? []);

  const next = () => {
    setTouched(true);
    if (stepErrors.length) return;
    setTouched(false);
    setStep((s) => Math.min(steps.length - 1, s + 1));
  };

  const save = async () => {
    setBusy(true);
    try {
      if (edit && controlId && control) {
        const finalPlan = previewDefinitionChange(ctx, controlId, form.draft, effectiveFrom, reason, form.category, form.department);
        const ok = await run(() => applyDefinitionChange(ctx, finalPlan, store.controls.get(controlId)!.RowVersion), `Uložena verze v${finalPlan.newVersion.VersionNumber} – aktualizováno ${finalPlan.counts.update}, nově ${finalPlan.counts.create}, nahrazeno ${finalPlan.counts.cancel} výskytů.`);
        if (ok !== undefined) {
          onSaved?.(controlId);
          onClose();
        }
      } else {
        const res = await run(() => createControl(ctx, { draft: form.draft, category: form.category, department: form.department }), (r) => `Kontrola ${r.control.ControlCode} založena, vygenerováno ${r.runsCreated} výskytů.`);
        if (res) {
          onSaved?.(res.control.ControlId);
          onClose();
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={edit ? `Úprava definice ${control?.ControlCode} – nová verze` : 'Nová kontrola'}
      description={edit ? 'Změna se projeví u tohoto a všech následujících výskytů od data účinnosti. Uzavřené běhy a jejich protokoly zůstanou beze změny.' : 'Průvodce založením definice kontroly, metodiky, odpovědností a plánu opakování.'}
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">
            Krok {step + 1} z {steps.length}
          </span>
          <Button icon={ChevronLeft} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Zpět
          </Button>
          {step < steps.length - 1 ? (
            <Button variant="primary" onClick={next}>
              Pokračovat <ChevronRight className="size-4" />
            </Button>
          ) : (
            <PaRef id={edit ? 'wiz.applyChange' : 'wiz.save'} inline>
              <Button
                variant="primary"
                icon={Check}
                loading={busy}
                disabled={allErrors.length > 0 || (edit && (!confirmed || reason.trim().length < 5 || !plan || plan.errors.length > 0))}
                onClick={save}
              >
                {edit ? 'Uložit novou verzi' : 'Uložit kontrolu'}
              </Button>
            </PaRef>
          )}
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <PaRef id="wiz.steps">
          <ol className="space-y-1">
            {steps.map((s, i) => {
              const errs = (errorsByStep[s] ?? []).length;
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => (i <= step || allErrors.length === 0 ? setStep(i) : undefined)}
                    className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px]', i === step ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-600 hover:bg-slate-50')}
                  >
                    <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', i < step ? (errs ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700') : i === step ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>
                      {i < step && !errs ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    {STEP_LABELS[s]}
                  </button>
                </li>
              );
            })}
          </ol>
        </PaRef>
        <div className="min-w-0">
          {contextNote && (
            <Notice className="mb-4" tone="teal">
              {contextNote}
            </Notice>
          )}
          <h3 className="mb-4 text-base font-semibold text-slate-900">{STEP_LABELS[key]}</h3>
          {touched && stepErrors.length > 0 && (
            <Notice tone="red" icon={AlertTriangle} className="mb-4" title="Doplňte prosím:">
              <ul className="list-disc pl-4">
                {stepErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Notice>
          )}
          {key === 'basic' && <BasicStep form={form} setForm={setForm} />}
          {key === 'method' && <MethodStep draft={d} setDraft={setDraft} />}
          {key === 'resp' && <RespStep draft={d} setDraft={setDraft} />}
          {key === 'schedule' && <ScheduleStep draft={d} setDraft={setDraft} edit={edit} />}
          {key === 'evidence' && <EvidenceStep draft={d} setDraft={setDraft} />}
          {key === 'reminders' && <ReminderStep draft={d} setDraft={setDraft} />}
          {key === 'summary' && <SummaryStep form={form} />}
          {key === 'impact' && plan && (
            <ImpactStep plan={plan} effectiveFrom={effectiveFrom} setEffectiveFrom={setEffectiveFrom} reason={reason} setReason={setReason} confirmed={confirmed} setConfirmed={setConfirmed} />
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------

function BasicStep({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const { departments, categories } = useLookups();
  const d = form.draft;
  const set = (patch: Partial<VersionDraft>) => setForm({ ...form, draft: { ...d, ...patch } });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Název kontroly" required className="sm:col-span-2" hint="Krátký, výstižný název. Kód CTRL-xxxx přidělí systém.">
        <Input value={d.ControlName} onChange={(e) => set({ ControlName: e.target.value })} maxLength={140} data-autofocus />
      </Field>
      <Field label="Oblast (kategorie)" required>
        <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          <option value="">— vyberte —</option>
          {categories.map((c) => (
            <option key={c.Code} value={c.Code}>
              {c.Label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Odpovědný útvar" required>
        <Select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
          <option value="">— vyberte —</option>
          {departments.map((c) => (
            <option key={c.Code} value={c.Code}>
              {c.Label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Rizikovost" required hint="Ovlivňuje řazení nejrizikovějších kontrol a eskalace.">
        <Select value={d.RiskLevel} onChange={(e) => set({ RiskLevel: e.target.value as RiskLevel })}>
          {Object.entries(RISK_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Priorita">
        <Select value={d.Priority} onChange={(e) => set({ Priority: e.target.value as Priority })}>
          {Object.entries(PRIORITY_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Cíl kontroly" required className="sm:col-span-2" hint="Jaké riziko kontrola snižuje a co potvrzuje.">
        <Textarea rows={2} value={d.ControlObjective} onChange={(e) => set({ ControlObjective: e.target.value })} />
      </Field>
      <Field label="Popis" className="sm:col-span-2">
        <Textarea rows={3} value={d.Description} onChange={(e) => set({ Description: e.target.value })} />
      </Field>
    </div>
  );
}

function MethodStep({ draft: d, setDraft }: { draft: VersionDraft; setDraft: (p: Partial<VersionDraft>) => void }) {
  const items = d.ChecklistDefinition;
  const update = (i: number, patch: Partial<(typeof items)[number]>) => setDraft({ ChecklistDefinition: items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const move = (i: number, dir: -1 | 1) => {
    const arr = [...items];
    const [x] = arr.splice(i, 1);
    arr.splice(i + dir, 0, x);
    setDraft({ ChecklistDefinition: arr });
  };
  return (
    <div className="space-y-5">
      <Field label="Postup (metodika)" required hint="Pracovní postup, zdroje dat a kritéria vyhodnocení. Zobrazí se provádějícímu před zahájením.">
        <Textarea rows={5} value={d.Instructions} onChange={(e) => setDraft({ Instructions: e.target.value })} />
      </Field>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-medium text-slate-700">
            Kontrolní kroky (checklist) <span className="text-rose-600">*</span>
          </p>
          <Button size="sm" icon={Plus} onClick={() => setDraft({ ChecklistDefinition: [...items, { id: newGuid().slice(0, 8), label: '', required: true, guidance: '' }] })}>
            Přidat krok
          </Button>
        </div>
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={it.id} className="rounded-lg border border-line bg-slate-50/60 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-6 shrink-0 text-center text-xs font-semibold text-slate-400">{i + 1}.</span>
                <div className="grid flex-1 gap-2">
                  <Input value={it.label} placeholder="Popis kontrolního kroku" onChange={(e) => update(i, { label: e.target.value })} aria-label={`Krok ${i + 1}`} />
                  <Input value={it.guidance ?? ''} placeholder="Nápověda pro provádějícího (nepovinné)" onChange={(e) => update(i, { guidance: e.target.value })} className="h-8 text-[13px]" aria-label={`Nápověda ke kroku ${i + 1}`} />
                  <Checkbox label="Povinný krok" checked={it.required} onChange={(v) => update(i, { required: v })} />
                </div>
                <div className="flex flex-col">
                  <button type="button" aria-label="Posunout nahoru" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-30">
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button type="button" aria-label="Posunout dolů" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-30">
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button type="button" aria-label="Odebrat krok" disabled={items.length === 1} onClick={() => setDraft({ ChecklistDefinition: items.filter((_, j) => j !== i) })} className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-30">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RespStep({ draft: d, setDraft }: { draft: VersionDraft; setDraft: (p: Partial<VersionDraft>) => void }) {
  const { users } = useUsers();
  const conflict = d.ApprovalRequired && d.ReviewerEmail && d.ReviewerEmail === d.PrimaryOwnerEmail;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Odpovědná osoba (vlastník kontroly)" required hint="Provádí kontrolu a dostává připomínky.">
        <UserPicker users={users} value={d.PrimaryOwnerEmail || null} onChange={(v) => setDraft({ PrimaryOwnerEmail: v ?? '' })} />
      </Field>
      <Field label="Zástupce" hint="Může kontrolu provést v zastoupení.">
        <UserPicker users={users} value={d.BackupOwnerEmail} allowEmpty exclude={[d.PrimaryOwnerEmail]} onChange={(v) => setDraft({ BackupOwnerEmail: v })} />
      </Field>
      <div className="sm:col-span-2">
        <Switch checked={d.ApprovalRequired} onChange={(v) => setDraft({ ApprovalRequired: v })} label={<span>Vyžaduje schválení (princip čtyř očí)</span>} />
        <p className="mt-1 ml-11 text-xs text-slate-500">Po provedení se běh odešle schvalovateli. Provádějící nesmí sám provést finální schválení.</p>
      </div>
      <Field label="Schvalovatel" required={d.ApprovalRequired} error={conflict ? 'Schvalovatel musí být jiná osoba než odpovědná osoba.' : undefined}>
        <UserPicker users={users} value={d.ReviewerEmail} allowEmpty onChange={(v) => setDraft({ ReviewerEmail: v })} invalid={!!conflict} />
      </Field>
    </div>
  );
}

function ScheduleStep({ draft: d, setDraft, edit }: { draft: VersionDraft; setDraft: (p: Partial<VersionDraft>) => void; edit: boolean }) {
  const { today, store, settings } = useApp();
  const s = d.RecurrenceSettings;
  const setS = (patch: Partial<typeof s>) => setDraft({ RecurrenceSettings: { ...s, ...patch } });
  const def = { ...d, ControlCode: 'CTRL-NEW' };
  const errs = validateSchedule(def);
  const cal = calendar(store);
  const preview = errs.length ? [] : previewOccurrences(def, edit ? maxDate(today, s.startDate) : s.startDate, 8, cal);
  const horizon = horizonEnd(today, settings.planningHorizonMonths);
  const count = errs.length ? 0 : generateOccurrences(def, s.startDate, horizon, cal).length;
  const monthly = isMonthlyFamily(d.RecurrenceType);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Frekvence" required>
          <Select value={d.RecurrenceType} onChange={(e) => setDraft({ RecurrenceType: e.target.value as RecurrenceType, RecurrenceInterval: 1 })}>
            {Object.entries(RECURRENCE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        {(d.RecurrenceType === 'Daily' || d.RecurrenceType === 'Weekly' || d.RecurrenceType === 'Monthly') && (
          <Field label={d.RecurrenceType === 'Weekly' ? 'Každých N týdnů' : d.RecurrenceType === 'Monthly' ? 'Každých N měsíců' : 'Každý N-tý den'}>
            <Input type="number" min={1} max={52} value={d.RecurrenceInterval} onChange={(e) => setDraft({ RecurrenceInterval: Math.max(1, Number(e.target.value) || 1) })} />
          </Field>
        )}
        <Field label="První plánovaný výskyt" required hint="Zároveň kotva kadence (týden / měsíc).">
          <Input type="date" value={s.startDate} onChange={(e) => setS({ startDate: e.target.value })} />
        </Field>
        <Field label="Ukončení opakování" hint="Nepovinné – bez data se plánuje průběžně.">
          <Input type="date" value={s.endDate ?? ''} onChange={(e) => setS({ endDate: e.target.value || null })} />
        </Field>
      </div>
      {d.RecurrenceType === 'Weekly' && (
        <Field label="Dny v týdnu" required>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_SHORT.map((w, i) => {
              const on = s.daysOfWeek.includes(i + 1);
              return (
                <button key={w} type="button" aria-pressed={on} onClick={() => setS({ daysOfWeek: on ? s.daysOfWeek.filter((x) => x !== i + 1) : [...s.daysOfWeek, i + 1].sort() })} className={cx('h-8 w-11 rounded-md text-[13px] font-medium ring-1 ring-inset', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>
                  {w}
                </button>
              );
            })}
          </div>
        </Field>
      )}
      {monthly && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Den v měsíci">
            <Select value={s.monthlyMode} onChange={(e) => setS({ monthlyMode: e.target.value as MonthlyMode })}>
              {Object.entries(MONTHLY_MODE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          {s.monthlyMode === 'DayOfMonth' && (
            <Field label="Den (1–31)">
              <Input type="number" min={1} max={31} value={s.dayOfMonth} onChange={(e) => setS({ dayOfMonth: Number(e.target.value) || 1 })} />
            </Field>
          )}
          {s.monthlyMode === 'NthWorkday' && (
            <Field label="Pořadí pracovního dne">
              <Input type="number" min={1} max={23} value={s.workdayNumber} onChange={(e) => setS({ workdayNumber: Number(e.target.value) || 1 })} />
            </Field>
          )}
          {s.monthlyMode === 'DayOfMonth' && s.dayOfMonth > 28 && (
            <Field label="Neexistující den (např. 31. 2.)">
              <Select value={s.invalidDayPolicy} onChange={(e) => setS({ invalidDayPolicy: e.target.value as InvalidDayPolicy })}>
                {Object.entries(INVALID_DAY_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Víkend / státní svátek" hint="Posun plánovaného data mimo nepracovní den.">
          <Select value={s.nonWorkingDayShift} onChange={(e) => setS({ nonWorkingDayShift: e.target.value as ShiftRule })}>
            {Object.entries(SHIFT_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kontrolované období">
          <Select value={s.periodMode} onChange={(e) => setS({ periodMode: e.target.value as PeriodMode })}>
            {Object.entries(PERIOD_MODE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lhůta pro splnění" hint={describeDueRule(d.DueDateRule)}>
          <div className="flex gap-2">
            <Input type="number" min={0} max={120} className="w-20" value={d.DueDateRule.offset} onChange={(e) => setDraft({ DueDateRule: { ...d.DueDateRule, offset: Math.max(0, Number(e.target.value) || 0) } })} aria-label="Počet dní" />
            <Select value={d.DueDateRule.unit} onChange={(e) => setDraft({ DueDateRule: { ...d.DueDateRule, unit: e.target.value as DueUnit } })} aria-label="Jednotka">
              {Object.entries(DUE_UNIT_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        </Field>
      </div>
      <PaRef id="wiz.preview">
        <div className="rounded-lg border border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-slate-50/70 px-4 py-2.5">
            <p className="text-[13px] font-medium text-slate-700">Náhled naplánovaných výskytů · {describeRecurrence(def)}</p>
            {!edit && (
              <Badge tone="blue">
                {count} výskytů do {fmtDate(horizon)}
              </Badge>
            )}
          </div>
          {preview.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-slate-500">{errs[0] ?? 'Pravidlo nevytváří žádný výskyt.'}</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Běh</th>
                  <th className="px-4 py-2 font-medium">Plánováno</th>
                  <th className="px-4 py-2 font-medium">Termín splnění</th>
                  <th className="px-4 py-2 font-medium">Kontrolované období</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((o) => (
                  <tr key={o.occurrenceKey} className="border-t border-line/70">
                    <td className="px-4 py-1.5 font-mono text-xs">{o.runCode}</td>
                    <td className="px-4 py-1.5 tabular">
                      {fmtDate(o.scheduledDate)}
                      {o.scheduledDate !== o.nominalDate && <span className="ml-1.5 text-xs text-amber-700">(posun z {fmtDate(o.nominalDate)}{cal.holidayName(o.nominalDate) ? ` – ${cal.holidayName(o.nominalDate)}` : ''})</span>}
                    </td>
                    <td className="px-4 py-1.5 tabular">{fmtDate(o.dueDate)}</td>
                    <td className="px-4 py-1.5 text-slate-600">{fmtPeriod(o.periodFrom, o.periodTo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PaRef>
    </div>
  );
}

function EvidenceStep({ draft: d, setDraft }: { draft: VersionDraft; setDraft: (p: Partial<VersionDraft>) => void }) {
  const ev = d.RequiredEvidence;
  const update = (i: number, patch: Partial<(typeof ev)[number]>) => setDraft({ RequiredEvidence: ev.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <div className="space-y-3">
      <Notice>Povinné dokumenty musí být nahrány před odesláním / dokončením běhu. Soubory se ukládají do složky IC_ControlDocuments/CTRL-xxxx/RUN-xxxx/Evidence.</Notice>
      {ev.map((e, i) => (
        <div key={e.id} className="flex items-start gap-3 rounded-lg border border-line p-3">
          <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_1fr]">
            <Input placeholder="Název dokumentu (např. Výpis z účetního systému)" value={e.name} onChange={(x) => update(i, { name: x.target.value })} aria-label="Název dokumentu" />
            <Input placeholder="Popis / požadavky (nepovinné)" value={e.description ?? ''} onChange={(x) => update(i, { description: x.target.value })} aria-label="Popis dokumentu" />
            <Checkbox label="Povinná příloha" checked={e.mandatory} onChange={(v) => update(i, { mandatory: v })} />
          </div>
          <button type="button" aria-label="Odebrat dokument" onClick={() => setDraft({ RequiredEvidence: ev.filter((_, j) => j !== i) })} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <Button icon={Plus} onClick={() => setDraft({ RequiredEvidence: [...ev, { id: `ev${newGuid().slice(0, 6)}`, name: '', mandatory: true, description: '' }] })}>
        Přidat požadovaný dokument
      </Button>
    </div>
  );
}

export function NumberListInput({ value, onChange, ariaLabel }: { value: number[]; onChange: (v: number[]) => void; ariaLabel: string }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value.join(',')]);
  return (
    <Input
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const nums = [...new Set(text.split(/[,;\s]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 60))].sort((a, b) => b - a);
        onChange(nums);
        setText(nums.join(', '));
      }}
    />
  );
}

function ReminderStep({ draft: d, setDraft }: { draft: VersionDraft; setDraft: (p: Partial<VersionDraft>) => void }) {
  const { settings } = useApp();
  const p = d.ReminderPolicy;
  const setP = (patch: Partial<typeof p>) => setDraft({ ReminderPolicy: { ...p, ...patch } });
  return (
    <div className="space-y-4">
      <Switch checked={p.useGlobal} onChange={(v) => setP({ useGlobal: v })} label="Použít globální pravidla upozornění" />
      <div className="rounded-lg border border-line bg-slate-50/60 p-4 text-[13px] text-slate-600">
        <p className="mb-1 font-medium text-slate-700">Globální pravidla (Administrace → Pravidla upozornění)</p>
        Připomínky {settings.reminderDaysBefore.join(', ')} dní před termínem · po termínu {settings.overdueDaysAfter.join(', ')}. den · eskalace vedoucímu a koordinátorovi po {settings.escalationAfterDays} dnech · režim {settings.digestMode === 'DailyDigest' ? 'denní souhrn' : 'jednotlivá upozornění'}.
      </div>
      {!p.useGlobal && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Připomínky před termínem (dny)" hint="Např. 7, 3, 1, 0 (0 = v den termínu)">
            <NumberListInput ariaLabel="Připomínky před termínem" value={p.daysBefore} onChange={(v) => setP({ daysBefore: v })} />
          </Field>
          <Field label="Upozornění po termínu (dny)" hint="Např. 1, 3, 7">
            <NumberListInput ariaLabel="Upozornění po termínu" value={p.overdueDays} onChange={(v) => setP({ overdueDays: v.filter((x) => x > 0) })} />
          </Field>
          <Field label="Eskalace po (dnech po termínu)">
            <Input type="number" min={1} max={60} value={p.escalationAfterDays} onChange={(e) => setP({ escalationAfterDays: Number(e.target.value) || 1 })} />
          </Field>
        </div>
      )}
      <Notice tone="neutral" icon={Info}>
        V cílovém řešení odesílá upozornění Power Automate (FLOW-02, FLOW-03) přes Office 365 Outlook. Duplicitám brání deduplikační klíč v IC_Notifications.
      </Notice>
    </div>
  );
}

function SummaryStep({ form }: { form: FormState }) {
  const { today, settings, store } = useApp();
  const { name } = useUsers();
  const { deptLabel, catLabel } = useLookups();
  const d = form.draft;
  const count = generateOccurrences({ ...d, ControlCode: 'X' }, d.RecurrenceSettings.startDate, horizonEnd(today, settings.planningHorizonMonths), calendar(store)).length;
  const rows: Array<[string, string]> = [
    ['Název', d.ControlName],
    ['Oblast / útvar', `${catLabel(form.category)} · ${deptLabel(form.department)}`],
    ['Rizikovost / priorita', `${RISK_LABELS[d.RiskLevel]} · ${PRIORITY_LABELS[d.Priority]}`],
    ['Odpovědná osoba', name(d.PrimaryOwnerEmail)],
    ['Zástupce', d.BackupOwnerEmail ? name(d.BackupOwnerEmail) : '—'],
    ['Schvalování', d.ApprovalRequired ? `Ano – ${name(d.ReviewerEmail)}` : 'Ne'],
    ['Opakování', describeRecurrence(d)],
    ['První výskyt', fmtDate(d.RecurrenceSettings.startDate)],
    ['Termín splnění', describeDueRule(d.DueDateRule)],
    ['Kontrolní kroky', `${d.ChecklistDefinition.length} (povinných ${d.ChecklistDefinition.filter((c) => c.required).length})`],
    ['Požadované dokumenty', d.RequiredEvidence.length ? d.RequiredEvidence.map((e) => `${e.name}${e.mandatory ? ' *' : ''}`).join(', ') : '—'],
    ['Upozornění', d.ReminderPolicy.useGlobal ? 'Globální pravidla' : `Před termínem ${d.ReminderPolicy.daysBefore.join(', ')} · po termínu ${d.ReminderPolicy.overdueDays.join(', ')} · eskalace ${d.ReminderPolicy.escalationAfterDays} dní`],
  ];
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-line rounded-lg border border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[200px_1fr] gap-3 px-4 py-2 text-[13px]">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
      <Notice tone="teal" title={`Po uložení vznikne ${count} samostatných výskytů (běhů) na plánovací horizont ${settings.planningHorizonMonths} měsíců.`}>
        Každý výskyt má stabilní identifikátor (OccurrenceKey). Opakované generování nevytvoří duplicity. Odpovědná osoba a zástupce dostanou upozornění o přidělení.
      </Notice>
    </div>
  );
}

function ImpactStep({
  plan,
  effectiveFrom,
  setEffectiveFrom,
  reason,
  setReason,
  confirmed,
  setConfirmed,
}: {
  plan: ReturnType<typeof previewDefinitionChange>;
  effectiveFrom: string;
  setEffectiveFrom: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
}) {
  const { name } = useUsers();
  const [showAll, setShowAll] = useState(false);
  const relevant = plan.rows.filter((r) => r.action !== 'unchanged' || showAll);
  const tiles: Array<[ImpactAction, string]> = [
    ['update', 'blue'],
    ['create', 'teal'],
    ['cancel', 'amber'],
    ['keepConflict', 'red'],
    ['keepOverride', 'violet'],
    ['skipCovered', 'neutral'],
    ['unchanged', 'neutral'],
  ];
  return (
    <PaRef id="wiz.impact">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Field label="Účinnost od" required hint={plan.previousVersion ? `Verze v${plan.previousVersion.VersionNumber} bude platná do ${fmtDate(plan.previousVersionEffectiveTo)}.` : undefined}>
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
          <Field label="Důvod změny" required hint="Povinné – uloží se do verze i auditní historie.">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Např. aktualizace metodiky dle směrnice, změna odpovědnosti po reorganizaci…" />
          </Field>
        </div>
        {plan.errors.filter((e) => !/důvod/i.test(e)).length > 0 && (
          <Notice tone="red" icon={AlertTriangle} title="Změnu nelze uložit">
            <ul className="list-disc pl-4">
              {plan.errors
                .filter((e) => !/důvod/i.test(e))
                .map((e) => (
                  <li key={e}>{e}</li>
                ))}
            </ul>
          </Notice>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {tiles.map(([a]) => (
            <div key={a} className="rounded-lg border border-line px-3 py-2">
              <p className="text-xl font-semibold text-slate-900 tabular">{plan.counts[a]}</p>
              <p className="text-[11.5px] leading-tight text-slate-500">{IMPACT_LABELS[a]}</p>
            </div>
          ))}
        </div>
        {plan.warnings.map((w) => (
          <Notice key={w} tone="amber" icon={AlertTriangle}>
            {w}
          </Notice>
        ))}
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line bg-slate-50/70 px-4 py-2">
            <p className="text-[13px] font-medium text-slate-700">Dotčené výskyty od {fmtDate(effectiveFrom)}</p>
            <Checkbox label="Zobrazit i uzavřené" checked={showAll} onChange={setShowAll} />
          </div>
          <div className="max-h-72 overflow-y-auto scroll-thin">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-white text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Akce</th>
                  <th className="px-3 py-2 font-medium">Běh</th>
                  <th className="px-3 py-2 font-medium">Původní termín</th>
                  <th className="px-3 py-2 font-medium">Nový termín</th>
                  <th className="px-3 py-2 font-medium">Odpovědná osoba</th>
                  <th className="px-3 py-2 font-medium">Poznámka</th>
                </tr>
              </thead>
              <tbody>
                {relevant.slice(0, 120).map((r, i) => (
                  <tr key={`${r.occurrenceKey}-${i}`} className="border-t border-line/70 align-top">
                    <td className="px-3 py-1.5">
                      <Badge tone={r.action === 'cancel' ? 'amber' : r.action === 'create' ? 'teal' : r.action === 'keepConflict' ? 'red' : r.action === 'keepOverride' ? 'violet' : r.action === 'update' ? 'blue' : 'neutral'}>{IMPACT_LABELS[r.action]}</Badge>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.runCode}</td>
                    <td className="px-3 py-1.5 tabular">{r.oldDue ? fmtDate(r.oldDue) : '—'}</td>
                    <td className={cx('px-3 py-1.5 tabular', r.newDue && r.oldDue && r.newDue !== r.oldDue && 'font-medium text-brand-700')}>{r.newDue ? fmtDate(r.newDue) : '—'}</td>
                    <td className="px-3 py-1.5">
                      {r.oldOwner && r.newOwner && r.oldOwner !== r.newOwner ? (
                        <span>
                          {name(r.oldOwner)} → <b>{name(r.newOwner)}</b>
                        </span>
                      ) : (
                        name(r.newOwner ?? r.oldOwner)
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {relevant.length > 120 && <p className="px-3 py-2 text-xs text-slate-500">… a dalších {relevant.length - 120} výskytů.</p>}
          </div>
        </div>
        <Checkbox
          checked={confirmed}
          onChange={setConfirmed}
          label="Rozumím dopadu změny a potvrzuji ji"
          description="Dokončené a schvalované kontroly se nezmění. Rozpracované výskyty zůstávají na původní verzi."
        />
      </div>
    </PaRef>
  );
}
