import { useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Code2,
  FileBarChart2,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Menu as MenuIcon,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { can } from '../../domain/permissions';
import { ROLE_LABELS, NOTIFICATION_TYPE_LABELS } from '../../domain/labels';
import type { RoleName } from '../../domain/types';
import { Logo, useApp } from '../AppContext';
import { Avatar, Badge, cx } from '../components/ui';
import { Popover } from '../components/Popover';
import { PaRef } from '../components/PaRef';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { fmtDate, fmtDateTime } from '../format';
import { setPaReferenceMode } from '../../services/adminService';
import { markNotificationsRead } from '../../services/notificationService';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  visible: boolean;
  badge?: number;
}

export function AppShell() {
  const { session, store, version, today } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const myOpen = useMemo(
    () =>
      store.runs.filter(
        (r) =>
          !r.IsSuperseded &&
          (r.AssignedOwnerEmail === session.user.Email || r.BackupOwnerEmail === session.user.Email) &&
          ['Planned', 'InProgress', 'Returned'].includes(r.WorkflowState) &&
          r.ScheduledDate <= today,
      ).length +
      (session.activeRole === 'Reviewer' ? store.runs.filter((r) => r.WorkflowState === 'Submitted' && r.ReviewerEmail === session.user.Email).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, session, version, today],
  );
  const nav: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    { to: '/my', label: 'Moje kontroly', icon: ClipboardCheck, visible: session.activeRole !== 'Auditor', badge: myOpen },
    { to: '/controls', label: 'Registr kontrol', icon: ListChecks, visible: can(session, 'viewRegister') },
    { to: '/calendar', label: 'Kalendář', icon: CalendarDays, visible: true },
    { to: '/management', label: 'Manažerský přehled', icon: BarChart3, visible: can(session, 'viewManagement') },
    { to: '/reports', label: 'Reporty', icon: FileBarChart2, visible: can(session, 'viewReports') },
    { to: '/notifications', label: 'Upozornění', icon: Bell, visible: true },
    { to: '/admin', label: 'Administrace', icon: Settings, visible: can(session, 'administer') || can(session, 'viewAudit') },
  ];

  const sidebar = (
    <PaRef id="nav.sidebar" className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 px-5">
        <Logo />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-wide text-white">CONTROL HUB</p>
          <p className="text-[11px] text-navy-300">Internal Control Management</p>
        </div>
      </div>
      <nav className="mt-3 flex-1 space-y-0.5 px-3" aria-label="Hlavní menu">
        {nav
          .filter((n) => n.visible)
          .map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cx(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
                  isActive ? 'bg-white/10 text-white shadow-[inset_2px_0_0_0_#2dd4bf]' : 'text-navy-200 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <n.icon className="size-4.5 opacity-90" />
              <span className="flex-1">{n.label}</span>
              {!!n.badge && <span className="rounded-full bg-teal-400/15 px-1.5 text-[11px] font-semibold text-teal-300 tabular">{n.badge}</span>}
            </NavLink>
          ))}
      </nav>
      <div className="m-3 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-[11.5px] leading-relaxed text-navy-300">
        <p className="mb-1 flex items-center gap-1.5 font-medium text-navy-200">
          <FlaskConical className="size-3.5" /> Demo prostředí
        </p>
        Syntetická data, lokální úložiště prohlížeče. Žádné e-maily se neodesílají.
      </div>
    </PaRef>
  );

  return (
    <div className="flex min-h-full">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] bg-navy-900 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] bg-navy-900">
            <button className="absolute top-4 right-3 rounded p-1 text-navy-200 hover:bg-white/10" onClick={() => setMobileOpen(false)} aria-label="Zavřít menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { session, settings, store } = useApp();
  return (
    <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="Otevřít menu">
        <MenuIcon className="size-5" />
      </button>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
        {settings.testDate && (
          <Badge tone="amber" icon={FlaskConical} title="Testovací datum slouží jen pro simulaci pravidel (Administrace → Demo režim)">
            <span className="hidden sm:inline">Testovací datum:&nbsp;</span>
            {fmtDate(settings.testDate)}
          </Badge>
        )}
        <button
          type="button"
          onClick={() => void setPaReferenceMode(store, !settings.paReferenceMode)}
          className={cx('inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium', settings.paReferenceMode ? 'bg-purple-100 text-purple-800' : 'text-slate-500 hover:bg-slate-100')}
          title="Režim Power Apps Reference"
          aria-pressed={settings.paReferenceMode}
        >
          <Code2 className="size-4" />
          <span className="hidden xl:inline">Power Apps Reference</span>
        </button>
        <NotificationBell key={session.user.Email} />
        <UserSwitcher />
      </div>
    </header>
  );
}

