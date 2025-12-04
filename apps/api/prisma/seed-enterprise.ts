import { PrismaClient, Prisma } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// Argon2 hash function
async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

// Random helpers
const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const randomInt = (min: number, max: number) => Math.floor(randomBetween(min, max + 1));
const randomChoice = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

// Realistic German company data
const COMPANY = {
  name: 'TechFlow Industries GmbH',
  legalName: 'TechFlow Industries GmbH & Co. KG',
  registrationNumber: 'HRB 123456',
  taxId: 'DE298765432',
  industry: 'Manufacturing & Technology',
  employeeCount: 2850,
};

// Realistic German locations
const LOCATIONS_DATA = [
  { name: 'Hauptverwaltung Frankfurt', code: 'FRA-HQ', city: 'Frankfurt am Main', postalCode: '60311', street: 'Mainzer Landstraße 50', type: 'office', grossFloorArea: 12500, ownership: 'leased' },
  { name: 'Produktionswerk Wolfsburg', code: 'WOB-P1', city: 'Wolfsburg', postalCode: '38440', street: 'Industriestraße 100', type: 'production', grossFloorArea: 45000, ownership: 'owned' },
  { name: 'Produktionswerk Stuttgart', code: 'STR-P2', city: 'Stuttgart', postalCode: '70469', street: 'Porschestraße 15', type: 'production', grossFloorArea: 38000, ownership: 'owned' },
  { name: 'Logistikzentrum Hamburg', code: 'HAM-LOG', city: 'Hamburg', postalCode: '20457', street: 'Am Sandtorkai 77', type: 'warehouse', grossFloorArea: 65000, ownership: 'leased' },
  { name: 'Logistikzentrum München', code: 'MUC-LOG', city: 'München', postalCode: '85748', street: 'Logistikring 8', type: 'warehouse', grossFloorArea: 42000, ownership: 'leased' },
  { name: 'Vertriebsbüro Berlin', code: 'BER-SALES', city: 'Berlin', postalCode: '10117', street: 'Friedrichstraße 191', type: 'office', grossFloorArea: 3200, ownership: 'leased' },
  { name: 'Vertriebsbüro Düsseldorf', code: 'DUS-SALES', city: 'Düsseldorf', postalCode: '40213', street: 'Königsallee 60', type: 'office', grossFloorArea: 2800, ownership: 'leased' },
  { name: 'F&E Zentrum Dresden', code: 'DRS-RD', city: 'Dresden', postalCode: '01069', street: 'Technologiepark 12', type: 'office', grossFloorArea: 8500, ownership: 'leased' },
  { name: 'Rechenzentrum Frankfurt', code: 'FRA-DC', city: 'Frankfurt am Main', postalCode: '60486', street: 'Lyoner Straße 25', type: 'data_center', grossFloorArea: 4200, ownership: 'leased' },
  { name: 'Außenlager Köln', code: 'CGN-WH', city: 'Köln', postalCode: '50858', street: 'Am Eifeltor 5', type: 'warehouse', grossFloorArea: 18000, ownership: 'leased' },
  { name: 'Servicezentrum Leipzig', code: 'LEJ-SVC', city: 'Leipzig', postalCode: '04103', street: 'Augustusplatz 9', type: 'office', grossFloorArea: 2200, ownership: 'leased' },
  { name: 'Schulungszentrum Nürnberg', code: 'NUE-TRN', city: 'Nürnberg', postalCode: '90402', street: 'Königstraße 2', type: 'office', grossFloorArea: 1800, ownership: 'leased' },
];

