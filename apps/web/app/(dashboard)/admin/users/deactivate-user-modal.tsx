import { Modal } from '../../../components/ui/modal';
import type { User } from './types';

interface DeactivateUserModalProps {
  user: User;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeactivateUserModal({
  user,
  isLoading,
  onClose,
  onConfirm,
}: DeactivateUserModalProps) {
  return (
    <Modal title="Benutzer deaktivieren" onClose={onClose}>
      <p className="text-gray-700">
        Moechten Sie den Benutzer <span className="font-medium">{user.email}</span> wirklich
        deaktivieren?
      </p>
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
          disabled={isLoading}
          onClick={() => void onConfirm()}
          className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isLoading ? 'Deaktivieren...' : 'Deaktivieren'}
        </button>
      </div>
    </Modal>
  );
}
