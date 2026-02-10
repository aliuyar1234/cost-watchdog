import type { ThresholdSettings } from '../../../lib/api';

interface ThresholdSettingsPanelProps {
  thresholds: ThresholdSettings;
  onThresholdsChange: (settings: ThresholdSettings) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function ThresholdSettingsPanel({
  thresholds,
  onThresholdsChange,
  onSave,
  saving,
}: ThresholdSettingsPanelProps) {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h2 className="mb-6 text-lg font-semibold">Anomalie-Schwellenwerte</h2>
      <p className="mb-6 text-gray-600">
        Passen Sie die Schwellenwerte an, ab denen Kostenabweichungen als Anomalien erkannt werden.
      </p>

      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Year-over-Year Abweichung (%)
          </label>
          <input
            type="number"
            value={thresholds.yoyThreshold}
            onChange={(e) =>
              onThresholdsChange({ ...thresholds, yoyThreshold: Number(e.target.value) })
            }
            className="w-32 rounded-lg border px-3 py-2"
            min={1}
            max={100}
          />
          <p className="mt-1 text-sm text-gray-500">
            Anomalie bei mehr als {thresholds.yoyThreshold}% Abweichung zum Vorjahr
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Month-over-Month Abweichung (%)
          </label>
          <input
            type="number"
            value={thresholds.momThreshold}
            onChange={(e) =>
              onThresholdsChange({ ...thresholds, momThreshold: Number(e.target.value) })
            }
            className="w-32 rounded-lg border px-3 py-2"
            min={1}
            max={100}
          />
          <p className="mt-1 text-sm text-gray-500">
            Anomalie bei mehr als {thresholds.momThreshold}% Abweichung zum Vormonat
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Preis pro Einheit Abweichung (%)
          </label>
          <input
            type="number"
            value={thresholds.pricePerUnitThreshold}
            onChange={(e) =>
              onThresholdsChange({ ...thresholds, pricePerUnitThreshold: Number(e.target.value) })
            }
            className="w-32 rounded-lg border px-3 py-2"
            min={1}
            max={100}
          />
          <p className="mt-1 text-sm text-gray-500">
            Anomalie bei mehr als {thresholds.pricePerUnitThreshold}% Preisabweichung
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Budget-Ueberschreitung (%)
          </label>
          <input
            type="number"
            value={thresholds.budgetThreshold}
            onChange={(e) =>
              onThresholdsChange({ ...thresholds, budgetThreshold: Number(e.target.value) })
            }
            className="w-32 rounded-lg border px-3 py-2"
            min={1}
            max={100}
          />
          <p className="mt-1 text-sm text-gray-500">
            Anomalie bei mehr als {thresholds.budgetThreshold}% ueber Budget
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Mindest-Historienmonate
          </label>
          <input
            type="number"
            value={thresholds.minHistoricalMonths}
            onChange={(e) =>
              onThresholdsChange({ ...thresholds, minHistoricalMonths: Number(e.target.value) })
            }
            className="w-32 rounded-lg border px-3 py-2"
            min={1}
            max={36}
          />
          <p className="mt-1 text-sm text-gray-500">
            Mindestens {thresholds.minHistoricalMonths} Monate Daten fuer YoY-Vergleich
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
