import { describe, it, expect } from 'vitest';

// Unit tests for anomaly detection logic

describe('Anomaly Engine', () => {
  describe('YoY Deviation Check', () => {
    it('should detect significant YoY increase', () => {
      const currentAmount = 12000;
      const previousYearAmount = 10000;
      const threshold = 0.15; // 15%

      const deviation = (currentAmount - previousYearAmount) / previousYearAmount;
      const isAnomaly = Math.abs(deviation) > threshold;

      expect(deviation).toBeCloseTo(0.2); // 20% increase
      expect(isAnomaly).toBe(true);
    });

    it('should not flag normal YoY variation', () => {
      const currentAmount = 10500;
      const previousYearAmount = 10000;
      const threshold = 0.15;

      const deviation = (currentAmount - previousYearAmount) / previousYearAmount;
      const isAnomaly = Math.abs(deviation) > threshold;

      expect(deviation).toBeCloseTo(0.05); // 5% increase
      expect(isAnomaly).toBe(false);
    });
  });

  describe('MoM Deviation Check', () => {
    it('should detect significant MoM increase', () => {
      const currentAmount = 5000;
      const previousMonthAmount = 3000;
      const threshold = 0.25; // 25%

      const deviation = (currentAmount - previousMonthAmount) / previousMonthAmount;
      const isAnomaly = Math.abs(deviation) > threshold;

      expect(deviation).toBeCloseTo(0.667); // ~67% increase
      expect(isAnomaly).toBe(true);
    });
  });

  describe('Price Per Unit Spike', () => {
    it('should detect price spike', () => {
      const currentPricePerUnit = 0.45;
      const averagePricePerUnit = 0.30;
      const threshold = 0.20; // 20%

      const deviation = (currentPricePerUnit - averagePricePerUnit) / averagePricePerUnit;
      const isAnomaly = Math.abs(deviation) > threshold;

      expect(deviation).toBeCloseTo(0.5); // 50% increase
      expect(isAnomaly).toBe(true);
    });
  });

  describe('Statistical Outlier Detection', () => {
    it('should detect outlier using z-score', () => {
      const values = [100, 105, 98, 102, 101, 99, 500]; // 500 is outlier
      const mean = values.slice(0, -1).reduce((a, b) => a + b, 0) / (values.length - 1);
      const variance =
        values.slice(0, -1).reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        (values.length - 2);
      const stdDev = Math.sqrt(variance);

      const lastValue = values[values.length - 1];
      const zScore = (lastValue - mean) / stdDev;

      expect(zScore).toBeGreaterThan(3); // Beyond 3 standard deviations
    });
  });

  describe('Severity Determination', () => {
    it('should return critical for high deviation', () => {
      const severity = determineSeverity(0.50); // 50% deviation
      expect(severity).toBe('critical');
    });

    it('should return warning for medium deviation', () => {
      const severity = determineSeverity(0.25); // 25% deviation
      expect(severity).toBe('warning');
    });

    it('should return info for low deviation', () => {
      const severity = determineSeverity(0.10); // 10% deviation
      expect(severity).toBe('info');
    });
  });
});

function determineSeverity(deviation: number): 'info' | 'warning' | 'critical' {
  const absDeviation = Math.abs(deviation);
  if (absDeviation >= 0.40) return 'critical';
  if (absDeviation >= 0.20) return 'warning';
  return 'info';
}
