import type { AlertSettings } from '../../../lib/api';

interface AlertLimitsSectionProps {
  alertSettings: AlertSettings;
  onAlertSettingsChange: (settings: AlertSettings) => void;
}

export function AlertLimitsSection({
  alertSettings,
  onAlertSettingsChange,
}: AlertLimitsSectionProps) {
  return (
    <div className="mb-6">
      <h2 className="mb-4 text-lg font-semibold">Alert limits</h2>
      <label className="mb-2 block text-sm font-medium text-gray-700">Max alerts per day</label>
      <input
        type="number"
        min={1}
        max={1000}
        value={alertSettings.maxAlertsPerDay}
        onChange={(event) =>
          onAlertSettingsChange({ ...alertSettings, maxAlertsPerDay: Number(event.target.value) })
        }
        className="w-32 rounded-lg border px-3 py-2"
      />
      <p className="mt-1 text-sm text-gray-500">
        Limits total alerts sent across all channels per day.
      </p>
    </div>
  );
}
