import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { CostBreakdownChart } from '../../components/charts/cost-breakdown-chart';
import { CostTrendChart } from '../../components/charts/cost-trend-chart';
import { YearComparisonChart } from '../../components/charts/year-comparison-chart';
import type { BreakdownItem, ComparisonData, TrendDataPoint } from '../../lib/api';

interface DashboardChartsProps {
  trendData: TrendDataPoint[];
  costTypeData: BreakdownItem[];
  comparisonData: ComparisonData | null;
  isLoading: boolean;
}

export function DashboardCharts({
  trendData,
  costTypeData,
  comparisonData,
  isLoading,
}: DashboardChartsProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kostenentwicklung (12 Monate)</CardTitle>
          </CardHeader>
          <CardContent>
            <CostTrendChart data={trendData} isLoading={isLoading} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Kosten nach Kategorie</CardTitle>
          </CardHeader>
          <CardContent>
            <CostBreakdownChart data={costTypeData} type="costType" isLoading={isLoading} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Jahresvergleich {comparisonData?.year} vs.{' '}
            {(comparisonData?.year || new Date().getFullYear()) - 1}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <YearComparisonChart data={comparisonData} isLoading={isLoading} />
        </CardContent>
      </Card>
    </>
  );
}
