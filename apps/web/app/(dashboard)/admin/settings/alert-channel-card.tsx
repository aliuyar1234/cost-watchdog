import type { ReactNode } from 'react';

interface AlertChannelCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  webhookUrl?: string;
  onWebhookUrlChange?: (value: string) => void;
  webhookPlaceholder?: string;
  onTest?: () => Promise<void>;
  testing?: boolean;
  testButtonClassName?: string;
  borderBottom?: boolean;
}

export function AlertChannelCard({
  title,
  description,
  icon,
  enabled,
  onEnabledChange,
  webhookUrl,
  onWebhookUrlChange,
  webhookPlaceholder,
  onTest,
  testing = false,
  testButtonClassName = 'rounded-lg bg-blue-100 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200 disabled:opacity-50',
  borderBottom = true,
}: AlertChannelCardProps) {
  return (
    <div className={borderBottom ? 'mb-6 border-b pb-6' : 'mb-6'}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h3 className="font-medium">{title}</h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            className="peer sr-only"
          />
          <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300" />
        </label>
      </div>

      {enabled && onWebhookUrlChange && webhookUrl !== undefined && (
        <div className="ml-[52px]">
          <label className="mb-1 block text-sm font-medium text-gray-700">Webhook URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={webhookUrl}
              onChange={(event) => onWebhookUrlChange(event.target.value)}
              placeholder={webhookPlaceholder}
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            {onTest && (
              <button
                onClick={() => void onTest()}
                disabled={testing}
                className={testButtonClassName}
              >
                {testing ? 'Teste...' : 'Testen'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
