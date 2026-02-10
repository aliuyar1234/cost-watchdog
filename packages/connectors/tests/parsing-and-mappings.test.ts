import { describe, expect, it } from 'vitest';
import { mapCostType, mapUnit } from '../src/common/mappings.js';
import {
  parseDateString,
  parseDateValue,
  parseNumberString,
  parseNumberValue,
} from '../src/common/value-parsers.js';
import { parseCsvContent } from '../src/csv/parser.js';

describe('connector common mappings', () => {
  it('maps localized cost type values to canonical enum values', () => {
    expect(mapCostType('Strom')).toBe('electricity');
    expect(mapCostType('Elektrizitaet')).toBe('electricity');
    expect(mapCostType('Fernwaerme')).toBe('district_heating');
    expect(mapCostType('unknown')).toBe('other');
  });

  it('maps common unit aliases', () => {
    expect(mapUnit('kwh')).toBe('kWh');
    expect(mapUnit('m3')).toBe('m\u00b3');
    expect(mapUnit('Stk')).toBe('piece');
    expect(mapUnit(undefined)).toBeUndefined();
  });
});

describe('connector common value parsers', () => {
  it('parses numbers with decimal and thousands separators', () => {
    expect(parseNumberString('1.234,56', ',')).toBe(1234.56);
    expect(parseNumberString('1,234.56', '.')).toBe(1234.56);
    expect(parseNumberString('EUR 99,50')).toBe(99.5);
    expect(parseNumberValue(10.5)).toBe(10.5);
  });

  it('parses dates from string and excel serial values', () => {
    const parsedFromString = parseDateString('31.12.2025');
    expect(parsedFromString?.getFullYear()).toBe(2025);
    expect(parsedFromString?.getMonth()).toBe(11);
    expect(parsedFromString?.getDate()).toBe(31);
    expect(parseDateString('not-a-date')).toBeNull();

    // Excel serial date for 2020-01-01
    const parsed = parseDateValue(43831);
    expect(parsed?.getUTCFullYear()).toBe(2020);
  });
});

describe('csv parser', () => {
  it('handles quoted multiline cell content', () => {
    const content = 'date;amount;note\n"01.01.2025";"10,5";"line1\nline2"';
    const rows = parseCsvContent(content, ';', '"');

    expect(rows).toHaveLength(2);
    expect(rows[1]?.[2]).toBe('line1\nline2');
  });
});
