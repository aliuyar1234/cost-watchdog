import type { AlertSettings } from '../../../lib/api';

interface DailyDigestSectionProps {
  alertSettings: AlertSettings;
  onAlertSettingsChange: (settings: AlertSettings) => void;
}

export function DailyDigestSection({
  alertSettings,
  onAlertSettingsChange,
}: DailyDigestSectionProps) {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Taegliche Zusammenfassung</h2>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-600">Taegliche E-Mail-Zusammenfassung aktivieren</span>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={alertSettings.dailyDigestEnabled}
            onChange={(event) =>
              onAlertSettingsChange({ ...alertSettings, dailyDigestEnabled: event.target.checked })
            }
            className="peer sr-only"
          />
          <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300" />
        </label>
      </div>
      {alertSettings.dailyDigestEnabled && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Versandzeit</label>
          <input
            type="time"
            value={alertSettings.dailyDigestTime}
            onChange={(event) =>
              onAlertSettingsChange({ ...alertSettings, dailyDigestTime: event.target.value })
            }
            className="rounded-lg border px-3 py-2"
          />
        </div>
      )}
    </>
  );
}
