import type { AlertSettings } from '../../../lib/api';
import { AlertChannelCard } from './alert-channel-card';
import { AlertLimitsSection } from './alert-limits-section';
import { DailyDigestSection } from './daily-digest-section';
import { SeverityFiltersSection } from './severity-filters-section';

interface AlertSettingsPanelProps {
  alertSettings: AlertSettings;
  onAlertSettingsChange: (settings: AlertSettings) => void;
  onSave: () => Promise<void>;
  onTestSlack: () => Promise<void>;
  onTestTeams: () => Promise<void>;
  saving: boolean;
  testingSlack: boolean;
  testingTeams: boolean;
}

function EmailIcon() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
      <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
}

function SlackIcon() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
      <svg className="h-6 w-6 text-purple-600" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    </div>
  );
}

function TeamsIcon() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
      <svg className="h-6 w-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.625 8.073c-.578-.017-1.158.14-1.658.485l-.003.002a4.677 4.677 0 0 1-.673.387l-.006.002c.174.423.268.884.268 1.365v4.478c0 2.05-1.663 3.714-3.714 3.714H9.554a4.678 4.678 0 0 1-.45-.022 4.684 4.684 0 0 0 4.663 4.266h5.286c2.05 0 3.714-1.664 3.714-3.714v-4.958c0-1.952-.965-3.68-2.442-4.74.104-.404.155-.82.152-1.237a3.287 3.287 0 0 0-.852-.028z" />
        <path d="M14.839 5.507a3.714 3.714 0 1 0 0 7.428 3.714 3.714 0 0 0 0-7.428zm0 5.571a1.857 1.857 0 1 1 0-3.714 1.857 1.857 0 0 1 0 3.714z" />
        <path d="M9.554 1.25A4.643 4.643 0 0 0 4.911 5.89v4.957c0 2.05 1.663 3.714 3.714 3.714h5.286a3.714 3.714 0 0 0 3.714-3.714V5.89a4.643 4.643 0 0 0-4.643-4.64H9.554zm5.285 11.536H8.625a1.857 1.857 0 0 1-1.857-1.857V5.89a2.786 2.786 0 0 1 2.786-2.784h3.428a2.786 2.786 0 0 1 2.786 2.784v5.039a1.857 1.857 0 0 1-1.857 1.857h-.072z" />
      </svg>
    </div>
  );
}

export function AlertSettingsPanel({
  alertSettings,
  onAlertSettingsChange,
  onSave,
  onTestSlack,
  onTestTeams,
  saving,
  testingSlack,
  testingTeams,
}: AlertSettingsPanelProps) {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h2 className="mb-6 text-lg font-semibold">Benachrichtigungskanaele</h2>

      <AlertChannelCard
        title="E-Mail"
        description="Benachrichtigungen per E-Mail erhalten"
        icon={<EmailIcon />}
        enabled={alertSettings.emailEnabled}
        onEnabledChange={(emailEnabled) =>
          onAlertSettingsChange({ ...alertSettings, emailEnabled })
        }
      />

      <AlertChannelCard
        title="Slack"
        description="Benachrichtigungen an Slack-Kanal senden"
        icon={<SlackIcon />}
        enabled={alertSettings.slackEnabled}
        onEnabledChange={(slackEnabled) =>
          onAlertSettingsChange({ ...alertSettings, slackEnabled })
        }
        webhookUrl={alertSettings.slackWebhookUrl}
        onWebhookUrlChange={(slackWebhookUrl) =>
          onAlertSettingsChange({ ...alertSettings, slackWebhookUrl })
        }
        webhookPlaceholder="https://hooks.slack.com/services/..."
        onTest={onTestSlack}
        testing={testingSlack}
        testButtonClassName="rounded-lg bg-purple-100 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50"
      />

      <AlertChannelCard
        title="Microsoft Teams"
        description="Benachrichtigungen an Teams-Kanal senden"
        icon={<TeamsIcon />}
        enabled={alertSettings.teamsEnabled}
        onEnabledChange={(teamsEnabled) =>
          onAlertSettingsChange({ ...alertSettings, teamsEnabled })
        }
        webhookUrl={alertSettings.teamsWebhookUrl}
        onWebhookUrlChange={(teamsWebhookUrl) =>
          onAlertSettingsChange({ ...alertSettings, teamsWebhookUrl })
        }
        webhookPlaceholder="https://outlook.office.com/webhook/..."
        onTest={onTestTeams}
        testing={testingTeams}
      />

      <SeverityFiltersSection
        alertSettings={alertSettings}
        onAlertSettingsChange={onAlertSettingsChange}
      />

      <AlertLimitsSection
        alertSettings={alertSettings}
        onAlertSettingsChange={onAlertSettingsChange}
      />

      <DailyDigestSection
        alertSettings={alertSettings}
        onAlertSettingsChange={onAlertSettingsChange}
      />

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
