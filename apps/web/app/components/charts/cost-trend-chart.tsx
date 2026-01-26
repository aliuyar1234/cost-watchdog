'use client';

import { useId } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TrendDataPoint } from '../../lib/api';
import { formatCurrency } from '../../lib/formatting';

interface CostTrendChartProps {
  data: TrendDataPoint[];
  isLoading?: boolean;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

export function CostTrendChart({ data, isLoading }: CostTrendChartProps) {
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

  const chartData = data.map((d) => ({
    ...d,
    label: `${MONTH_NAMES[d.month - 1]} ${d.year}`,
  }));

  const first = chartData[0];
  const last = chartData[chartData.length - 1];
  const firstLabel = first?.label ?? '';
  const lastLabel = last?.label ?? '';
  const firstAmount = first ? formatCurrency(first.amount) : '';
  const lastAmount = last ? formatCurrency(last.amount) : '';
  const delta = last && first ? last.amount - first.amount : 0;
  const direction = delta === 0 ? 'gleich geblieben' : delta > 0 ? 'gestiegen' : 'gesunken';
  const summary = `Kostenentwicklung von ${firstLabel} bis ${lastLabel}: von ${firstAmount} auf ${lastAmount} (${direction}).`;

  return (
    <div role="img" aria-label="Kostenentwicklung" aria-describedby={descriptionId}>
      <p id={descriptionId} className="sr-only">
        {summary}
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
            tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number) => [formatCurrency(value), 'Betrag']}
            labelFormatter={(label) => `Zeitraum: ${label}`}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="#3b82f6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorAmount)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
