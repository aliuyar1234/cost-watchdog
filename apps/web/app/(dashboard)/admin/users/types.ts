import type { UserDetails } from '../../../lib/api/users';

export type User = UserDetails;

export interface UserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}
