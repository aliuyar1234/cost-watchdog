import { describe, expect, it } from 'vitest';
import { csvConnector } from '../src/csv/index.ts';

describe('connectors package smoke tests', () => {
  it('validates required CSV column mappings', () => {
    const invalid = csvConnector.validateConfig({});
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain('columnMappings is required');

    const valid = csvConnector.validateConfig({
      columnMappings: {
        periodStart: 'Period Start',
        amount: 'Amount',
      },
    });
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);
  });

  it('returns a structured failure when no buffer is provided', async () => {
    const result = await csvConnector.extract({
      filename: 'sample.csv',
      mimeType: 'text/csv',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No file buffer provided');
    expect(result.records).toHaveLength(0);
  });
});