function GlobalSearch() {
  const { store, version } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const controls = store.controls
      .filter((c) => c.ControlCode.toLowerCase().includes(s) || c.Name.toLowerCase().includes(s))
      .slice(0, 5)
      .map((c) => ({ key: c.ControlId, to: `/controls/${c.ControlId}`, title: c.Name, sub: c.ControlCode, kind: 'Kontrola' }));
    const runs = store.runs
      .filter((r) => !r.IsSuperseded && (`${r.ControlCode} ${r.RunCode}`.toLowerCase().includes(s) || r.RunId.startsWith(s)))
      .sort((a, b) => b.DueDate.localeCompare(a.DueDate))
      .slice(0, 4)
      .map((r) => ({ key: r.RunId, to: `/runs/${r.RunId}`, title: `${r.ControlCode} · ${r.RunCode}`, sub: r.ControlName, kind: 'Běh' }));
    const findings = store.findings
      .filter((f) => f.FindingCode.toLowerCase().includes(s) || f.FindingDescription.toLowerCase().includes(s))
      .slice(0, 3)
      .map((f) => ({ key: f.FindingId, to: `/runs/${f.RunId}?tab=findings`, title: f.FindingCode, sub: f.FindingDescription, kind: 'Zjištění' }));
    return [...controls, ...runs, ...findings];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, store, version]);
  return (
    <PaRef id="top.search" className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              nav(results[0].to);
              setQ('');
              setOpen(false);
            }
          }}
          placeholder="Hledat kontrolu, běh nebo zjištění…"
          aria-label="Globální vyhledávání"
          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
      </div>
      {open && q.trim().length >= 2 && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1.5 overflow-hidden rounded-lg border border-line bg-white shadow-[var(--shadow-pop)]">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-slate-500">Nic nenalezeno.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1 scroll-thin">
              {results.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      nav(r.to);
                      setQ('');
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="w-16 shrink-0 text-[11px] font-medium text-slate-400 uppercase">{r.kind}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-slate-800">{r.title}</span>
                      <span className="block truncate text-xs text-slate-500">{r.sub}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </PaRef>
  );
}

