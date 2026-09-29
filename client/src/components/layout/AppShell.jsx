import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, LogOut, Menu, X, GraduationCap, HelpCircle, CheckCheck } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { timeAgo } from '../../lib/format.js';
import { Avatar } from '../ui/index.js';
import { useViva } from '../viva/VivaContext.jsx';
import { LiveUmlPanel } from '../viva/LiveUmlPanel.jsx';
import { Logo } from './Logo.jsx';
import { NAV, COMMON_NAV } from './nav.js';

function SideNav({ items, onNavigate }) {
  return (
    <nav className="space-y-0.5">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate}
          className={({ isActive }) => clsx('group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition', isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white')}>
          {({ isActive }) => (<><Icon className={clsx('size-[18px] transition', isActive ? 'text-brass-400' : 'text-ink-400 group-hover:text-ink-200')} />{label}</>)}
        </NavLink>
      ))}
    </nav>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi('/notifications?channel=IN_APP', { poll: 30000 });
  const unread = data?.unread ?? 0;
  const markAll = async () => { await api.post('/notifications/read-all'); reload({ quiet: true }); };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-800" aria-label="Notifications">
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-[360px] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-[var(--shadow-lift)]">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
              <span className="font-semibold">Notifications</span>
              <button onClick={markAll} className="inline-flex items-center gap-1 text-xs font-medium text-brass-700 hover:underline"><CheckCheck className="size-3.5" />Mark all read</button>
            </div>
            <ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
              {(data?.notifications || []).slice(0, 12).map((n) => (
                <li key={n.id} className={clsx('px-4 py-3', !n.readAt && 'bg-brass-50/60')}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink-800">{n.subject}</span>
                    <span className="shrink-0 text-[11px] text-ink-400">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-600">{n.body}</p>
                </li>
              ))}
              {!data?.notifications?.length && <li className="px-4 py-8 text-center text-sm text-ink-500">You're all caught up.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { enabled, toggle } = useViva();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => { setMobileOpen(false); window.scrollTo(0, 0); }, [location.pathname]);
  const items = NAV[user.role] || [];

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-900 grain px-3 py-4">
      <Link to={user.home} className="mb-6 px-2"><Logo dark /></Link>
      <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">{user.role}</div>
      <SideNav items={items} onNavigate={() => setMobileOpen(false)} />
      <div className="mt-6 mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">Project</div>
      <SideNav items={COMMON_NAV} />
      <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white">{user.name}</div>
            <div className="truncate text-[11.5px] text-ink-400">{user.guestId ? `Guest ID ${user.guestId}` : user.employeeId || user.email}</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-ink-200/60 bg-sand/85 px-4 backdrop-blur md:px-8">
          <button className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">{mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          <div className="flex-1" />
          <button onClick={toggle} title="Viva Mode: show how each screen traces back to the SRS, UML and DFD documents"
            className={clsx('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition', enabled ? 'border-brass-400 bg-brass-400 text-ink-950 shadow' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300')}>
            <GraduationCap className="size-4" />Viva mode<span className={clsx('rounded-full px-1.5 text-[10.5px]', enabled ? 'bg-ink-950/15' : 'bg-ink-100')}>{enabled ? 'ON' : 'OFF'}</span>
          </button>
          <Link to="/help" className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-800" aria-label="Help" title="Help centre"><HelpCircle className="size-5" /></Link>
          <NotificationBell />
          <button onClick={async () => { await logout(); navigate('/login'); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900" title="Log out">
            <LogOut className="size-4" /><span className="hidden sm:inline">Log out</span>
          </button>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
      <LiveUmlPanel />
    </div>
  );
}
