import { Modal } from '../../../components/ui/modal';
import { ROLES } from './constants';
import type { UserFormData } from './types';

interface UserFormModalProps {
  mode: 'create' | 'edit';
  formData: UserFormData;
  onFormDataChange: (value: UserFormData) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}

export function UserFormModal({
  mode,
  formData,
  onFormDataChange,
  onClose,
  onSubmit,
}: UserFormModalProps) {
  const roleOptions = ROLES;
  const isCreate = mode === 'create';
  const title = isCreate ? 'Neuen Benutzer erstellen' : 'Benutzer bearbeiten';

  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">E-Mail</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => onFormDataChange({ ...formData, email: e.target.value })}
              className={`w-full rounded-lg border px-3 py-2 ${isCreate ? '' : 'bg-gray-100'}`}
              required
              disabled={!isCreate}
            />
          </div>

          {isCreate && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Passwort</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => onFormDataChange({ ...formData, password: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
                required
                minLength={8}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Vorname</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => onFormDataChange({ ...formData, firstName: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nachname</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => onFormDataChange({ ...formData, lastName: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Rolle</label>
            <select
              value={formData.role}
              onChange={(e) => onFormDataChange({ ...formData, role: e.target.value })}
              className="w-full rounded-lg border px-3 py-2"
            >
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            {isCreate ? 'Erstellen' : 'Speichern'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
