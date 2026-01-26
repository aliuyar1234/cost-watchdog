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
        const errorMessage =
          err instanceof ApiError ? err.message : 'Failed to load notification settings';
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
      const errorMessage =
        err instanceof ApiError ? err.message : 'Failed to update notification settings';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notification settings</h1>
        <p className="mt-1 text-gray-600">Control which alerts you receive.</p>
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

      <div className="space-y-6 rounded-lg bg-white p-6 shadow">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          Admin settings control global channels and severity thresholds. Your selections here only
          affect your account.
        </div>

        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h3 className="font-medium text-gray-900">Email alerts</h3>
            <p className="text-sm text-gray-500">Receive anomaly alerts by email.</p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              aria-label="Email alerts enabled"
              checked={settings.emailAlertsEnabled}
              onChange={(e) => setSettings({ ...settings, emailAlertsEnabled: e.target.checked })}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900">Daily digest</h3>
            <p className="text-sm text-gray-500">
              Receive a daily summary email when enabled by admins.
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              aria-label="Daily digest enabled"
              checked={settings.dailyDigestEnabled}
              onChange={(e) => setSettings({ ...settings, dailyDigestEnabled: e.target.checked })}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300"></div>
          </label>
        </div>

        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
