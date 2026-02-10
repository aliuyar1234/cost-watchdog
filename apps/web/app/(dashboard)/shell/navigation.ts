import type { ComponentType } from 'react';
import { AlertIcon, BellIcon, DocumentIcon, HomeIcon, SettingsIcon, UsersIcon } from './icons';

export interface NavigationItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

export const navigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Anomalien', href: '/anomalies', icon: AlertIcon },
  { name: 'Dokumente', href: '/documents', icon: DocumentIcon },
  { name: 'Benachrichtigungen', href: '/settings/notifications', icon: BellIcon },
];

export const adminNavigation: NavigationItem[] = [
  { name: 'Benutzer', href: '/admin/users', icon: UsersIcon },
  { name: 'Einstellungen', href: '/admin/settings', icon: SettingsIcon },
];
