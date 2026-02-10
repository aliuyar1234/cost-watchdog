import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { User } from './api/auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001/api/v1';

async function getRequestCookieHeader(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');

  return cookieHeader || null;
}

export async function getServerUser(): Promise<User | null> {
  const cookieHeader = await getRequestCookieHeader();
  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { user?: User };
    return payload.user ?? null;
  } catch {
    return null;
  }
}

export async function requireServerUser(): Promise<User> {
  const user = await getServerUser();
  if (!user) {
    redirect('/login');
  }

  return user;
}