// Realistic German suppliers
const SUPPLIERS_DATA = [
  { name: 'E.ON Energie Deutschland GmbH', shortName: 'E.ON', taxId: 'DE811190411', category: 'energy_electricity', costTypes: ['electricity'] },
  { name: 'Vattenfall Europe Sales GmbH', shortName: 'Vattenfall', taxId: 'DE246575638', category: 'energy_electricity', costTypes: ['electricity'] },
  { name: 'EnBW Energie Baden-Württemberg AG', shortName: 'EnBW', taxId: 'DE812340891', category: 'energy_electricity', costTypes: ['electricity'] },
  { name: 'RWE AG', shortName: 'RWE', taxId: 'DE811156927', category: 'energy_electricity', costTypes: ['electricity'] },
  { name: 'Uniper SE', shortName: 'Uniper', taxId: 'DE815623411', category: 'energy_gas', costTypes: ['gas', 'heating'] },
  { name: 'Gasag AG', shortName: 'GASAG', taxId: 'DE136629780', category: 'energy_gas', costTypes: ['gas'] },
  { name: 'Mainova AG', shortName: 'Mainova', taxId: 'DE113641295', category: 'energy_gas', costTypes: ['gas', 'heating', 'district_heating'] },
  { name: 'Telekom Deutschland GmbH', shortName: 'Telekom', taxId: 'DE122265872', category: 'telecom', costTypes: ['internet', 'phone', 'mobile'] },
  { name: 'Vodafone GmbH', shortName: 'Vodafone', taxId: 'DE147aborec', category: 'telecom', costTypes: ['internet', 'phone', 'mobile'] },
  { name: 'Berliner Wasserbetriebe AöR', shortName: 'BWB', taxId: 'DE136630247', category: 'utilities', costTypes: ['water', 'sewage'] },
  { name: 'Hamburger Wasserwerke GmbH', shortName: 'HWW', taxId: 'DE118572439', category: 'utilities', costTypes: ['water', 'sewage'] },
  { name: 'Stadtwerke München GmbH', shortName: 'SWM', taxId: 'DE129304107', category: 'utilities', costTypes: ['water', 'sewage', 'district_heating'] },
  { name: 'REMONDIS SE & Co. KG', shortName: 'REMONDIS', taxId: 'DE126aborec', category: 'waste', costTypes: ['waste_disposal', 'recycling'] },
  { name: 'Alba Group plc & Co. KG', shortName: 'ALBA', taxId: 'DE136629992', category: 'waste', costTypes: ['waste_disposal', 'recycling'] },
  { name: 'Kärcher SE & Co. KG', shortName: 'Kärcher', taxId: 'DE147926517', category: 'facility', costTypes: ['cleaning'] },
  { name: 'Wisag Facility Service Holding GmbH', shortName: 'WISAG', taxId: 'DE113693255', category: 'facility', costTypes: ['cleaning', 'security', 'maintenance'] },
  { name: 'Apleona GmbH', shortName: 'Apleona', taxId: 'DE248561397', category: 'facility', costTypes: ['maintenance', 'facility_management'] },
  { name: 'Securitas Deutschland Holding GmbH', shortName: 'Securitas', taxId: 'DE811329164', category: 'security', costTypes: ['security'] },
];

// Cost centers
const COST_CENTERS_DATA = [
  { name: 'Unternehmensleitung', code: 'CC-1000', budget: 2500000 },
  { name: 'Finanzen & Controlling', code: 'CC-1100', budget: 1800000 },
  { name: 'Personal & HR', code: 'CC-1200', budget: 950000 },
  { name: 'IT & Digitalisierung', code: 'CC-2000', budget: 8500000 },
  { name: 'Rechenzentrum Operations', code: 'CC-2100', budget: 4200000, parent: 'CC-2000' },
  { name: 'Produktion Wolfsburg', code: 'CC-3000', budget: 12000000 },
  { name: 'Produktion Stuttgart', code: 'CC-3100', budget: 9500000 },
  { name: 'Logistik & Distribution', code: 'CC-4000', budget: 6800000 },
  { name: 'Vertrieb Deutschland', code: 'CC-5000', budget: 3200000 },
  { name: 'Forschung & Entwicklung', code: 'CC-6000', budget: 5500000 },
  { name: 'Facility Management', code: 'CC-7000', budget: 4800000 },
  { name: 'Marketing & Kommunikation', code: 'CC-8000', budget: 1200000 },
];

// Users with different roles
const USERS_DATA = [
  { email: 'admin@techflow.de', firstName: 'Thomas', lastName: 'Müller', role: 'admin' },
  { email: 'm.schmidt@techflow.de', firstName: 'Michael', lastName: 'Schmidt', role: 'manager' },
  { email: 's.weber@techflow.de', firstName: 'Sandra', lastName: 'Weber', role: 'manager' },
  { email: 'j.fischer@techflow.de', firstName: 'Julia', lastName: 'Fischer', role: 'analyst' },
  { email: 'a.wagner@techflow.de', firstName: 'Andreas', lastName: 'Wagner', role: 'analyst' },
  { email: 'k.becker@techflow.de', firstName: 'Katharina', lastName: 'Becker', role: 'analyst' },
  { email: 'p.hoffmann@techflow.de', firstName: 'Peter', lastName: 'Hoffmann', role: 'viewer' },
  { email: 'l.schulz@techflow.de', firstName: 'Laura', lastName: 'Schulz', role: 'viewer' },
  { email: 'audit@techflow.de', firstName: 'External', lastName: 'Auditor', role: 'auditor' },
];

