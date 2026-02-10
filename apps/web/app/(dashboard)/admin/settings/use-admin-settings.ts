import { useEffect, useState } from 'react';
import {
  settingsApi,
  ApiError,
  type AlertSettings,
  type ThresholdSettings,
  type GeneralSettings,
} from '../../../lib/api';
import {
  DEFAULT_ALERT_SETTINGS,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_THRESHOLDS,
  type SettingsTab,
} from './constants';

export interface SettingsMessage {
  type: 'success' | 'error';
  text: string;
}

export interface UseAdminSettingsResult {
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;
  alertSettings: AlertSettings;
  setAlertSettings: (settings: AlertSettings) => void;
  thresholds: ThresholdSettings;
  setThresholds: (settings: ThresholdSettings) => void;
  generalSettings: GeneralSettings;
  setGeneralSettings: (settings: GeneralSettings) => void;
  saving: boolean;
  testingSlack: boolean;
  testingTeams: boolean;
  message: SettingsMessage | null;
  setMessage: (message: SettingsMessage | null) => void;
  handleSaveGeneral: () => Promise<void>;
  handleSaveAlerts: () => Promise<void>;
  handleSaveThresholds: () => Promise<void>;
  testSlackWebhook: () => Promise<void>;
  testTeamsWebhook: () => Promise<void>;
}

function getApiMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function useAdminSettings(role: string | undefined): UseAdminSettingsResult {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [thresholds, setThresholds] = useState<ThresholdSettings>(DEFAULT_THRESHOLDS);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [testingTeams, setTestingTeams] = useState(false);
  const [message, setMessage] = useState<SettingsMessage | null>(null);

  useEffect(() => {
    if (role !== 'admin') {
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
        setMessage({
          type: 'error',
          text: getApiMessage(err, 'Fehler beim Laden der Einstellungen'),
        });
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [role]);

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
      setMessage({
        type: 'error',
        text: getApiMessage(err, 'Fehler beim Speichern der allgemeinen Einstellungen'),
      });
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
      setMessage({
        type: 'error',
        text: getApiMessage(err, 'Fehler beim Speichern der Einstellungen'),
      });
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
      setMessage({
        type: 'error',
        text: getApiMessage(err, 'Fehler beim Speichern der Schwellenwerte'),
      });
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
      setMessage({ type: 'success', text: 'Slack Test erfolgreich! Pruefen Sie Ihren Kanal.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: getApiMessage(err, 'Fehler beim Testen der Slack-Verbindung'),
      });
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
      setMessage({ type: 'success', text: 'Teams Test erfolgreich! Pruefen Sie Ihren Kanal.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: getApiMessage(err, 'Fehler beim Testen der Teams-Verbindung'),
      });
    } finally {
      setTestingTeams(false);
    }
  };

  return {
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
    setMessage,
    handleSaveGeneral,
    handleSaveAlerts,
    handleSaveThresholds,
    testSlackWebhook,
    testTeamsWebhook,
  };
}
