/** Dialogy k běhu: výběr rozsahu změny, jednorázová úprava a zjištění. */
import { useEffect, useState } from 'react';
import { CalendarRange, Repeat, AlertTriangle } from 'lucide-react';
import { FINDING_STATUS_LABELS, SEVERITY_LABELS } from '../../domain/labels';
import { canReschedule } from '../../domain/permissions';
import type { ControlRun, Finding, FindingSeverity, FindingStatus } from '../../domain/types';
import { overrideRun, validateOneTimeChanges } from '../../services/runService';
import { createFinding, updateFinding, validateFinding } from '../../services/documentService';
import { useApp } from '../AppContext';
import { useUsers } from '../hooks';
import { Dialog } from '../components/Dialog';
import { UserPicker } from '../components/Popover';
import { Button, Field, Input, Notice, Select, Textarea, cx } from '../components/ui';
import { ControlWizard } from './ControlWizard';
import { fmtDate } from '../format';

/**
 * „Změnit termín / odpovědnost“ – u opakované kontroly nejdříve volba rozsahu:
 *  A) Upravit pouze tento výskyt → jednorázová úprava (IsOneTimeOverride)
 *  B) Upravit tento a všechny následující → nová verze definice s účinností od data výskytu
 */
export function RunEditDialog({ run, open, onClose, focus = 'date' }: { run: ControlRun; open: boolean; onClose: () => void; focus?: 'date' | 'owner' }) {
  const { session, store } = useApp();
  const [scope, setScope] = useState<'choose' | 'one' | 'series'>('choose');
  useEffect(() => {
    if (open) setScope(run.RecurrenceType === 'OneTime' ? 'one' : 'choose');
  }, [open, run.RunId, run.RecurrenceType]);
  const decision = canReschedule(session, run);
  const control = store.controls.get(run.ControlId);
  if (!open) return null;
  if (scope === 'series')
    return (
      <ControlWizard
        open
        onClose={onClose}
        controlId={run.ControlId}
        effectiveFrom={run.NominalDate}
        initialStep={focus === 'owner' ? 'resp' : 'schedule'}
        contextNote={`Změna pravidla od výskytu ${run.RunCode} (${fmtDate(run.NominalDate)}) – vytvoří se nová verze definice. Termín jednoho výskytu změníte volbou „Pouze tento výskyt“.`}
      />
    );
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={`Změna výskytu ${run.ControlCode} · ${run.RunCode}`} description="Vyberte, zda se změna týká jen tohoto výskytu, nebo i všech následujících.">
      {!decision.allowed ? (
        <Notice tone="amber" icon={AlertTriangle}>
          {decision.reason}
        </Notice>
      ) : scope === 'choose' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ScopeCard icon={CalendarRange} title="Upravit pouze tento výskyt" text="Jiný termín, jiná odpovědná osoba nebo poznámka jen pro tento běh. Obecná pravidla kontroly zůstanou beze změny." onClick={() => setScope('one')} />
          <ScopeCard
            icon={Repeat}
            title="Upravit tento a všechny následující"
            text={`Vznikne nová verze definice s účinností od ${fmtDate(run.NominalDate)}. Historické a dokončené běhy zůstanou zachovány; před uložením uvidíte náhled dopadu.`}
            onClick={() => setScope('series')}
            disabled={!control?.IsActive}
          />
        </div>
      ) : (
        <OneTimeForm run={run} onDone={onClose} focus={focus} />
      )}
    </Dialog>
  );
}

function ScopeCard({ icon: Icon, title, text, onClick, disabled }: { icon: typeof Repeat; title: string; text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex flex-col items-start gap-2 rounded-xl border border-line p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/40 disabled:opacity-50">
      <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="size-4.5" />
      </span>
      <span className="text-[14px] font-semibold text-slate-900">{title}</span>
      <span className="text-[13px] leading-relaxed text-slate-500">{text}</span>
    </button>
  );
}

