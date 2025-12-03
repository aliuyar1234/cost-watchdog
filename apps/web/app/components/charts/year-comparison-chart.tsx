'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { ComparisonData } from '../../lib/api';
import { formatCurrency } from '../../lib/formatting';

interface YearComparisonChartProps {
  data: ComparisonData | null;
  isLoading?: boolean;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

export function YearComparisonChart({ data, isLoading }: YearComparisonChartProps) {
  if (isLoading) {
    return (
      <div className="h-80 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!data || data.months.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-gray-500">
        Keine Daten verfügbar
      </div>
    );
  }

  const chartData = data.months.map((m) => ({
    month: MONTH_NAMES[m.month - 1],
    [String(data.year)]: m.currentYear,
    [String(data.year - 1)]: m.previousYear,
    change: m.change,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="month"
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
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        />
        <Legend />
        <Bar
          dataKey={String(data.year - 1)}
          name={`${data.year - 1}`}
          fill="#94a3b8"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey={String(data.year)}
          name={`${data.year}`}
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
