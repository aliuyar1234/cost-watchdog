'use client';

import { useAuth } from '../../../lib/auth-context';
import { type SettingsTab } from './constants';
import { useAdminSettings } from './use-admin-settings';
import { SettingsTabs } from './settings-tabs';
import { GeneralSettingsPanel } from './general-settings-panel';
import { AlertSettingsPanel } from './alert-settings-panel';
import { ThresholdSettingsPanel } from './threshold-settings-panel';
import { ApiKeysPanel } from './api-keys-panel';

export default function SettingsPage() {
  const { user } = useAuth();
  const {
    activeTab,
    setActiveTab,
    alertSettings,
    setAlertSettings,
    thresholds,
    setThresholds,
    generalSettings,
    setGeneralSettings,
    saving,
    testingSlack,
    testingTeams,
    message,
    handleSaveGeneral,
    handleSaveAlerts,
    handleSaveThresholds,
    testSlackWebhook,
    testTeamsWebhook,
  } = useAdminSettings(user?.role);

  if (user?.role !== 'admin') {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-700">Sie haben keine Berechtigung fuer diese Seite.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>
        <p className="mt-1 text-gray-600">
          Konfigurieren Sie allgemeine Einstellungen, Benachrichtigungen und Schwellenwerte
        </p>
      </div>

      {message && (
        <div
          className={`mb-6 rounded-lg p-4 ${
            message.type === 'success'
              ? 'border border-green-200 bg-green-50'
              : 'border border-red-200 bg-red-50'
          }`}
        >
          <p className={message.type === 'success' ? 'text-green-700' : 'text-red-700'}>
            {message.text}
          </p>
        </div>
      )}

      <SettingsTabs activeTab={activeTab} onTabChange={(tab: SettingsTab) => setActiveTab(tab)} />

      {activeTab === 'general' && (
        <GeneralSettingsPanel
          generalSettings={generalSettings}
          onGeneralSettingsChange={setGeneralSettings}
          onSave={handleSaveGeneral}
          saving={saving}
        />
      )}

      {activeTab === 'alerts' && (
        <AlertSettingsPanel
          alertSettings={alertSettings}
          onAlertSettingsChange={setAlertSettings}
          onSave={handleSaveAlerts}
          onTestSlack={testSlackWebhook}
          onTestTeams={testTeamsWebhook}
          saving={saving}
          testingSlack={testingSlack}
          testingTeams={testingTeams}
        />
      )}

      {activeTab === 'thresholds' && (
        <ThresholdSettingsPanel
          thresholds={thresholds}
          onThresholdsChange={setThresholds}
          onSave={handleSaveThresholds}
          saving={saving}
        />
      )}

      {activeTab === 'api' && <ApiKeysPanel />}
    </div>
  );
}
