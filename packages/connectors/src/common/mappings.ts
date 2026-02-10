import type { ConsumptionUnit, CostType } from '@cost-watchdog/core';

export const SUPPORTED_COST_TYPES: CostType[] = [
  'electricity',
  'natural_gas',
  'heating_oil',
  'district_heating',
  'district_cooling',
  'water',
  'sewage',
  'waste',
  'maintenance',
  'rent',
  'operating_costs',
  'insurance',
  'telecom_landline',
  'telecom_mobile',
  'telecom_internet',
  'it_licenses',
  'it_cloud',
  'it_hardware',
  'other',
];

function normalizeLookupValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u00df/g, 'ss')
    .replace(/\u00e4/g, 'ae')
    .replace(/\u00f6/g, 'oe')
    .replace(/\u00fc/g, 'ue')
    .replace(/\u00c4/g, 'ae')
    .replace(/\u00d6/g, 'oe')
    .replace(/\u00dc/g, 'ue')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

const COST_TYPE_MAPPINGS: Record<string, CostType> = {
  electricity: 'electricity',
  strom: 'electricity',
  elektrizitaet: 'electricity',
  elektrizitat: 'electricity',
  gas: 'natural_gas',
  erdgas: 'natural_gas',
  natural_gas: 'natural_gas',
  water: 'water',
  wasser: 'water',
  heating: 'district_heating',
  heizung: 'district_heating',
  fernwaerme: 'district_heating',
  heating_oil: 'heating_oil',
  heizoel: 'heating_oil',
  cooling: 'district_cooling',
  kuehlung: 'district_cooling',
  klimatisierung: 'district_cooling',
  waste: 'waste',
  abfall: 'waste',
  entsorgung: 'waste',
  cleaning: 'operating_costs',
  reinigung: 'operating_costs',
  security: 'operating_costs',
  sicherheit: 'operating_costs',
  maintenance: 'maintenance',
  wartung: 'maintenance',
  instandhaltung: 'maintenance',
  rent: 'rent',
  miete: 'rent',
  insurance: 'insurance',
  versicherung: 'insurance',
  telecom: 'telecom_landline',
  telekommunikation: 'telecom_landline',
  telefon: 'telecom_landline',
  internet: 'telecom_internet',
  mobile: 'telecom_mobile',
  mobilfunk: 'telecom_mobile',
  it_services: 'it_cloud',
  it: 'it_cloud',
  it_cloud: 'it_cloud',
  it_licenses: 'it_licenses',
  lizenzen: 'it_licenses',
  it_hardware: 'it_hardware',
  hardware: 'it_hardware',
};

export function mapCostType(type: string | undefined): CostType {
  if (!type) {
    return 'other';
  }

  const normalized = normalizeLookupValue(type);
  return COST_TYPE_MAPPINGS[normalized] || 'other';
}

const CUBIC_METER = `m\u00b3` as ConsumptionUnit;

const UNIT_MAPPINGS: Record<string, ConsumptionUnit> = {
  kwh: 'kWh',
  mwh: 'MWh',
  m3: CUBIC_METER,
  kubikmeter: CUBIC_METER,
  liter: 'liter',
  l: 'liter',
  kg: 'kg',
  t: 'tonne',
  tonne: 'tonne',
  tonnen: 'tonne',
  stueck: 'piece',
  stk: 'piece',
  pcs: 'piece',
  piece: 'piece',
  user: 'user',
  benutzer: 'user',
  gb: 'GB',
};

function normalizeUnitValue(value: string): string {
  return normalizeLookupValue(value).replace(/\u00b3/g, '3');
}

export function mapUnit(unit: string | undefined): ConsumptionUnit | undefined {
  if (!unit) {
    return undefined;
  }

  const normalized = normalizeUnitValue(unit);
  return UNIT_MAPPINGS[normalized];
}