// Cost type configurations with realistic pricing
const COST_CONFIGS = {
  electricity: {
    basePerSqm: { office: 18, production: 45, warehouse: 12, data_center: 280 },
    pricePerKwh: 0.32,
    seasonality: (month: number) => 1 + 0.15 * Math.cos((month - 7) * Math.PI / 6), // Higher in winter
    yearlyInflation: 0.08,
  },
  gas: {
    basePerSqm: { office: 8, production: 22, warehouse: 5, data_center: 2 },
    pricePerKwh: 0.11,
    seasonality: (month: number) => 1 + 0.6 * Math.cos((month - 1) * Math.PI / 6), // Much higher in winter
    yearlyInflation: 0.12,
  },
  district_heating: {
    basePerSqm: { office: 6, production: 15, warehouse: 3, data_center: 1 },
    pricePerKwh: 0.09,
    seasonality: (month: number) => 1 + 0.5 * Math.cos((month - 1) * Math.PI / 6),
    yearlyInflation: 0.06,
  },
  water: {
    basePerSqm: { office: 0.8, production: 2.5, warehouse: 0.3, data_center: 1.2 },
    pricePerM3: 5.20,
    seasonality: (month: number) => 1 + 0.1 * Math.sin((month - 4) * Math.PI / 6), // Slightly higher in summer
    yearlyInflation: 0.03,
  },
  internet: {
    baseMonthly: { office: 450, production: 380, warehouse: 220, data_center: 8500 },
    seasonality: () => 1,
    yearlyInflation: -0.02, // Prices decrease slightly
  },
  phone: {
    baseMonthly: { office: 280, production: 180, warehouse: 95, data_center: 120 },
    seasonality: () => 1,
    yearlyInflation: -0.01,
  },
  waste_disposal: {
    basePerSqm: { office: 1.2, production: 4.5, warehouse: 2.8, data_center: 0.8 },
    pricePerTon: 185,
    seasonality: () => 1,
    yearlyInflation: 0.04,
  },
  cleaning: {
    basePerSqm: { office: 3.5, production: 2.8, warehouse: 1.2, data_center: 4.5 },
    seasonality: () => 1,
    yearlyInflation: 0.035,
  },
  security: {
    baseMonthly: { office: 2800, production: 8500, warehouse: 4200, data_center: 12000 },
    seasonality: () => 1,
    yearlyInflation: 0.04,
  },
  maintenance: {
    basePerSqm: { office: 2.2, production: 5.5, warehouse: 1.8, data_center: 8.5 },
    seasonality: (month: number) => month === 3 || month === 9 ? 1.8 : 1, // Quarterly maintenance peaks
    yearlyInflation: 0.03,
  },
};

