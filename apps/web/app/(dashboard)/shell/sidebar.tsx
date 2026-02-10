'use client';

import Link from 'next/link';
import type { User } from '../../lib/api';
import { adminNavigation, navigation } from './navigation';
import { ChartLogoIcon, CloseIcon, LogoutIcon } from './icons';

interface DashboardSidebarProps {
  pathname: string;
  user: User;
  onLogout: () => void;
  onNavigate?: () => void;
  onCloseMenu?: () => void;
  isMobile?: boolean;
}

function getNavItemClassName(isActive: boolean): string {
  return `flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
    isActive
      ? 'bg-slate-900 text-white shadow-[0_10px_25px_-18px_rgba(15,23,42,0.8)]'
      : 'text-slate-600 hover:bg-white/85 hover:text-slate-900'
  }`;
}

function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar({
  pathname,
  user,
  onLogout,
  onNavigate,
  onCloseMenu,
  isMobile = false,
}: DashboardSidebarProps) {
  const userInitials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.trim();

  return (
    <div className="bg-white/76 flex h-full flex-col border-r border-white/70 backdrop-blur-xl">
      <div className="flex h-20 items-center justify-between border-b border-white/80 px-6">
        <div className="flex items-center">
          <div className="rounded-xl bg-slate-900 p-2 text-white shadow-soft">
            <ChartLogoIcon className="h-5 w-5" />
          </div>
          <div className="ml-3">
            <span className="font-display text-2xl font-semibold text-slate-900">
              Cost Watchdog
            </span>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Operations</p>
          </div>
        </div>
        {isMobile && onCloseMenu && (
          <button
            type="button"
            onClick={onCloseMenu}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Menue schliessen"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6">
        <ul className="space-y-1.5">
          {navigation.map((item) => {
            const isActive = isActiveRoute(pathname, item.href);
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={getNavItemClassName(isActive)}
                >
                  <item.icon
                    className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-slate-400'}`}
                  />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>

        {user.role === 'admin' && (
          <>
            <div className="mb-2 mt-8 px-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Administration
              </p>
            </div>
            <ul className="space-y-1.5">
              {adminNavigation.map((item) => {
                const isActive = isActiveRoute(pathname, item.href);
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={getNavItemClassName(isActive)}
                    >
                      <item.icon
                        className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-slate-400'}`}
                      />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-white/70 p-4">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900">
              <span className="text-sm font-medium text-white">{userInitials || 'U'}</span>
            </div>
            <div className="ml-3 min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="Abmelden"
            aria-label="Abmelden"
          >
            <LogoutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
