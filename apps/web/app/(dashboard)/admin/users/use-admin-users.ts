'use client';

import { useCallback, useEffect, useState } from 'react';
import { usersApi } from '../../../lib/api/users';
import { EMPTY_USER_FORM, getErrorMessage } from './constants';
import type { User, UserFormData } from './types';

interface UseAdminUsersResult {
  users: User[];
  loading: boolean;
  error: string | null;
  notice: string | null;
  showCreateModal: boolean;
  editingUser: User | null;
  userToDeactivate: User | null;
  userToResetPassword: User | null;
  newPassword: string;
  isDeactivatingUser: boolean;
  isResettingPassword: boolean;
  formData: UserFormData;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
  setShowCreateModal: (value: boolean) => void;
  setEditingUser: (value: User | null) => void;
  setUserToDeactivate: (value: User | null) => void;
  setUserToResetPassword: (value: User | null) => void;
  setNewPassword: (value: string) => void;
  setFormData: (value: UserFormData) => void;
  createUser: () => Promise<void>;
  updateUser: () => Promise<void>;
  deactivateUser: (userId: string) => Promise<void>;
  resetPasswordForUser: (userId: string) => Promise<void>;
  openCreateModal: () => void;
  openEditModal: (user: User) => void;
  openDeactivateModal: (user: User) => void;
  openResetPasswordModal: (user: User) => void;
}

export function useAdminUsers(isAdmin: boolean): UseAdminUsersResult {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isDeactivatingUser, setIsDeactivatingUser] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [formData, setFormData] = useState<UserFormData>(EMPTY_USER_FORM);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    try {
      setLoading(true);
      const data = await usersApi.list();
      setUsers(data.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Laden'));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    void fetchUsers();
  }, [fetchUsers, isAdmin]);

  const createUser = async () => {
    try {
      await usersApi.create(formData);
      setShowCreateModal(false);
      setFormData(EMPTY_USER_FORM);
      await fetchUsers();
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Erstellen'));
    }
  };

  const updateUser = async () => {
    if (!editingUser) {
      return;
    }

    try {
      await usersApi.update(editingUser.id, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
      });
      setEditingUser(null);
      setFormData(EMPTY_USER_FORM);
      await fetchUsers();
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Aktualisieren'));
    }
  };

  const deactivateUser = async (userId: string) => {
    try {
      setIsDeactivatingUser(true);
      await usersApi.delete(userId);
      setUserToDeactivate(null);
      await fetchUsers();
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Deaktivieren'));
    } finally {
      setIsDeactivatingUser(false);
    }
  };

  const resetPasswordForUser = async (userId: string) => {
    if (newPassword.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }

    try {
      setIsResettingPassword(true);
      await usersApi.resetPassword(userId, newPassword);
      setNotice('Passwort erfolgreich zurueckgesetzt');
      setUserToResetPassword(null);
      setNewPassword('');
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Zuruecksetzen'));
    } finally {
      setIsResettingPassword(false);
    }
  };

  const openCreateModal = () => {
    setError(null);
    setNotice(null);
    setFormData(EMPTY_USER_FORM);
    setShowCreateModal(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    });
  };

  const openDeactivateModal = (user: User) => {
    setError(null);
    setNotice(null);
    setUserToDeactivate(user);
  };

  const openResetPasswordModal = (user: User) => {
    setError(null);
    setNotice(null);
    setNewPassword('');
    setUserToResetPassword(user);
  };

  return {
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
  };
}
