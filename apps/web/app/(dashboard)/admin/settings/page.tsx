'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { settingsApi, ApiError, type AlertSettings, type ThresholdSettings, type GeneralSettings } from '../../../lib/api';

const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  emailEnabled: true,
  slackEnabled: false,
  teamsEnabled: false,
  slackWebhookUrl: '',
  teamsWebhookUrl: '',
  notifyOnCritical: true,
  notifyOnWarning: true,
  notifyOnInfo: false,
  dailyDigestEnabled: false,
  dailyDigestTime: '08:00',
  maxAlertsPerDay: 50,
};

const DEFAULT_THRESHOLDS: ThresholdSettings = {
  yoyThreshold: 20,
  momThreshold: 30,
  pricePerUnitThreshold: 10,
  budgetThreshold: 10,
  minHistoricalMonths: 12,
};

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  timezone: 'UTC',
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'alerts' | 'thresholds' | 'api'>('general');
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [thresholds, setThresholds] = useState<ThresholdSettings>(DEFAULT_THRESHOLDS);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [testingTeams, setTestingTeams] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user?.role !== 'admin') {
      return;
    }

    let cancelled = false;

    const loadSettings = async () => {
      try {
        const data = await settingsApi.get();
        if (cancelled) {
          return;
        }

        setAlertSettings({
          ...DEFAULT_ALERT_SETTINGS,
          ...(data.alerts ?? {}),
        });
        setThresholds({
          ...DEFAULT_THRESHOLDS,
          ...(data.thresholds ?? {}),
        });
        setGeneralSettings({
          ...DEFAULT_GENERAL_SETTINGS,
          ...(data.general ?? {}),
        });
      } catch (err) {
        if (cancelled) {
          return;
        }
        const errorMessage = err instanceof ApiError
          ? err.message
          : 'Fehler beim Laden der Einstellungen';
        setMessage({ type: 'error', text: errorMessage });
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  const handleSaveGeneral = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await settingsApi.updateGeneral(generalSettings);
      setGeneralSettings({
        ...DEFAULT_GENERAL_SETTINGS,
        ...response.general,
      });
      setMessage({ type: 'success', text: 'Allgemeine Einstellungen gespeichert!' });
    } catch (err) {
      const errorMessage = err instanceof ApiError
        ? err.message
        : 'Fehler beim Speichern der allgemeinen Einstellungen';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAlerts = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await settingsApi.updateAlerts(alertSettings);
      setAlertSettings({
        ...DEFAULT_ALERT_SETTINGS,
        ...response.alerts,
      });
      setMessage({ type: 'success', text: 'Benachrichtigungseinstellungen gespeichert!' });
    } catch (err) {
      const errorMessage = err instanceof ApiError
        ? err.message
        : 'Fehler beim Speichern der Einstellungen';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveThresholds = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await settingsApi.updateThresholds(thresholds);
      setThresholds({
        ...DEFAULT_THRESHOLDS,
        ...response.thresholds,
      });
      setMessage({ type: 'success', text: 'Schwellenwerte gespeichert!' });
    } catch (err) {
      const errorMessage = err instanceof ApiError
        ? err.message
        : 'Fehler beim Speichern der Schwellenwerte';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  const testSlackWebhook = async () => {
    if (!alertSettings.slackWebhookUrl) {
      setMessage({ type: 'error', text: 'Bitte geben Sie eine Slack Webhook URL ein' });
      return;
    }

    setTestingSlack(true);
    setMessage(null);

    try {
      await settingsApi.testSlackWebhook(alertSettings.slackWebhookUrl);
      setMessage({ type: 'success', text: 'Slack Test erfolgreich! Prüfen Sie Ihren Kanal.' });
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage({ type: 'error', text: err.message });
      } else {
        setMessage({ type: 'error', text: 'Fehler beim Testen der Slack-Verbindung' });
      }
    } finally {
      setTestingSlack(false);
    }
  };

  const testTeamsWebhook = async () => {
    if (!alertSettings.teamsWebhookUrl) {
      setMessage({ type: 'error', text: 'Bitte geben Sie eine Teams Webhook URL ein' });
      return;
    }

    setTestingTeams(true);
    setMessage(null);

    try {
      await settingsApi.testTeamsWebhook(alertSettings.teamsWebhookUrl);
      setMessage({ type: 'success', text: 'Teams Test erfolgreich! Prüfen Sie Ihren Kanal.' });
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage({ type: 'error', text: err.message });
      } else {
        setMessage({ type: 'error', text: 'Fehler beim Testen der Teams-Verbindung' });
      }
    } finally {
      setTestingTeams(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Sie haben keine Berechtigung für diese Seite.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>
        <p className="text-gray-600 mt-1">Konfigurieren Sie allgemeine Einstellungen, Benachrichtigungen und Schwellenwerte</p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <p className={message.type === 'success' ? 'text-green-700' : 'text-red-700'}>{message.text}</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-8">
          {[
            { id: 'general', label: 'Allgemein' },
            { id: 'alerts', label: 'Benachrichtigungen' },
            { id: 'thresholds', label: 'Schwellenwerte' },
            { id: 'api', label: 'API-Schlüssel' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'general' | 'alerts' | 'thresholds' | 'api')}
              className={`pb-4 text-sm font-medium border-b-2 -mb-px ${
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

      {/* General Settings */}
      {activeTab === 'general' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-6">Allgemeine Einstellungen</h2>
          <p className="text-gray-600 mb-6">
            Steuern Sie die Zeitzone der Anwendung (z. B. fuer die taegliche Zusammenfassung).
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Zeitzone
              </label>
              <input
                type="text"
                value={generalSettings.timezone}
                onChange={(e) => setGeneralSettings({ ...generalSettings, timezone: e.target.value })}
                placeholder="Europe/Berlin"
                className="border rounded-lg px-3 py-2 w-full"
              />
              <p className="text-sm text-gray-500 mt-1">
                Verwenden Sie eine IANA-Zeitzone wie Europe/Berlin oder America/New_York.
              </p>
            </div>
          </div>

          <div className="flex justify-end mt-8">
            <button
              onClick={handleSaveGeneral}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {/* Alert Settings */}
      {activeTab === 'alerts' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-6">Benachrichtigungskanäle</h2>

          {/* Email */}
          <div className="mb-6 pb-6 border-b">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium">E-Mail</h3>
                  <p className="text-sm text-gray-500">Benachrichtigungen per E-Mail erhalten</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertSettings.emailEnabled}
                  onChange={(e) => setAlertSettings({ ...alertSettings, emailEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* Slack */}
          <div className="mb-6 pb-6 border-b">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium">Slack</h3>
                  <p className="text-sm text-gray-500">Benachrichtigungen an Slack-Kanal senden</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertSettings.slackEnabled}
                  onChange={(e) => setAlertSettings({ ...alertSettings, slackEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            {alertSettings.slackEnabled && (
              <div className="ml-13">
                <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={alertSettings.slackWebhookUrl}
                    onChange={(e) => setAlertSettings({ ...alertSettings, slackWebhookUrl: e.target.value })}
                    placeholder="https://hooks.slack.com/services/..."
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={testSlackWebhook}
                    disabled={testingSlack}
                    className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm font-medium disabled:opacity-50"
                  >
                    {testingSlack ? 'Teste...' : 'Testen'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Teams */}
          <div className="mb-6 pb-6 border-b">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.625 8.073c-.578-.017-1.158.14-1.658.485l-.003.002a4.677 4.677 0 0 1-.673.387l-.006.002c.174.423.268.884.268 1.365v4.478c0 2.05-1.663 3.714-3.714 3.714H9.554a4.678 4.678 0 0 1-.45-.022 4.684 4.684 0 0 0 4.663 4.266h5.286c2.05 0 3.714-1.664 3.714-3.714v-4.958c0-1.952-.965-3.68-2.442-4.74.104-.404.155-.82.152-1.237a3.287 3.287 0 0 0-.852-.028z"/>
                    <path d="M14.839 5.507a3.714 3.714 0 1 0 0 7.428 3.714 3.714 0 0 0 0-7.428zm0 5.571a1.857 1.857 0 1 1 0-3.714 1.857 1.857 0 0 1 0 3.714z"/>
                    <path d="M9.554 1.25A4.643 4.643 0 0 0 4.911 5.89v4.957c0 2.05 1.663 3.714 3.714 3.714h5.286a3.714 3.714 0 0 0 3.714-3.714V5.89a4.643 4.643 0 0 0-4.643-4.64H9.554zm5.285 11.536H8.625a1.857 1.857 0 0 1-1.857-1.857V5.89a2.786 2.786 0 0 1 2.786-2.784h3.428a2.786 2.786 0 0 1 2.786 2.784v5.039a1.857 1.857 0 0 1-1.857 1.857h-.072z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium">Microsoft Teams</h3>
                  <p className="text-sm text-gray-500">Benachrichtigungen an Teams-Kanal senden</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertSettings.teamsEnabled}
                  onChange={(e) => setAlertSettings({ ...alertSettings, teamsEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            {alertSettings.teamsEnabled && (
              <div className="ml-13">
                <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={alertSettings.teamsWebhookUrl}
                    onChange={(e) => setAlertSettings({ ...alertSettings, teamsWebhookUrl: e.target.value })}
                    placeholder="https://outlook.office.com/webhook/..."
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={testTeamsWebhook}
                    disabled={testingTeams}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium disabled:opacity-50"
                  >
                    {testingTeams ? 'Teste...' : 'Testen'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Severity Settings */}
          <h2 className="text-lg font-semibold mb-4">Schweregrad-Filter</h2>
          <div className="space-y-3 mb-6">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={alertSettings.notifyOnCritical}
                onChange={(e) => setAlertSettings({ ...alertSettings, notifyOnCritical: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                Kritisch
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={alertSettings.notifyOnWarning}
                onChange={(e) => setAlertSettings({ ...alertSettings, notifyOnWarning: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
                Warnung
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={alertSettings.notifyOnInfo}
                onChange={(e) => setAlertSettings({ ...alertSettings, notifyOnInfo: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                Info
              </span>
            </label>
          </div>

          {/* Alert Limits */}
          <h2 className="text-lg font-semibold mb-4">Alert limits</h2>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max alerts per day
            </label>
            <input
              type="number"
              min={1}
              max={1000}
              value={alertSettings.maxAlertsPerDay}
              onChange={(e) => setAlertSettings({ ...alertSettings, maxAlertsPerDay: Number(e.target.value) })}
              className="border rounded-lg px-3 py-2 w-32"
            />
            <p className="text-sm text-gray-500 mt-1">
              Limits total alerts sent across all channels per day.
            </p>
          </div>

          {/* Daily Digest */}
          <h2 className="text-lg font-semibold mb-4">Tägliche Zusammenfassung</h2>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-600">Tägliche E-Mail-Zusammenfassung aktivieren</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={alertSettings.dailyDigestEnabled}
                onChange={(e) => setAlertSettings({ ...alertSettings, dailyDigestEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          {alertSettings.dailyDigestEnabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Versandzeit</label>
              <input
                type="time"
                value={alertSettings.dailyDigestTime}
                onChange={(e) => setAlertSettings({ ...alertSettings, dailyDigestTime: e.target.value })}
                className="border rounded-lg px-3 py-2"
              />
            </div>
          )}

          <div className="flex justify-end mt-8">
            <button
              onClick={handleSaveAlerts}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {/* Threshold Settings */}
      {activeTab === 'thresholds' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-6">Anomalie-Schwellenwerte</h2>
          <p className="text-gray-600 mb-6">
            Passen Sie die Schwellenwerte an, ab denen Kostenabweichungen als Anomalien erkannt werden.
          </p>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Year-over-Year Abweichung (%)
              </label>
              <input
                type="number"
                value={thresholds.yoyThreshold}
                onChange={(e) => setThresholds({ ...thresholds, yoyThreshold: Number(e.target.value) })}
                className="border rounded-lg px-3 py-2 w-32"
                min={1}
                max={100}
              />
              <p className="text-sm text-gray-500 mt-1">
                Anomalie bei mehr als {thresholds.yoyThreshold}% Abweichung zum Vorjahr
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Month-over-Month Abweichung (%)
              </label>
              <input
                type="number"
                value={thresholds.momThreshold}
                onChange={(e) => setThresholds({ ...thresholds, momThreshold: Number(e.target.value) })}
                className="border rounded-lg px-3 py-2 w-32"
                min={1}
                max={100}
              />
              <p className="text-sm text-gray-500 mt-1">
                Anomalie bei mehr als {thresholds.momThreshold}% Abweichung zum Vormonat
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preis pro Einheit Abweichung (%)
              </label>
              <input
                type="number"
                value={thresholds.pricePerUnitThreshold}
                onChange={(e) => setThresholds({ ...thresholds, pricePerUnitThreshold: Number(e.target.value) })}
                className="border rounded-lg px-3 py-2 w-32"
                min={1}
                max={100}
              />
              <p className="text-sm text-gray-500 mt-1">
                Anomalie bei mehr als {thresholds.pricePerUnitThreshold}% Preisabweichung
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Budget-Überschreitung (%)
              </label>
              <input
                type="number"
                value={thresholds.budgetThreshold}
                onChange={(e) => setThresholds({ ...thresholds, budgetThreshold: Number(e.target.value) })}
                className="border rounded-lg px-3 py-2 w-32"
                min={1}
                max={100}
              />
              <p className="text-sm text-gray-500 mt-1">
                Anomalie bei mehr als {thresholds.budgetThreshold}% über Budget
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mindest-Historienmonate
              </label>
              <input
                type="number"
                value={thresholds.minHistoricalMonths}
                onChange={(e) => setThresholds({ ...thresholds, minHistoricalMonths: Number(e.target.value) })}
                className="border rounded-lg px-3 py-2 w-32"
                min={1}
                max={36}
              />
              <p className="text-sm text-gray-500 mt-1">
                Mindestens {thresholds.minHistoricalMonths} Monate Daten für YoY-Vergleich
              </p>
            </div>
          </div>

          <div className="flex justify-end mt-8">
            <button
              onClick={handleSaveThresholds}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'api' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-6">API-Schlüssel</h2>
          <p className="text-gray-600 mb-6">
            Erstellen Sie API-Schlüssel für externe Integrationen und automatisierte Datenimporte.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-blue-700 text-sm">
              API-Schlüssel können unter <strong>Benutzerverwaltung &gt; API-Schlüssel</strong> verwaltet werden.
              Dort können Sie neue Schlüssel erstellen, bestehende anzeigen und widerrufen.
            </p>
          </div>

          <a
            href="/admin/api-keys"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            API-Schlüssel verwalten
          </a>
        </div>
      )}
    </div>
  );
}
