import { Modal } from '../../../components/ui/modal';
import type { User } from './types';

interface ResetPasswordModalProps {
  user: User;
  newPassword: string;
  isLoading: boolean;
  onNewPasswordChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ResetPasswordModal({
  user,
  newPassword,
  isLoading,
  onNewPasswordChange,
  onClose,
  onConfirm,
}: ResetPasswordModalProps) {
  return (
    <Modal title="Passwort zuruecksetzen" onClose={onClose}>
      <p className="mb-4 text-sm text-gray-600">Benutzer: {user.email}</p>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Neues Passwort</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => onNewPasswordChange(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            minLength={8}
            required
            autoFocus
          />
          <p className="mt-1 text-xs text-gray-500">Mindestens 8 Zeichen.</p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          disabled={isLoading}
          onClick={onClose}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
        >
          Abbrechen
        </button>
        <button
          type="button"
          disabled={isLoading || newPassword.length < 8}
          onClick={() => void onConfirm()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Zuruecksetzen...' : 'Zuruecksetzen'}
        </button>
      </div>
    </Modal>
  );
}
