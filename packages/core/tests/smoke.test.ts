import { describe, expect, it } from 'vitest';
import { createAnomalyEngine, DEFAULT_ANOMALY_SETTINGS, getAllCheckIds } from '../src/index.ts';

describe('core package smoke tests', () => {
  it('creates an engine with default checks enabled', () => {
    const engine = createAnomalyEngine();
    const settings = engine.getSettings();

    expect(settings.enabledChecks).toEqual(DEFAULT_ANOMALY_SETTINGS.enabledChecks);
    expect(getAllCheckIds()).toEqual(expect.arrayContaining(settings.enabledChecks));
  });

  it('merges nested alert thresholds when custom settings are provided', () => {
    const engine = createAnomalyEngine({
      alertThresholds: {
        yoyDeviationPercent: 15,
      },
    });
    const settings = engine.getSettings();

    expect(settings.alertThresholds.yoyDeviationPercent).toBe(15);
    expect(settings.alertThresholds.momDeviationPercent).toBe(
      DEFAULT_ANOMALY_SETTINGS.alertThresholds.momDeviationPercent,
    );
  });
});
