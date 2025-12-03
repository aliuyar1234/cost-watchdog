import type { AnomalyCheck, CheckResult, CostRecordToCheck, CheckContext } from '../types';

/**
 * Budget Exceeded Check
 *
 * Detects when costs exceed the configured budget for a cost type.
 * Can check both monthly budgets and yearly budget pro-rated to month.
 */
export const budgetExceededCheck: AnomalyCheck = {
  id: 'budget_exceeded',
  name: 'Budget überschritten',
  description: 'Erkennt Budgetüberschreitungen',
  applicableCostTypes: 'all',

  async check(record: CostRecordToCheck, context: CheckContext): Promise<CheckResult> {
    // Skip if no budget is defined
    if (!context.budget) {
      return { triggered: false };
    }

    const budget = context.budget;
    const threshold = context.settings.alertThresholds.budgetExceededPercent;

    // Determine the budget amount to compare against
    let budgetAmount: number;
    let budgetPeriod: string;

    if (budget.month != null) {
      // Monthly budget
      budgetAmount = budget.amount;
      budgetPeriod = 'monatlich';
    } else {
      // Yearly budget - calculate monthly average
      budgetAmount = budget.amount / 12;
      budgetPeriod = 'jährlich (pro Monat)';
    }

    // Calculate cumulative spending for the period
    // Get all records for the same cost type in the same month/year
    const recordMonth = record.periodStart.getMonth();
    const recordYear = record.periodStart.getFullYear();

    const monthlyTotal = context.historicalRecords
      .filter(r =>
        r.costType === record.costType &&
        r.periodStart.getMonth() === recordMonth &&
        r.periodStart.getFullYear() === recordYear
      )
      .reduce((sum, r) => sum + r.amount, 0) + record.amount;

    // Calculate how much over budget
    const overBudget = monthlyTotal - budgetAmount;
    const overBudgetPercent = (overBudget / budgetAmount) * 100;

    if (overBudgetPercent > threshold) {
      const severity = overBudgetPercent > threshold * 2 ? 'critical' : 'warning';

      return {
        triggered: true,
        severity,
        message: `Budget um €${overBudget.toFixed(2)} überschritten (+${overBudgetPercent.toFixed(1)}%)`,
        details: {
          budgetAmount,
          budgetPeriod,
          budgetId: budget.id,
          actualAmount: monthlyTotal,
          currentRecordAmount: record.amount,
          overBudgetAmount: overBudget,
          overBudgetPercent,
          threshold,
          month: recordMonth + 1, // 1-indexed for display
          year: recordYear,
          method: 'budget_comparison',
        },
      };
    }

    // Also warn if approaching budget (within 90-100% of budget)
    const budgetUsagePercent = (monthlyTotal / budgetAmount) * 100;
    if (budgetUsagePercent >= 90 && budgetUsagePercent <= 100) {
      return {
        triggered: true,
        severity: 'info',
        message: `${budgetUsagePercent.toFixed(1)}% des Budgets verbraucht`,
        details: {
          budgetAmount,
          budgetPeriod,
          budgetId: budget.id,
          actualAmount: monthlyTotal,
          currentRecordAmount: record.amount,
          budgetUsagePercent,
          remainingBudget: budgetAmount - monthlyTotal,
          month: recordMonth + 1,
          year: recordYear,
          method: 'budget_warning',
        },
      };
    }

    return { triggered: false };
  },
};
