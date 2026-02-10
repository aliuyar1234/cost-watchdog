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
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4">
          <p className="text-rose-700">Sie haben keine Berechtigung fuer diese Seite.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-heading">Einstellungen</h1>
        <p className="page-subheading">
          Konfigurieren Sie allgemeine Einstellungen, Benachrichtigungen und Schwellenwerte
        </p>
      </div>

      {message && (
        <div
          className={`mb-6 rounded-2xl p-4 ${
            message.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50/90'
              : 'border border-rose-200 bg-rose-50/90'
          }`}
        >
          <p className={message.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}>
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