async function main() {
  console.log('🏭 Enterprise Seed: TechFlow Industries GmbH\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Clear existing data
  console.log('🗑️  Clearing existing data...');
  await prisma.alert.deleteMany();
  await prisma.anomaly.deleteMany();
  await prisma.costRecord.deleteMany();
  await prisma.costRecordMonthlyAgg.deleteMany();
  await prisma.costSeasonalBaseline.deleteMany();
  await prisma.document.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.costCenter.deleteMany();
  await prisma.location.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
  await prisma.appSettings.deleteMany();
  await prisma.auditLog.deleteMany();
  console.log('✅ Database cleared\n');

  // Create organization
  console.log('🏢 Creating organization...');
  const org = await prisma.organization.create({
    data: {
      name: COMPANY.name,
      legalName: COMPANY.legalName,
      registrationNumber: COMPANY.registrationNumber,
      taxId: COMPANY.taxId,
      industry: COMPANY.industry,
      employeeCount: COMPANY.employeeCount,
    },
  });
  console.log(`✅ ${COMPANY.name}\n`);

  // Create users
  console.log('👥 Creating users...');
  const passwordHash = await hashPassword('Demo2024!');
  const users = [];
  for (const userData of USERS_DATA) {
    const user = await prisma.user.create({
      data: {
        email: userData.email,
        passwordHash,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        permissions: [],
        isActive: true,
        lastLoginAt: userData.role === 'admin' ? new Date() : null,
      },
    });
    users.push(user);
  }
  console.log(`✅ ${users.length} users created\n`);

  // Create locations
  console.log('📍 Creating locations...');
  const locations = [];
  for (const loc of LOCATIONS_DATA) {
    const location = await prisma.location.create({
      data: {
        organizationId: org.id,
        name: loc.name,
        code: loc.code,
        type: loc.type,
        ownershipType: loc.ownership,
        grossFloorArea: new Prisma.Decimal(loc.grossFloorArea),
        address: {
          street: loc.street,
          city: loc.city,
          postalCode: loc.postalCode,
          country: 'DE',
        },
        operationalSince: new Date(2018 + randomInt(0, 4), randomInt(0, 11), 1),
        isActive: true,
      },
    });
    locations.push(location);
    console.log(`   📍 ${loc.name} (${loc.grossFloorArea.toLocaleString()} m²)`);
  }
  console.log(`✅ ${locations.length} locations created\n`);

  // Create cost centers
  console.log('💰 Creating cost centers...');
  const costCenterMap = new Map<string, string>();
  for (const cc of COST_CENTERS_DATA) {
    const costCenter = await prisma.costCenter.create({
      data: {
        organizationId: org.id,
        name: cc.name,
        code: cc.code,
        annualBudget: new Prisma.Decimal(cc.budget),
        currency: 'EUR',
        isActive: true,
      },
    });
    costCenterMap.set(cc.code, costCenter.id);
  }
  console.log(`✅ ${COST_CENTERS_DATA.length} cost centers created\n`);

  // Create suppliers
  console.log('🏪 Creating suppliers...');
  const suppliers = [];
  for (const sup of SUPPLIERS_DATA) {
    const supplier = await prisma.supplier.create({
      data: {
        name: sup.name,
        shortName: sup.shortName,
        taxId: sup.taxId.startsWith('DE') ? sup.taxId : null,
        category: sup.category,
        costTypes: sup.costTypes,
        isActive: true,
      },
    });
    suppliers.push({ ...supplier, costTypes: sup.costTypes });
  }
  console.log(`✅ ${suppliers.length} suppliers created\n`);

  // Generate 3 years of cost records
  console.log('📊 Generating cost records (3 years of history)...');
  const costRecords: Prisma.CostRecordCreateManyInput[] = [];
  const anomalies: { costRecordIndex: number; type: string; severity: string; message: string; details: object }[] = [];

  const now = new Date();
  const startYear = now.getFullYear() - 2;
  const endYear = now.getFullYear();

  let invoiceCounter = 10000;

  // Map suppliers to their cost types
  const suppliersByCostType = new Map<string, typeof suppliers>();
  for (const sup of suppliers) {
    for (const costType of sup.costTypes) {
      if (!suppliersByCostType.has(costType)) {
        suppliersByCostType.set(costType, []);
      }
      suppliersByCostType.get(costType)!.push(sup);
    }
  }

  // Assign primary suppliers to locations
  const locationSuppliers = new Map<string, Map<string, typeof suppliers[0]>>();
  for (const location of locations) {
    const locSuppliers = new Map<string, typeof suppliers[0]>();
    for (const [costType, sups] of suppliersByCostType.entries()) {
      locSuppliers.set(costType, randomChoice(sups));
    }
    locationSuppliers.set(location.id, locSuppliers);
  }

  for (let year = startYear; year <= endYear; year++) {
    const maxMonth = year === endYear ? now.getMonth() + 1 : 12;
    const yearsFromStart = year - startYear;

    for (let month = 1; month <= maxMonth; month++) {
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);
      const invoiceDate = new Date(year, month, randomInt(5, 20));

      for (const location of locations) {
        const locType = location.type as keyof typeof COST_CONFIGS.electricity.basePerSqm;
        const sqm = Number(location.grossFloorArea);
        const locSuppliers = locationSuppliers.get(location.id)!;

        // ELECTRICITY
        if (COST_CONFIGS.electricity.basePerSqm[locType]) {
          const config = COST_CONFIGS.electricity;
          const supplier = locSuppliers.get('electricity')!;
          const baseAmount = sqm * config.basePerSqm[locType] / 12;
          const inflation = Math.pow(1 + config.yearlyInflation, yearsFromStart);
          const seasonal = config.seasonality(month);
          const variance = randomBetween(0.92, 1.08);

          // Occasional spike (anomaly)
          let spike = 1;
          const isSpike = Math.random() < 0.02; // 2% chance
          if (isSpike) spike = randomBetween(1.8, 2.5);

          const amount = baseAmount * inflation * seasonal * variance * spike;
          const quantity = amount / (config.pricePerKwh * inflation);

          const recordIndex = costRecords.length;
          costRecords.push({
            locationId: location.id,
            supplierId: supplier.id,
            invoiceNumber: `${supplier.shortName}-${year}${String(month).padStart(2, '0')}-${++invoiceCounter}`,
            periodStart,
            periodEnd,
            invoiceDate,
            amount: new Prisma.Decimal(amount.toFixed(2)),
            amountNet: new Prisma.Decimal((amount / 1.19).toFixed(2)),
            vatAmount: new Prisma.Decimal((amount - amount / 1.19).toFixed(2)),
            vatRate: new Prisma.Decimal('19.00'),
            quantity: new Prisma.Decimal(quantity.toFixed(2)),
            unit: 'kWh',
            pricePerUnit: new Prisma.Decimal((config.pricePerKwh * inflation).toFixed(4)),
            costType: 'electricity',
            costCategory: 'energy',
            confidence: randomBetween(0.88, 0.98),
            dataQuality: 'extracted',
            isVerified: year < endYear || month < now.getMonth() - 1,
          });

          if (isSpike) {
            anomalies.push({
              costRecordIndex: recordIndex,
              type: 'consumption_spike',
              severity: spike > 2 ? 'critical' : 'warning',
              message: `Stromverbrauch ${((spike - 1) * 100).toFixed(0)}% über Erwartung`,
              details: { expectedAmount: amount / spike, actualAmount: amount, spikePercent: (spike - 1) * 100 },
            });
          }
        }

        // GAS (not for data centers)
        if (locType !== 'data_center' && COST_CONFIGS.gas.basePerSqm[locType]) {
          const config = COST_CONFIGS.gas;
          const supplier = locSuppliers.get('gas') || locSuppliers.get('heating');
          if (supplier) {
            const baseAmount = sqm * config.basePerSqm[locType] / 12;
            const inflation = Math.pow(1 + config.yearlyInflation, yearsFromStart);
            const seasonal = config.seasonality(month);
            const variance = randomBetween(0.90, 1.10);
            const amount = baseAmount * inflation * seasonal * variance;
            const quantity = amount / (config.pricePerKwh * inflation);

            costRecords.push({
              locationId: location.id,
              supplierId: supplier.id,
              invoiceNumber: `${supplier.shortName}-${year}${String(month).padStart(2, '0')}-${++invoiceCounter}`,
              periodStart,
              periodEnd,
              invoiceDate,
              amount: new Prisma.Decimal(amount.toFixed(2)),
              amountNet: new Prisma.Decimal((amount / 1.19).toFixed(2)),
              vatAmount: new Prisma.Decimal((amount - amount / 1.19).toFixed(2)),
              vatRate: new Prisma.Decimal('19.00'),
              quantity: new Prisma.Decimal(quantity.toFixed(2)),
              unit: 'kWh',
              pricePerUnit: new Prisma.Decimal((config.pricePerKwh * inflation).toFixed(4)),
              costType: 'gas',
              costCategory: 'energy',
              confidence: randomBetween(0.85, 0.96),
              dataQuality: 'extracted',
              isVerified: year < endYear || month < now.getMonth() - 1,
            });
          }
        }

        // WATER
        if (COST_CONFIGS.water.basePerSqm[locType]) {
          const config = COST_CONFIGS.water;
          const supplier = locSuppliers.get('water') || suppliers.find(s => s.costTypes.includes('water'));
          if (supplier) {
            const baseAmount = sqm * config.basePerSqm[locType] / 12;
            const inflation = Math.pow(1 + config.yearlyInflation, yearsFromStart);
            const seasonal = config.seasonality(month);
            const variance = randomBetween(0.92, 1.08);
            const amount = baseAmount * inflation * seasonal * variance * config.pricePerM3;
            const quantity = amount / (config.pricePerM3 * inflation);

            costRecords.push({
              locationId: location.id,
              supplierId: supplier.id,
              invoiceNumber: `${supplier.shortName}-${year}${String(month).padStart(2, '0')}-${++invoiceCounter}`,
              periodStart,
              periodEnd,
              invoiceDate,
              amount: new Prisma.Decimal(amount.toFixed(2)),
              amountNet: new Prisma.Decimal((amount / 1.07).toFixed(2)),
              vatAmount: new Prisma.Decimal((amount - amount / 1.07).toFixed(2)),
              vatRate: new Prisma.Decimal('7.00'),
              quantity: new Prisma.Decimal(quantity.toFixed(2)),
              unit: 'm³',
              pricePerUnit: new Prisma.Decimal((config.pricePerM3 * inflation).toFixed(4)),
              costType: 'water',
              costCategory: 'utilities',
              confidence: randomBetween(0.90, 0.98),
              dataQuality: 'extracted',
              isVerified: year < endYear || month < now.getMonth() - 1,
            });
          }
        }

        // INTERNET
        if (COST_CONFIGS.internet.baseMonthly[locType]) {
          const config = COST_CONFIGS.internet;
          const supplier = locSuppliers.get('internet') || suppliers.find(s => s.costTypes.includes('internet'));
          if (supplier) {
            const baseAmount = config.baseMonthly[locType];
            const inflation = Math.pow(1 + config.yearlyInflation, yearsFromStart);
            const amount = baseAmount * inflation;

            costRecords.push({
              locationId: location.id,
              supplierId: supplier.id,
              invoiceNumber: `${supplier.shortName}-${year}${String(month).padStart(2, '0')}-${++invoiceCounter}`,
              periodStart,
              periodEnd,
              invoiceDate,
              amount: new Prisma.Decimal(amount.toFixed(2)),
              amountNet: new Prisma.Decimal((amount / 1.19).toFixed(2)),
              vatAmount: new Prisma.Decimal((amount - amount / 1.19).toFixed(2)),
              vatRate: new Prisma.Decimal('19.00'),
              costType: 'internet',
              costCategory: 'telecom',
              confidence: 0.99,
              dataQuality: 'extracted',
              isVerified: true,
            });
          }
        }

        // CLEANING (monthly)
        if (COST_CONFIGS.cleaning.basePerSqm[locType]) {
          const config = COST_CONFIGS.cleaning;
          const supplier = suppliers.find(s => s.costTypes.includes('cleaning'));
          if (supplier) {
            const baseAmount = sqm * config.basePerSqm[locType] / 12;
            const inflation = Math.pow(1 + config.yearlyInflation, yearsFromStart);
            const variance = randomBetween(0.95, 1.05);
            const amount = baseAmount * inflation * variance;

            costRecords.push({
              locationId: location.id,
              supplierId: supplier.id,
              invoiceNumber: `${supplier.shortName}-${year}${String(month).padStart(2, '0')}-${++invoiceCounter}`,
              periodStart,
              periodEnd,
              invoiceDate,
              amount: new Prisma.Decimal(amount.toFixed(2)),
              amountNet: new Prisma.Decimal((amount / 1.19).toFixed(2)),
              vatAmount: new Prisma.Decimal((amount - amount / 1.19).toFixed(2)),
              vatRate: new Prisma.Decimal('19.00'),
              costType: 'cleaning',
              costCategory: 'facility',
              confidence: 0.95,
              dataQuality: 'extracted',
              isVerified: year < endYear || month < now.getMonth() - 1,
            });
          }
        }

        // SECURITY (for larger locations)
        if (sqm > 5000 && COST_CONFIGS.security.baseMonthly[locType]) {
          const config = COST_CONFIGS.security;
          const supplier = suppliers.find(s => s.costTypes.includes('security'));
          if (supplier) {
            const baseAmount = config.baseMonthly[locType];
            const inflation = Math.pow(1 + config.yearlyInflation, yearsFromStart);
            const amount = baseAmount * inflation;

            costRecords.push({
              locationId: location.id,
              supplierId: supplier.id,
              invoiceNumber: `${supplier.shortName}-${year}${String(month).padStart(2, '0')}-${++invoiceCounter}`,
              periodStart,
              periodEnd,
              invoiceDate,
              amount: new Prisma.Decimal(amount.toFixed(2)),
              amountNet: new Prisma.Decimal((amount / 1.19).toFixed(2)),
              vatAmount: new Prisma.Decimal((amount - amount / 1.19).toFixed(2)),
              vatRate: new Prisma.Decimal('19.00'),
              costType: 'security',
              costCategory: 'facility',
              confidence: 0.98,
              dataQuality: 'extracted',
              isVerified: true,
            });
          }
        }

        // WASTE DISPOSAL (monthly for production/warehouse)
        if ((locType === 'production' || locType === 'warehouse') && COST_CONFIGS.waste_disposal.basePerSqm[locType]) {
          const config = COST_CONFIGS.waste_disposal;
          const supplier = suppliers.find(s => s.costTypes.includes('waste_disposal'));
          if (supplier) {
            const baseAmount = sqm * config.basePerSqm[locType] / 12;
            const inflation = Math.pow(1 + config.yearlyInflation, yearsFromStart);
            const variance = randomBetween(0.85, 1.15);
            const amount = baseAmount * inflation * variance;
            const quantity = amount / (config.pricePerTon * inflation);

            costRecords.push({
              locationId: location.id,
              supplierId: supplier.id,
              invoiceNumber: `${supplier.shortName}-${year}${String(month).padStart(2, '0')}-${++invoiceCounter}`,
              periodStart,
              periodEnd,
              invoiceDate,
              amount: new Prisma.Decimal(amount.toFixed(2)),
              amountNet: new Prisma.Decimal((amount / 1.19).toFixed(2)),
              vatAmount: new Prisma.Decimal((amount - amount / 1.19).toFixed(2)),
              vatRate: new Prisma.Decimal('19.00'),
              quantity: new Prisma.Decimal(quantity.toFixed(2)),
              unit: 't',
              pricePerUnit: new Prisma.Decimal((config.pricePerTon * inflation).toFixed(2)),
              costType: 'waste_disposal',
              costCategory: 'utilities',
              confidence: 0.92,
              dataQuality: 'extracted',
              isVerified: year < endYear || month < now.getMonth() - 1,
            });
          }
        }
      }
    }
  }

  // Insert cost records in batches
  console.log(`   Inserting ${costRecords.length} cost records...`);
  const batchSize = 500;
  for (let i = 0; i < costRecords.length; i += batchSize) {
    const batch = costRecords.slice(i, i + batchSize);
    await prisma.costRecord.createMany({ data: batch, skipDuplicates: true });
    process.stdout.write(`   Progress: ${Math.min(i + batchSize, costRecords.length)}/${costRecords.length}\r`);
  }
  console.log(`\n✅ ${costRecords.length} cost records created\n`);

  // Create anomalies
  console.log('⚠️  Creating anomalies...');
  const allCostRecords = await prisma.costRecord.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  // Add some additional anomalies for recent months
  const recentRecords = await prisma.costRecord.findMany({
    where: {
      periodStart: { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) },
    },
    include: { location: true, supplier: true },
    orderBy: { amount: 'desc' },
    take: 50,
  });

  const anomalyData: Prisma.AnomalyCreateManyInput[] = [];

  // Create anomalies from spikes we tracked
  for (const anomaly of anomalies) {
    if (allCostRecords[anomaly.costRecordIndex]) {
      anomalyData.push({
        costRecordId: allCostRecords[anomaly.costRecordIndex]!.id,
        type: anomaly.type,
        severity: anomaly.severity,
        message: anomaly.message,
        details: anomaly.details,
        status: Math.random() < 0.3 ? 'acknowledged' : 'new',
        detectedAt: new Date(),
      });
    }
  }

  // Add year-over-year deviation anomalies
  for (let i = 0; i < 8; i++) {
    const record = recentRecords[randomInt(0, Math.min(20, recentRecords.length - 1))];
    if (record) {
      anomalyData.push({
        costRecordId: record.id,
        type: 'yoy_deviation',
        severity: randomChoice(['warning', 'warning', 'critical']),
        message: `${record.costType} Kosten ${randomInt(25, 60)}% über Vorjahr`,
        details: {
          location: record.location?.name,
          supplier: record.supplier?.name,
          deviationPercent: randomInt(25, 60),
        },
        status: 'new',
        detectedAt: new Date(Date.now() - randomInt(0, 7) * 24 * 60 * 60 * 1000),
      });
    }
  }

  // Add price per unit anomalies
  for (let i = 0; i < 5; i++) {
    const record = recentRecords[randomInt(0, Math.min(30, recentRecords.length - 1))];
    if (record && record.pricePerUnit) {
      anomalyData.push({
        costRecordId: record.id,
        type: 'price_per_unit_spike',
        severity: 'warning',
        message: `Einheitspreis für ${record.costType} ungewöhnlich hoch`,
        details: {
          currentPrice: Number(record.pricePerUnit),
          averagePrice: Number(record.pricePerUnit) * 0.75,
          deviationPercent: 33,
        },
        status: randomChoice(['new', 'new', 'acknowledged']),
        detectedAt: new Date(Date.now() - randomInt(0, 14) * 24 * 60 * 60 * 1000),
      });
    }
  }

  // Add missing invoice anomalies
  for (let i = 0; i < 3; i++) {
    const record = recentRecords[randomInt(0, Math.min(40, recentRecords.length - 1))];
    if (record) {
      anomalyData.push({
        costRecordId: record.id,
        type: 'missing_expected_invoice',
        severity: 'info',
        message: `Erwartete Rechnung für ${record.location?.name} fehlt`,
        details: {
          expectedSupplier: record.supplier?.name,
          lastInvoiceDate: record.periodEnd,
        },
        status: 'new',
        detectedAt: new Date(Date.now() - randomInt(0, 5) * 24 * 60 * 60 * 1000),
      });
    }
  }

  await prisma.anomaly.createMany({ data: anomalyData, skipDuplicates: true });
  console.log(`✅ ${anomalyData.length} anomalies created\n`);

  // Build monthly aggregates
  console.log('📈 Building monthly aggregates...');
  const aggregates = new Map<string, {
    year: number;
    month: number;
    locationId: string | null;
    supplierId: string | null;
    costType: string | null;
    amountSum: number;
    amountNetSum: number;
    quantitySum: number;
    recordCount: number;
  }>();

  for (const record of costRecords) {
    const year = record.periodStart.getFullYear();
    const month = record.periodStart.getMonth() + 1;
    const key = `${year}-${month}-${record.locationId}-${record.supplierId}-${record.costType}`;

    const existing = aggregates.get(key);
    if (existing) {
      existing.amountSum += Number(record.amount);
      existing.amountNetSum += Number(record.amountNet || 0);
      existing.quantitySum += Number(record.quantity || 0);
      existing.recordCount += 1;
    } else {
      aggregates.set(key, {
        year,
        month,
        locationId: record.locationId || null,
        supplierId: record.supplierId,
        costType: record.costType,
        amountSum: Number(record.amount),
        amountNetSum: Number(record.amountNet || 0),
        quantitySum: Number(record.quantity || 0),
        recordCount: 1,
      });
    }
  }

  const aggData = Array.from(aggregates.values()).map(agg => ({
    year: agg.year,
    month: agg.month,
    locationId: agg.locationId,
    supplierId: agg.supplierId,
    costType: agg.costType,
    amountSum: new Prisma.Decimal(agg.amountSum.toFixed(4)),
    amountNetSum: new Prisma.Decimal(agg.amountNetSum.toFixed(4)),
    quantitySum: new Prisma.Decimal(agg.quantitySum.toFixed(4)),
    recordCount: agg.recordCount,
  }));

  await prisma.costRecordMonthlyAgg.createMany({ data: aggData });
  console.log(`✅ ${aggData.length} monthly aggregates created\n`);

  // Create some sample documents (metadata only)
  console.log('📄 Creating sample documents...');
  const documents: Prisma.DocumentCreateManyInput[] = [];
  const docStatuses = ['completed', 'completed', 'completed', 'pending', 'processing', 'failed'];

  for (let i = 0; i < 85; i++) {
    const monthsAgo = randomInt(0, 24);
    const uploadDate = new Date(now.getFullYear(), now.getMonth() - monthsAgo, randomInt(1, 28));
    const supplier = randomChoice(suppliers);
    const status = randomChoice(docStatuses);

    documents.push({
      filename: `${crypto.randomUUID()}.pdf`,
      originalFilename: `Rechnung_${supplier.shortName}_${uploadDate.getFullYear()}${String(uploadDate.getMonth() + 1).padStart(2, '0')}.pdf`,
      mimeType: 'application/pdf',
      fileSize: randomInt(50000, 2500000),
      fileHash: crypto.randomBytes(32).toString('hex'),
      storagePath: `documents/${uploadDate.getFullYear()}/${String(uploadDate.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.pdf`,
      documentType: 'invoice',
      costTypes: supplier.costTypes,
      extractionStatus: status,
      extractedAt: status === 'completed' ? new Date(uploadDate.getTime() + 60000) : null,
      verificationStatus: status === 'completed' ? (Math.random() < 0.7 ? 'auto_verified' : 'manually_verified') : 'pending',
      uploadedAt: uploadDate,
      uploadedBy: randomChoice(users).id,
    });
  }

  await prisma.document.createMany({ data: documents });
  console.log(`✅ ${documents.length} documents created\n`);

  // Create app settings
  await prisma.appSettings.create({
    data: {
      id: 'default',
      name: 'TechFlow Cost Management',
      plan: 'enterprise',
      settings: {
        currency: 'EUR',
        timezone: 'Europe/Berlin',
        fiscalYearStart: 1,
        anomalyThresholds: {
          momDeviationWarning: 30,
          momDeviationCritical: 50,
          yoyDeviationWarning: 25,
          yoyDeviationCritical: 40,
          pricePerUnitSpike: 20,
        },
        notifications: {
          emailEnabled: true,
          slackEnabled: false,
          criticalAnomaliesOnly: false,
        },
      },
    },
  });
  console.log('✅ App settings configured\n');

  // Summary
  const totalAmount = await prisma.costRecordMonthlyAgg.aggregate({
    _sum: { amountSum: true },
  });

  const stats = await Promise.all([
    prisma.costRecord.count(),
    prisma.anomaly.count({ where: { status: 'new' } }),
    prisma.document.count(),
  ]);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 ENTERPRISE SEED COMPLETE\n');
  console.log(`📊 Summary:`);
  console.log(`   • Organization: ${COMPANY.name}`);
  console.log(`   • Locations: ${locations.length}`);
  console.log(`   • Suppliers: ${suppliers.length}`);
  console.log(`   • Cost Records: ${stats[0].toLocaleString()}`);
  console.log(`   • Total Costs: €${Number(totalAmount._sum.amountSum || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`);
  console.log(`   • Open Anomalies: ${stats[1]}`);
  console.log(`   • Documents: ${stats[2]}`);
  console.log(`   • Users: ${users.length}`);
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 LOGIN CREDENTIALS:\n');
  console.log('   Admin:    admin@techflow.de / Demo2024!');
  console.log('   Manager:  m.schmidt@techflow.de / Demo2024!');
  console.log('   Analyst:  j.fischer@techflow.de / Demo2024!');
  console.log('   Viewer:   p.hoffmann@techflow.de / Demo2024!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
