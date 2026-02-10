import DashboardShell from './dashboard-shell';
import { requireServerUser } from '../lib/server-auth';
import { AuthProvider } from '../lib/auth-context';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireServerUser();

  return (
    <AuthProvider initialUser={user}>
      <DashboardShell initialUser={user}>{children}</DashboardShell>
    </AuthProvider>
  );
}
