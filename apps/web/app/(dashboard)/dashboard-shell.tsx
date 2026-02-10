'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { User } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { LogoutIcon, MenuIcon } from './shell/icons';
import { DashboardSidebar } from './shell/sidebar';

interface DashboardShellProps {
  children: React.ReactNode;
  initialUser: User;
}

export default function DashboardShell({ children, initialUser }: DashboardShellProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const resolvedUser = user ?? initialUser;

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen">
      <header className="bg-white/78 sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/70 px-4 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Menue oeffnen"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <span className="font-display text-lg font-semibold text-slate-900">Cost Watchdog</span>
        <button
          type="button"
          onClick={logout}
          className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Abmelden"
          title="Abmelden"
        >
          <LogoutIcon className="h-5 w-5" />
        </button>
      </header>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 lg:block">
        <DashboardSidebar pathname={pathname} user={resolvedUser} onLogout={logout} />
      </aside>

      <div
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px] transition-opacity lg:hidden ${
          isMobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setIsMobileMenuOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 ease-out lg:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <DashboardSidebar
          pathname={pathname}
          user={resolvedUser}
          onLogout={logout}
          onNavigate={() => setIsMobileMenuOpen(false)}
          onCloseMenu={() => setIsMobileMenuOpen(false)}
          isMobile
        />
      </aside>

      <div className="lg:pl-72">
        <main className="p-4 sm:p-6 lg:p-8 xl:p-10">{children}</main>
      </div>
    </div>
  );
}
