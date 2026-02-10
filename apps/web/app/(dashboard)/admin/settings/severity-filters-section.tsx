import type { AlertSettings } from '../../../lib/api';

interface SeverityFiltersSectionProps {
  alertSettings: AlertSettings;
  onAlertSettingsChange: (settings: AlertSettings) => void;
}

const SEVERITY_FILTERS = [
  { key: 'notifyOnCritical', label: 'Kritisch', color: 'bg-red-500' },
  { key: 'notifyOnWarning', label: 'Warnung', color: 'bg-amber-500' },
  { key: 'notifyOnInfo', label: 'Info', color: 'bg-blue-500' },
] as const;

export function SeverityFiltersSection({
  alertSettings,
  onAlertSettingsChange,
}: SeverityFiltersSectionProps) {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Schweregrad-Filter</h2>
      <div className="mb-6 space-y-3">
        {SEVERITY_FILTERS.map((filter) => (
          <label key={filter.key} className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={alertSettings[filter.key]}
              onChange={(event) =>
                onAlertSettingsChange({ ...alertSettings, [filter.key]: event.target.checked })
              }
              className="h-4 w-4 rounded text-blue-600"
            />
            <span className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${filter.color}`} />
              {filter.label}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}
