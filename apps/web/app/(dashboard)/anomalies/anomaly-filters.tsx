import { Card, CardContent } from '../../components/ui/card';
import type { SeverityFilter, StatusFilter } from './types';

interface AnomalyFiltersProps {
  statusFilter: StatusFilter;
  severityFilter: SeverityFilter;
  onStatusChange: (value: StatusFilter) => void;
  onSeverityChange: (value: SeverityFilter) => void;
}

export function AnomalyFilters({
  statusFilter,
  severityFilter,
  onStatusChange,
  onSeverityChange,
}: AnomalyFiltersProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
              className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="all">Alle</option>
              <option value="new">Neu</option>
              <option value="acknowledged">Bestaetigt</option>
              <option value="resolved">Geloest</option>
              <option value="false_positive">Fehlalarm</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Prioritaet</label>
            <select
              value={severityFilter}
              onChange={(event) => onSeverityChange(event.target.value as SeverityFilter)}
              className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="all">Alle</option>
              <option value="critical">Kritisch</option>
              <option value="warning">Warnung</option>
              <option value="info">Info</option>
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
