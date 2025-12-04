import { PrismaClient, Prisma } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

// Hash password using Argon2id (same as auth.ts)
async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

async function main() {
  console.log('🌱 Seeding database...\n');

  // Create admin user
  const adminPassword = await hashPassword('Admin123!');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      permissions: [],
      isActive: true,
    },
  });
  console.log('✅ Admin user created: admin@example.com / Admin123!');

  // Create organization
  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Demo GmbH',
      legalName: 'Demo GmbH & Co. KG',
      industry: 'Technology',
      employeeCount: 150,
    },
  });
  console.log('✅ Organization created: Demo GmbH');

  // Create locations
  const locations = await Promise.all([
    prisma.location.upsert({
      where: { id: '00000000-0000-0000-0000-000000000010' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000010',
        organizationId: org.id,
        name: 'Hauptsitz Berlin',
        code: 'BER-HQ',
        type: 'office',
        ownershipType: 'leased',
        grossFloorArea: new Prisma.Decimal(2500),
        address: {
          street: 'Friedrichstraße 123',
          city: 'Berlin',
          postalCode: '10117',
          country: 'DE',
        },
        isActive: true,
      },
    }),
    prisma.location.upsert({
      where: { id: '00000000-0000-0000-0000-000000000011' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000011',
        organizationId: org.id,
        name: 'Lager Hamburg',
        code: 'HAM-WH',
        type: 'warehouse',
        ownershipType: 'leased',
        grossFloorArea: new Prisma.Decimal(5000),
        address: {
          street: 'Hafenstraße 45',
          city: 'Hamburg',
          postalCode: '20457',
          country: 'DE',
        },
        isActive: true,
      },
    }),
    prisma.location.upsert({
      where: { id: '00000000-0000-0000-0000-000000000012' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000012',
        organizationId: org.id,
        name: 'Büro München',
        code: 'MUC-OFF',
        type: 'office',
        ownershipType: 'leased',
        grossFloorArea: new Prisma.Decimal(800),
        address: {
          street: 'Maximilianstraße 50',
          city: 'München',
          postalCode: '80538',
          country: 'DE',
        },
        isActive: true,
      },
    }),
  ]);
  console.log(`✅ ${locations.length} Locations created`);

  // Create cost centers
  const costCenters = await Promise.all([
    prisma.costCenter.upsert({
      where: { code: 'CC-100' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000020',
        organizationId: org.id,
        name: 'IT & Infrastructure',
        code: 'CC-100',
        description: 'IT department costs',
        annualBudget: new Prisma.Decimal(500000),
        currency: 'EUR',
        isActive: true,
      },
    }),
    prisma.costCenter.upsert({
      where: { code: 'CC-200' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000021',
        organizationId: org.id,
        name: 'Operations',
        code: 'CC-200',
        description: 'Operations department costs',
        annualBudget: new Prisma.Decimal(300000),
        currency: 'EUR',
        isActive: true,
      },
    }),
  ]);
  console.log(`✅ ${costCenters.length} Cost Centers created`);

  // Create suppliers
  const suppliers = await Promise.all([
    prisma.supplier.upsert({
      where: { taxId: 'DE123456789' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000030',
        name: 'Vattenfall Europe Sales GmbH',
        shortName: 'Vattenfall',
        taxId: 'DE123456789',
        category: 'energy_electricity',
        costTypes: ['electricity'],
        isActive: true,
      },
    }),
    prisma.supplier.upsert({
      where: { taxId: 'DE987654321' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000031',
        name: 'E.ON Energie Deutschland GmbH',
        shortName: 'E.ON',
        taxId: 'DE987654321',
        category: 'energy_gas',
        costTypes: ['gas', 'heating'],
        isActive: true,
      },
    }),
    prisma.supplier.upsert({
      where: { taxId: 'DE111222333' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000032',
        name: 'Telekom Deutschland GmbH',
        shortName: 'Telekom',
        taxId: 'DE111222333',
        category: 'telecom',
        costTypes: ['internet', 'phone'],
        isActive: true,
      },
    }),
    prisma.supplier.upsert({
      where: { taxId: 'DE444555666' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000033',
        name: 'Berliner Wasserbetriebe',
        shortName: 'BWB',
        taxId: 'DE444555666',
        category: 'utilities',
        costTypes: ['water', 'sewage'],
        isActive: true,
      },
    }),
  ]);
  console.log(`✅ ${suppliers.length} Suppliers created`);

  // Create cost records for the last 12 months
  const costRecords: Prisma.CostRecordCreateManyInput[] = [];
  const now = new Date();

  for (let monthsAgo = 0; monthsAgo < 12; monthsAgo++) {
    const periodStart = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);

    // Electricity costs for each location
    for (const location of locations) {
      const baseAmount = location.name.includes('Lager') ? 2500 : 1200;
      const seasonalFactor = 1 + 0.2 * Math.sin((periodStart.getMonth() - 6) * Math.PI / 6);
      const randomFactor = 0.9 + Math.random() * 0.2;
      const amount = baseAmount * seasonalFactor * randomFactor;
      const quantity = amount / 0.35; // ~0.35 EUR/kWh

      costRecords.push({
        locationId: location.id,
        supplierId: suppliers[0].id,
        invoiceNumber: `VF-${periodStart.getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, '0')}-${location.code}`,
        periodStart,
        periodEnd,
        invoiceDate: periodEnd,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        amountNet: new Prisma.Decimal((amount / 1.19).toFixed(2)),
        vatAmount: new Prisma.Decimal((amount - amount / 1.19).toFixed(2)),
        vatRate: new Prisma.Decimal('19.00'),
        quantity: new Prisma.Decimal(quantity.toFixed(2)),
        unit: 'kWh',
        pricePerUnit: new Prisma.Decimal('0.35'),
        costType: 'electricity',
        costCategory: 'energy',
        confidence: 0.95,
        dataQuality: 'extracted',
        isVerified: monthsAgo > 1,
      });
    }

    // Gas costs (only for main office and warehouse)
    for (const location of locations.filter(l => !l.name.includes('München'))) {
      const baseAmount = location.name.includes('Lager') ? 1800 : 900;
      const seasonalFactor = 1 + 0.5 * Math.cos((periodStart.getMonth() - 0) * Math.PI / 6);
      const randomFactor = 0.9 + Math.random() * 0.2;
      const amount = baseAmount * seasonalFactor * randomFactor;
      const quantity = amount / 0.12;

      costRecords.push({
        locationId: location.id,
        supplierId: suppliers[1].id,
        invoiceNumber: `EON-${periodStart.getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, '0')}-${location.code}`,
        periodStart,
        periodEnd,
        invoiceDate: periodEnd,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        amountNet: new Prisma.Decimal((amount / 1.19).toFixed(2)),
        vatAmount: new Prisma.Decimal((amount - amount / 1.19).toFixed(2)),
        vatRate: new Prisma.Decimal('19.00'),
        quantity: new Prisma.Decimal(quantity.toFixed(2)),
        unit: 'kWh',
        pricePerUnit: new Prisma.Decimal('0.12'),
        costType: 'gas',
        costCategory: 'energy',
        confidence: 0.92,
        dataQuality: 'extracted',
        isVerified: monthsAgo > 1,
      });
    }

    // Internet/Phone costs
    for (const location of locations) {
      const baseAmount = location.name.includes('Hauptsitz') ? 450 : 180;

      costRecords.push({
        locationId: location.id,
        supplierId: suppliers[2].id,
        invoiceNumber: `TK-${periodStart.getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, '0')}-${location.code}`,
        periodStart,
        periodEnd,
        invoiceDate: periodEnd,
        amount: new Prisma.Decimal(baseAmount.toFixed(2)),
        amountNet: new Prisma.Decimal((baseAmount / 1.19).toFixed(2)),
        vatAmount: new Prisma.Decimal((baseAmount - baseAmount / 1.19).toFixed(2)),
        vatRate: new Prisma.Decimal('19.00'),
        costType: 'internet',
        costCategory: 'telecom',
        confidence: 0.98,
        dataQuality: 'extracted',
        isVerified: monthsAgo > 1,
      });
    }

    // Water costs (Berlin only)
    const berlinLocation = locations.find(l => l.name.includes('Berlin'));
    if (berlinLocation) {
      const baseAmount = 350;
      const randomFactor = 0.9 + Math.random() * 0.2;
      const amount = baseAmount * randomFactor;

      costRecords.push({
        locationId: berlinLocation.id,
        supplierId: suppliers[3].id,
        invoiceNumber: `BWB-${periodStart.getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, '0')}`,
        periodStart,
        periodEnd,
        invoiceDate: periodEnd,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        amountNet: new Prisma.Decimal((amount / 1.07).toFixed(2)),
        vatAmount: new Prisma.Decimal((amount - amount / 1.07).toFixed(2)),
        vatRate: new Prisma.Decimal('7.00'),
        quantity: new Prisma.Decimal((amount / 5.5).toFixed(2)),
        unit: 'm³',
        pricePerUnit: new Prisma.Decimal('5.50'),
        costType: 'water',
        costCategory: 'utilities',
        confidence: 0.90,
        dataQuality: 'extracted',
        isVerified: monthsAgo > 1,
      });
    }
  }

  // Add one anomalous cost record (spike)
  const spikeDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  costRecords.push({
    locationId: locations[0].id,
    supplierId: suppliers[0].id,
    invoiceNumber: `VF-SPIKE-${spikeDate.getFullYear()}${String(spikeDate.getMonth() + 1).padStart(2, '0')}`,
    periodStart: spikeDate,
    periodEnd: new Date(spikeDate.getFullYear(), spikeDate.getMonth() + 1, 0),
    invoiceDate: new Date(spikeDate.getFullYear(), spikeDate.getMonth() + 1, 0),
    amount: new Prisma.Decimal('4500.00'), // Much higher than normal
    amountNet: new Prisma.Decimal('3781.51'),
    vatAmount: new Prisma.Decimal('718.49'),
    vatRate: new Prisma.Decimal('19.00'),
    quantity: new Prisma.Decimal('12857.14'),
    unit: 'kWh',
    pricePerUnit: new Prisma.Decimal('0.35'),
    costType: 'electricity',
    costCategory: 'energy',
    confidence: 0.95,
    dataQuality: 'extracted',
    isVerified: false,
    anomalyStatus: 'warning',
  });

  await prisma.costRecord.createMany({
    data: costRecords,
    skipDuplicates: true,
  });
  console.log(`✅ ${costRecords.length} Cost Records created`);

  // Create anomaly for the spike
  const spikeRecord = await prisma.costRecord.findFirst({
    where: { invoiceNumber: { contains: 'SPIKE' } },
  });

  if (spikeRecord) {
    await prisma.anomaly.upsert({
      where: {
        costRecordId_type: {
          costRecordId: spikeRecord.id,
          type: 'mom_deviation',
        },
      },
      update: {},
      create: {
        costRecordId: spikeRecord.id,
        type: 'mom_deviation',
        severity: 'warning',
        message: 'Stromkosten 275% höher als Vormonat',
        details: {
          currentAmount: 4500,
          previousAmount: 1200,
          deviationPercent: 275,
        },
        status: 'new',
      },
    });
    console.log('✅ 1 Anomaly created');
  }

  // Create app settings
  await prisma.appSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: 'Cost Watchdog Demo',
      plan: 'professional',
      settings: {
        currency: 'EUR',
        timezone: 'Europe/Berlin',
        anomalyThresholds: {
          momDeviation: 50,
          yoyDeviation: 30,
          pricePerUnitSpike: 25,
        },
      },
    },
  });
  console.log('✅ App Settings created');

  console.log('\n🎉 Seeding completed!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Login credentials:');
  console.log('  Email:    admin@example.com');
  console.log('  Password: Admin123!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
