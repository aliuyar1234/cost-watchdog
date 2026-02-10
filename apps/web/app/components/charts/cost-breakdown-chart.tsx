'use client';

import { useId } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { BreakdownItem } from '../../lib/api';
import { formatCurrency } from '../../lib/formatting';
import { getCostTypeLabel } from '../../lib/labels';

interface CostBreakdownChartProps {
  data: BreakdownItem[];
  type: 'costType' | 'location' | 'supplier';
  isLoading?: boolean;
}

const COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
];

export function CostBreakdownChart({ data, type, isLoading }: CostBreakdownChartProps) {
  const descriptionId = useId();

  if (isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-gray-500">
        Keine Daten verfügbar
      </div>
    );
  }

  const getLabel = (item: BreakdownItem): string => {
    switch (type) {
      case 'costType':
        return item.costType ? getCostTypeLabel(item.costType) : 'Unbekannt';
      case 'location':
        return item.locationName || 'Unbekannt';
      case 'supplier':
        return item.supplierName || 'Unbekannt';
      default:
        return 'Unbekannt';
    }
  };

  const chartData = data.map((item) => ({
    name: getLabel(item),
    value: item.amount,
    percentage: item.percentage,
  }));

  const dimensionLabel =
    type === 'costType' ? 'Kostenart' : type === 'location' ? 'Standort' : 'Lieferant';
  const topItems = [...chartData]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((item) => `${item.name} (${item.percentage.toFixed(1)}%)`);
  const summary = `Kostenaufteilung nach ${dimensionLabel}. Top: ${topItems.join(', ')}.`;

  return (
    <div role="img" aria-label="Kostenaufteilung" aria-describedby={descriptionId}>
      <p id={descriptionId} className="sr-only">
        {summary}
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          />
          <Legend
            layout="vertical"
            verticalAlign="middle"
            align="right"
            formatter={(value) => <span className="text-sm text-gray-700">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
