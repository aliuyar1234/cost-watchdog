import { LinkButton } from '../../components/ui/link-button';
import type { AnomalyStats } from '../../lib/api';

interface AnomalyAlertBannerProps {
  stats: AnomalyStats | null;
}

export function AnomalyAlertBanner({ stats }: AnomalyAlertBannerProps) {
  if (!stats || (stats.byStatus['new'] || 0) <= 0) {
    return null;
  }

  return (
    <div className="rounded-lg bg-gradient-to-r from-red-500 to-orange-500 p-4 text-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <svg className="mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <div className="font-semibold">
              {stats.byStatus['new']} offene Anomalie{(stats.byStatus['new'] || 0) !== 1 ? 'n' : ''}{' '}
              erkannt
            </div>
            <div className="text-sm text-white/80">
              {stats.bySeverity['critical'] || 0} kritisch, {stats.bySeverity['warning'] || 0}{' '}
              Warnungen
            </div>
          </div>
        </div>
        <LinkButton
          href="/anomalies"
          variant="outline"
          size="sm"
          className="bg-white text-gray-900 hover:bg-gray-100"
        >
          Jetzt pruefen
        </LinkButton>
      </div>
    </div>
  );
}
