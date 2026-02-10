import { redirect } from 'next/navigation';
import { getServerUser } from './lib/server-auth';

export default async function Home() {
  const user = await getServerUser();
  redirect(user ? '/dashboard' : '/login');
}
