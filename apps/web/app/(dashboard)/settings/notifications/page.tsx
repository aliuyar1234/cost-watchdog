'use client';

import { useEffect, useState } from 'react';
import { notificationSettingsApi, ApiError, type NotificationSettings } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';

const DEFAULT_SETTINGS: NotificationSettings = {
  emailAlertsEnabled: true,
  dailyDigestEnabled: true,
};

export default function NotificationSettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const response = await notificationSettingsApi.get();
        if (cancelled) return;
        setSettings({
          ...DEFAULT_SETTINGS,
          ...response.settings,
        });
      } catch (err) {
        if (cancelled) return;
        const errorMessage = err instanceof ApiError
          ? err.message
          : 'Failed to load notification settings';
        setMessage({ type: 'error', text: errorMessage });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (user) {
      loadSettings();
    }

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await notificationSettingsApi.update(settings);
      setSettings({
        ...DEFAULT_SETTINGS,
        ...response.settings,
      });
      setMessage({ type: 'success', text: 'Notification settings updated.' });
    } catch (err) {
      const errorMessage = err instanceof ApiError
        ? err.message
        : 'Failed to update notification settings';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notification settings</h1>
        <p className="text-gray-600 mt-1">Control which alerts you receive.</p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <p className={message.type === 'success' ? 'text-green-700' : 'text-red-700'}>{message.text}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          Admin settings control global channels and severity thresholds. Your selections here only affect your account.
        </div>

        <div className="flex items-center justify-between pb-4 border-b">
          <div>
            <h3 className="font-medium text-gray-900">Email alerts</h3>
            <p className="text-sm text-gray-500">Receive anomaly alerts by email.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.emailAlertsEnabled}
              onChange={(e) => setSettings({ ...settings, emailAlertsEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900">Daily digest</h3>
            <p className="text-sm text-gray-500">Receive a daily summary email when enabled by admins.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.dailyDigestEnabled}
              onChange={(e) => setSettings({ ...settings, dailyDigestEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
