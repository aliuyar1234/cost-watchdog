'use client';

import { useAuth } from '../../../lib/auth-context';
import { ROLES } from './constants';
import { useAdminUsers } from './use-admin-users';
import { UsersTable } from './users-table';
import { UserFormModal } from './user-form-modal';
import { DeactivateUserModal } from './deactivate-user-modal';
import { ResetPasswordModal } from './reset-password-modal';

const roleLabelByValue = Object.fromEntries(ROLES.map((role) => [role.value, role.label]));

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const {
    users,
    loading,
    error,
    notice,
    showCreateModal,
    editingUser,
    userToDeactivate,
    userToResetPassword,
    newPassword,
    isDeactivatingUser,
    isResettingPassword,
    formData,
    setError,
    setNotice,
    setShowCreateModal,
    setEditingUser,
    setUserToDeactivate,
    setUserToResetPassword,
    setNewPassword,
    setFormData,
    createUser,
    updateUser,
    deactivateUser,
    resetPasswordForUser,
    openCreateModal,
    openEditModal,
    openDeactivateModal,
    openResetPasswordModal,
  } = useAdminUsers(isAdmin);

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-700">Sie haben keine Berechtigung fuer diese Seite.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Benutzerverwaltung</h1>
          <p className="mt-1 text-gray-600">Verwalten Sie Benutzer und Berechtigungen</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Neuer Benutzer
        </button>
      </div>

      {notice && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-green-700">{notice}</p>
          <button onClick={() => setNotice(null)} className="mt-1 text-sm text-green-700 underline">
            Schliessen
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="mt-1 text-sm text-red-600 underline">
            Schliessen
          </button>
        </div>
      )}

      <UsersTable
        users={users}
        currentUserId={currentUser?.id}
        roleLabelByValue={roleLabelByValue}
        onEdit={openEditModal}
        onOpenResetPassword={openResetPasswordModal}
        onOpenDeactivate={openDeactivateModal}
      />

      {showCreateModal && (
        <UserFormModal
          mode="create"
          formData={formData}
          onFormDataChange={setFormData}
          onClose={() => setShowCreateModal(false)}
          onSubmit={createUser}
        />
      )}

      {editingUser && (
        <UserFormModal
          mode="edit"
          formData={formData}
          onFormDataChange={setFormData}
          onClose={() => setEditingUser(null)}
          onSubmit={updateUser}
        />
      )}

      {userToDeactivate && (
        <DeactivateUserModal
          user={userToDeactivate}
          isLoading={isDeactivatingUser}
          onClose={() => setUserToDeactivate(null)}
          onConfirm={() => deactivateUser(userToDeactivate.id)}
        />
      )}

      {userToResetPassword && (
        <ResetPasswordModal
          user={userToResetPassword}
          newPassword={newPassword}
          isLoading={isResettingPassword}
          onNewPasswordChange={setNewPassword}
          onClose={() => {
            setUserToResetPassword(null);
            setNewPassword('');
          }}
          onConfirm={() => resetPasswordForUser(userToResetPassword.id)}
        />
      )}
    </div>
  );
}