function OneTimeForm({ run, onDone, focus }: { run: ControlRun; onDone: () => void; focus: 'date' | 'owner' }) {
  const { ctx, run: exec } = useApp();
  const { users, name } = useUsers();
  const [scheduled, setScheduled] = useState(run.ScheduledDate);
  const [due, setDue] = useState(run.DueDate);
  const [owner, setOwner] = useState(run.AssignedOwnerEmail);
  const [backup, setBackup] = useState(run.BackupOwnerEmail);
  const [reviewer, setReviewer] = useState(run.ReviewerEmail);
  const [note, setNote] = useState(run.OverrideNote);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const changes = {
    ...(scheduled !== run.ScheduledDate ? { ScheduledDate: scheduled } : {}),
    ...(due !== run.DueDate ? { DueDate: due } : {}),
    ...(owner !== run.AssignedOwnerEmail ? { AssignedOwnerEmail: owner } : {}),
    ...(backup !== run.BackupOwnerEmail ? { BackupOwnerEmail: backup } : {}),
    ...(reviewer !== run.ReviewerEmail ? { ReviewerEmail: reviewer } : {}),
    ...(note !== run.OverrideNote ? { OverrideNote: note } : {}),
  };
  const errors = validateOneTimeChanges(run, changes, reason);
  const changed = Object.keys(changes).length > 0;
  const diffRows: Array<[string, string, string]> = [
    ...(changes.ScheduledDate ? [['Plánováno', fmtDate(run.ScheduledDate), fmtDate(scheduled)] as [string, string, string]] : []),
    ...(changes.DueDate ? [['Termín splnění', fmtDate(run.DueDate), fmtDate(due)] as [string, string, string]] : []),
    ...(changes.AssignedOwnerEmail ? [['Odpovědná osoba', name(run.AssignedOwnerEmail), name(owner)] as [string, string, string]] : []),
    ...(changes.BackupOwnerEmail !== undefined ? [['Zástupce', name(run.BackupOwnerEmail), name(backup)] as [string, string, string]] : []),
    ...(changes.ReviewerEmail !== undefined ? [['Schvalovatel', name(run.ReviewerEmail), name(reviewer)] as [string, string, string]] : []),
  ];
  return (
    <div className="space-y-4">
      {run.WorkflowState !== 'Planned' && (
        <Notice tone="amber" icon={AlertTriangle}>
          Běh je ve stavu „{run.WorkflowState === 'InProgress' ? 'Rozpracováno' : 'Vráceno'}“. Změna osoby předá rozpracovanou práci; vyplněné údaje zůstanou zachovány.
        </Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plánované datum">
          <Input type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} autoFocus={focus === 'date'} />
        </Field>
        <Field label="Termín splnění">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Odpovědná osoba">
          <UserPicker users={users} value={owner} onChange={(v) => setOwner(v ?? run.AssignedOwnerEmail)} />
        </Field>
        <Field label="Zástupce">
          <UserPicker users={users} value={backup} allowEmpty onChange={setBackup} />
        </Field>
        {run.ApprovalRequired && (
          <Field label="Schvalovatel">
            <UserPicker users={users} value={reviewer} onChange={setReviewer} />
          </Field>
        )}
        <Field label="Poznámka k výskytu" className={run.ApprovalRequired ? '' : 'sm:col-span-2'}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Např. jednorázové rozšíření vzorku" />
        </Field>
        <Field label="Důvod změny" required className="sm:col-span-2" hint="Uloží se do auditní historie u každého změněného pole.">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      {diffRows.length > 0 && (
        <div className="rounded-lg border border-line">
          <p className="border-b border-line bg-slate-50/70 px-4 py-2 text-[13px] font-medium text-slate-700">Náhled změny (pouze tento výskyt)</p>
          <table className="w-full text-[13px]">
            <tbody>
              {diffRows.map(([k, a, b]) => (
                <tr key={k} className="border-t border-line/60 first:border-0">
                  <td className="w-40 px-4 py-1.5 text-slate-500">{k}</td>
                  <td className="px-4 py-1.5 text-slate-500 line-through">{a}</td>
                  <td className="px-4 py-1.5 font-medium text-slate-900">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {changed && errors.filter((e) => !/Důvod/.test(e)).length > 0 && (
        <Notice tone="red" icon={AlertTriangle}>
          {errors.filter((e) => !/Důvod/.test(e)).join(' ')}
        </Notice>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button onClick={onDone}>Zrušit</Button>
        <Button
          variant="primary"
          disabled={!changed || errors.length > 0}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await exec(() => overrideRun(ctx, run.RunId, run.RowVersion, changes, reason), 'Výskyt byl jednorázově upraven.');
            setBusy(false);
            if (ok !== undefined) onDone();
          }}
        >
          Uložit jen pro tento výskyt
        </Button>
      </div>
    </div>
  );
}

export function FindingDialog({ open, onClose, run, finding }: { open: boolean; onClose: () => void; run: ControlRun; finding?: Finding }) {
  const { ctx, today, run: exec } = useApp();
  const { users } = useUsers();
  const [description, setDescription] = useState('');
  const [action, setAction] = useState('');
  const [severity, setSeverity] = useState<FindingSeverity>('Medium');
  const [responsible, setResponsible] = useState<string | null>(run.AssignedOwnerEmail);
  const [due, setDue] = useState('');
  const [status, setStatus] = useState<FindingStatus>('Open');
  const [resolution, setResolution] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setReason('');
    setDescription(finding?.FindingDescription ?? '');
    setAction(finding?.CorrectiveAction ?? '');
    setSeverity(finding?.Severity ?? 'Medium');
    setResponsible(finding?.ResponsiblePerson ?? run.AssignedOwnerEmail);
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 30);
    setDue(finding?.DueDate ?? d.toISOString().slice(0, 10));
    setStatus(finding?.Status ?? 'Open');
    setResolution(finding?.ResolutionComment ?? '');
  }, [open, finding, run.AssignedOwnerEmail, today]);
  const errors = finding ? [] : validateFinding({ description, correctiveAction: action, severity, responsible: responsible ?? '', dueDate: due }, today);
  const needReason = !!finding && (due !== finding.DueDate || responsible !== finding.ResponsiblePerson);
  const closeInvalid = status === 'Closed' && !resolution.trim();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={finding ? `Zjištění ${finding.FindingCode}` : 'Nové zjištění a nápravné opatření'}
      description={`${run.ControlCode} · ${run.RunCode}`}
      footer={
        <>
          <Button onClick={onClose}>Zrušit</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={(touched && errors.length > 0) || closeInvalid || (needReason && !reason.trim())}
            onClick={async () => {
              setTouched(true);
              if (errors.length) return;
              setBusy(true);
              const ok = finding
                ? await exec(() => updateFinding(ctx, finding.FindingId, finding.RowVersion, { FindingDescription: description, CorrectiveAction: action, Severity: severity, ResponsiblePerson: responsible ?? finding.ResponsiblePerson, DueDate: due, Status: status, ResolutionComment: resolution }, reason), 'Zjištění uloženo.')
                : await exec(() => createFinding(ctx, run.RunId, { description, correctiveAction: action, severity, responsible: responsible ?? '', dueDate: due }), (f) => `Zjištění ${f.FindingCode} založeno.`);
              setBusy(false);
              if (ok !== undefined) onClose();
            }}
          >
            Uložit
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Popis zjištění" required className="sm:col-span-2" error={touched && description.trim().length < 5 ? 'Popište zjištění (alespoň 5 znaků).' : undefined}>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!!finding && finding.Status === 'Closed'} />
        </Field>
        <Field label="Nápravné opatření" className="sm:col-span-2">
          <Textarea rows={2} value={action} onChange={(e) => setAction(e.target.value)} />
        </Field>
        <Field label="Závažnost" required>
          <Select value={severity} onChange={(e) => setSeverity(e.target.value as FindingSeverity)}>
            {Object.entries(SEVERITY_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Termín nápravy" required error={touched ? errors.find((e) => /Termín/.test(e)) : undefined}>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Odpovědná osoba" required className="sm:col-span-2">
          <UserPicker users={users} value={responsible} onChange={setResponsible} />
        </Field>
        {finding && (
          <>
            <Field label="Stav">
              <Select value={status} onChange={(e) => setStatus(e.target.value as FindingStatus)}>
                {Object.entries(FINDING_STATUS_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Popis vyřešení" required={status === 'Closed'} className="sm:col-span-2" error={closeInvalid ? 'Pro uzavření vyplňte popis vyřešení.' : undefined}>
              <Textarea rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} />
            </Field>
            <Field label="Důvod změny" required={needReason} className={cx('sm:col-span-2')} hint="Povinné při změně termínu nebo odpovědné osoby.">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}