function NotificationBell() {
  const { store, session, version, ctx } = useApp();
  const nav = useNavigate();
  const mine = useMemo(
    () =>
      store.notifications
        .filter((n) => n.RecipientEmail === session.user.Email && n.DeliveryStatus !== 'Digested')
        .sort((a, b) => b.CreatedAt.localeCompare(a.CreatedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, session, version],
  );
  const unread = mine.filter((n) => !n.ReadAt).length;
  return (
    <PaRef id="top.bell" inline>
      <Popover
        align="right"
        width={380}
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle} className="relative inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Upozornění (${unread} nepřečtených)`}>
            <Bell className="size-4.5" />
            {unread > 0 && <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] leading-4 font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
          </button>
        )}
      >
        {(close) => (
          <div>
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-sm font-semibold text-slate-900">Upozornění</p>
              {unread > 0 && (
                <button className="text-xs font-medium text-brand-700 hover:underline" onClick={() => void markNotificationsRead(ctx, mine.filter((n) => !n.ReadAt).map((n) => n.NotificationId))}>
                  Označit vše jako přečtené
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto scroll-thin">
              {mine.slice(0, 8).map((n) => (
                <li key={n.NotificationId}>
                  <button
                    type="button"
                    onClick={() => {
                      void markNotificationsRead(ctx, [n.NotificationId]);
                      close();
                      nav(n.RunId ? `/runs/${n.RunId}` : n.ControlId ? `/controls/${n.ControlId}` : '/notifications');
                    }}
                    className={cx('flex w-full gap-2.5 rounded-md px-2 py-2 text-left hover:bg-slate-50', !n.ReadAt && 'bg-brand-50/50')}
                  >
                    <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.ReadAt ? 'bg-transparent' : 'bg-brand-500')} />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium text-slate-400 uppercase">{NOTIFICATION_TYPE_LABELS[n.NotificationType]}</span>
                      <span className="block text-[13px] leading-snug text-slate-800">{n.Subject}</span>
                      <span className="block text-xs text-slate-400">{fmtDateTime(n.CreatedAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {mine.length === 0 && <li className="px-2 py-6 text-center text-[13px] text-slate-500">Žádná upozornění.</li>}
            </ul>
            <button
              className="mt-1 w-full rounded-md px-2 py-2 text-center text-[13px] font-medium text-brand-700 hover:bg-brand-50"
              onClick={() => {
                close();
                nav('/notifications');
              }}
            >
              Otevřít centrum upozornění
            </button>
          </div>
        )}
      </Popover>
    </PaRef>
  );
}

function UserSwitcher() {
  const { session, store, switchUser, version } = useApp();
  const nav = useNavigate();
  const users = useMemo(() => {
    const roles = store.roles.filter((r) => r.IsActive);
    return store.directory
      .all()
      .map((u) => ({ user: u, roles: roles.filter((r) => r.UserEmail === u.Email) }))
      .filter((x) => x.roles.length > 0)
      .sort((a, b) => a.roles[0].Role.localeCompare(b.roles[0].Role) || a.user.DisplayName.localeCompare(b.user.DisplayName, 'cs'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);
  return (
    <PaRef id="top.userSwitch" inline>
      <Popover
        align="right"
        width={340}
        trigger={({ toggle, open }) => (
          <button type="button" onClick={toggle} aria-expanded={open} className="flex items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 hover:bg-slate-100">
            <Avatar initials={session.user.Initials} />
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-[13px] font-semibold text-slate-800">{session.user.DisplayName}</span>
              <span className="block text-[11.5px] text-slate-500">{ROLE_LABELS[session.activeRole]}</span>
            </span>
            <ChevronDown className="size-3.5 text-slate-400" />
          </button>
        )}
      >
        {(close) => (
          <div>
            <div className="mb-1 rounded-md bg-amber-50 px-2.5 py-2 text-[11.5px] leading-snug text-amber-800">
              Přepínání demo uživatele slouží k testování rolí. V produkci identitu určuje přihlášení Microsoft 365 a skutečné zabezpečení oprávnění SharePointu.
            </div>
            {session.assignments.length > 1 && (
              <div className="border-b border-line px-2 py-2">
                <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Aktivní role</p>
                <div className="flex flex-wrap gap-1.5">
                  {session.assignments.map((a) => (
                    <button
                      key={a.AssignmentId}
                      onClick={() => {
                        switchUser(session.user.Email, a.Role);
                        close();
                      }}
                      className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset', a.Role === session.activeRole ? 'bg-brand-600 text-white ring-brand-600' : 'text-slate-700 ring-slate-300 hover:bg-slate-50')}
                    >
                      {ROLE_LABELS[a.Role]} {a.DepartmentScope !== 'ALL' && `(${a.DepartmentScope})`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Přepnout demo uživatele</p>
            <ul className="max-h-80 overflow-y-auto scroll-thin">
              {users.map(({ user, roles }) => (
                <li key={user.Email}>
                  <button
                    type="button"
                    onClick={() => {
                      switchUser(user.Email, roles[0].Role as RoleName);
                      close();
                      nav('/');
                    }}
                    className={cx('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-50', user.Email === session.user.Email && 'bg-brand-50')}
                  >
                    <Avatar initials={user.Initials} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-slate-800">{user.DisplayName}</span>
                      <span className="block truncate text-[11.5px] text-slate-500">{roles.map((r) => ROLE_LABELS[r.Role]).join(' · ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Popover>
    </PaRef>
  );
}
