import type { GeneralSettings } from '../../../lib/api';

interface GeneralSettingsPanelProps {
  generalSettings: GeneralSettings;
  onGeneralSettingsChange: (settings: GeneralSettings) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function GeneralSettingsPanel({
  generalSettings,
  onGeneralSettingsChange,
  onSave,
  saving,
}: GeneralSettingsPanelProps) {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h2 className="mb-6 text-lg font-semibold">Allgemeine Einstellungen</h2>
      <p className="mb-6 text-gray-600">
        Steuern Sie die Zeitzone der Anwendung (z. B. fuer die taegliche Zusammenfassung).
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Zeitzone</label>
          <input
            type="text"
            value={generalSettings.timezone}
            onChange={(e) =>
              onGeneralSettingsChange({ ...generalSettings, timezone: e.target.value })
            }
            placeholder="Europe/Berlin"
            className="w-full rounded-lg border px-3 py-2"
          />
          <p className="mt-1 text-sm text-gray-500">
            Verwenden Sie eine IANA-Zeitzone wie Europe/Berlin oder America/New_York.
          </p>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={() => void onSave()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Speichere...' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}
