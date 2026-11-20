import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button, Field, Textarea, cx } from './ui';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  icon?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]):not([disabled]), textarea, select, button:not([data-close])');
      el?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-[1240px]' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/45 p-4 pt-[6vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className={cx('relative mb-10 flex max-h-[88vh] w-full flex-col rounded-xl bg-white shadow-[var(--shadow-pop)]', w)}>
        <div className="flex items-start gap-3 border-b border-line px-6 py-4">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
          </div>
          <button data-close type="button" onClick={onClose} className="-mr-2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Zavřít">
            <X className="size-4.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scroll-thin">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-line bg-slate-50/70 px-6 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Potvrzovací dialog s volitelným povinným důvodem (auditní stopa). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Potvrdit',
  tone = 'primary',
  reasonLabel,
  reasonRequired = false,
  minReason = 3,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<unknown> | void;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  reasonLabel?: string;
  reasonRequired?: boolean;
  minReason?: number;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const invalid = reasonRequired && reason.trim().length < minReason;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      icon={
        tone === 'danger' ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangle className="size-4" />
          </span>
        ) : undefined
      }
      footer={
        <>
          <Button onClick={onClose}>Zrušit</Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            disabled={invalid}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-600">
        {children}
        {reasonLabel && (
          <Field label={reasonLabel} required={reasonRequired} hint={reasonRequired ? 'Důvod se uloží do auditní historie.' : undefined}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
