export type AnomalyTypeLabelVariant = 'default' | 'compact';

const ANOMALY_TYPE_LABELS: Record<string, Record<AnomalyTypeLabelVariant, string>> = {
  yoy_deviation: {
    default: 'Jahresvergleich (YoY)',
    compact: 'Jahresvergleich',
  },
  mom_deviation: {
    default: 'Monatsvergleich (MoM)',
    compact: 'Monatsvergleich',
  },
  price_per_unit_spike: {
    default: 'Preis pro Einheit',
    compact: 'Preis pro Einheit',
  },
  statistical_outlier: {
    default: 'Statistischer Ausrei\u00dfer',
    compact: 'Statistischer Ausrei\u00dfer',
  },
  duplicate_detection: {
    default: 'M\u00f6gliches Duplikat',
    compact: 'M\u00f6gliches Duplikat',
  },
  missing_period: {
    default: 'Fehlende Periode',
    compact: 'Fehlende Periode',
  },
  seasonal_anomaly: {
    default: 'Saisonale Anomalie',
    compact: 'Saisonale Anomalie',
  },
  budget_exceeded: {
    default: 'Budget \u00fcberschritten',
    compact: 'Budget \u00fcberschritten',
  },
};

export const COST_TYPE_LABELS: Record<string, string> = {
  electricity: 'Strom',
  natural_gas: 'Erdgas',
  water: 'Wasser',
  heating_oil: 'Heiz\u00f6l',
  district_heating: 'Fernw\u00e4rme',
  district_cooling: 'Fernk\u00e4lte',
  sewage: 'Abwasser',
  waste: 'Abfall',
  rent: 'Miete',
  operating_costs: 'Nebenkosten',
  insurance: 'Versicherung',
  maintenance: 'Wartung',
  it_licenses: 'IT-Lizenzen',
  it_cloud: 'Cloud-Services',
  it_hardware: 'IT-Hardware',
  telecom_internet: 'Internet',
  telecom_mobile: 'Mobilfunk',
  telecom_landline: 'Festnetz',
  fuel_diesel: 'Diesel',
  fuel_petrol: 'Benzin',
  supplier_recurring: 'Wiederkehrend',
  other: 'Sonstige',
};

export function getAnomalyTypeLabel(
  anomalyType: string,
  variant: AnomalyTypeLabelVariant = 'compact',
): string {
  return ANOMALY_TYPE_LABELS[anomalyType]?.[variant] || anomalyType;
}

export function getCostTypeLabel(costType: string): string {
  return COST_TYPE_LABELS[costType] || costType;
}
