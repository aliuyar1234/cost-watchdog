import { Card, CardContent } from '../../components/ui/card';
import type { AnomalyStats } from '../../lib/api';

interface AnomalyStatsCardsProps {
  stats: AnomalyStats | null;
}

export function AnomalyStatsCards({ stats }: AnomalyStatsCardsProps) {
  const newCount = stats?.byStatus['new'] || 0;
  const criticalCount = stats?.bySeverity['critical'] || 0;
  const warningCount = stats?.bySeverity['warning'] || 0;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm font-medium text-gray-500">Offene Anomalien</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{newCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm font-medium text-gray-500">Kritisch</div>
          <div className="mt-2 text-3xl font-bold text-red-600">{criticalCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm font-medium text-gray-500">Warnungen</div>
          <div className="mt-2 text-3xl font-bold text-yellow-600">{warningCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm font-medium text-gray-500">Letzte 24h</div>
          <div className="mt-2 text-3xl font-bold text-blue-600">{stats?.newLast24h || 0}</div>
        </CardContent>
      </Card>
    </div>
  );
}
