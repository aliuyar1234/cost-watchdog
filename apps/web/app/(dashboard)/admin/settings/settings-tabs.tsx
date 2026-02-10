import type { SettingsTab } from './constants';

const TABS: ReadonlyArray<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: 'Allgemein' },
  { id: 'alerts', label: 'Benachrichtigungen' },
  { id: 'thresholds', label: 'Schwellenwerte' },
  { id: 'api', label: 'API-Schluessel' },
];

interface SettingsTabsProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <div className="mb-6 border-b border-gray-200">
      <nav className="flex gap-8">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`-mb-px border-b-2 pb-4 text-sm font-medium ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
