import type { UserFormData } from './types';

export const ROLES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'admin', label: 'Administrator' },
  { value: 'manager', label: 'Manager' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'viewer', label: 'Betrachter' },
  { value: 'auditor', label: 'Auditor' },
];

export const EMPTY_USER_FORM: UserFormData = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  role: 'viewer',
};

export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
