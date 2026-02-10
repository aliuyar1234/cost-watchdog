import type { User } from './types';

interface UsersTableProps {
  users: User[];
  currentUserId: string | undefined;
  roleLabelByValue: Record<string, string>;
  onEdit: (user: User) => void;
  onOpenResetPassword: (user: User) => void;
  onOpenDeactivate: (user: User) => void;
}

function getRoleBadgeClass(role: string): string {
  if (role === 'admin') {
    return 'bg-purple-100 text-purple-800';
  }
  if (role === 'manager') {
    return 'bg-blue-100 text-blue-800';
  }
  return 'bg-gray-100 text-gray-800';
}

export function UsersTable({
  users,
  currentUserId,
  roleLabelByValue,
  onEdit,
  onOpenResetPassword,
  onOpenDeactivate,
}: UsersTableProps) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
              E-Mail
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Rolle
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Letzter Login
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
              Aktionen
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {users.map((user) => (
            <tr key={user.id} className={!user.isActive ? 'bg-gray-50' : ''}>
              <td className="whitespace-nowrap px-6 py-4">
                <div className="flex items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                    <span className="text-sm font-medium text-blue-700">
                      {user.firstName[0]}
                      {user.lastName[0]}
                    </span>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">
                      {user.firstName} {user.lastName}
                    </div>
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{user.email}</td>
              <td className="whitespace-nowrap px-6 py-4">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${getRoleBadgeClass(user.role)}`}
                >
                  {roleLabelByValue[user.role] || user.role}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {user.isActive ? 'Aktiv' : 'Inaktiv'}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('de-DE') : 'Nie'}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onEdit(user)}
                    className="text-blue-600 hover:text-blue-900"
                    title="Bearbeiten"
                    aria-label="Bearbeiten"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => onOpenResetPassword(user)}
                    className="text-yellow-600 hover:text-yellow-900"
                    title="Passwort zuruecksetzen"
                    aria-label="Passwort zuruecksetzen"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                  </button>
                  {user.id !== currentUserId && user.isActive && (
                    <button
                      onClick={() => onOpenDeactivate(user)}
                      className="text-red-600 hover:text-red-900"
                      title="Deaktivieren"
                      aria-label="Deaktivieren"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
