import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Rebuilding monthly aggregates from cost records...\n');

  // Clear existing aggregates
  await prisma.costRecordMonthlyAgg.deleteMany();
  console.log('✅ Cleared existing aggregates');

  // Get all cost records grouped by year, month, location, supplier, costType
  const costRecords = await prisma.costRecord.findMany({
    select: {
      periodStart: true,
      locationId: true,
      supplierId: true,
      costType: true,
      amount: true,
      amountNet: true,
      quantity: true,
    },
  });

  console.log(`📊 Processing ${costRecords.length} cost records...`);

  // Group by composite key
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
    const key = `${year}-${month}-${record.locationId || 'null'}-${record.supplierId || 'null'}-${record.costType || 'null'}`;

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
        locationId: record.locationId,
        supplierId: record.supplierId,
        costType: record.costType,
        amountSum: Number(record.amount),
        amountNetSum: Number(record.amountNet || 0),
        quantitySum: Number(record.quantity || 0),
        recordCount: 1,
      });
    }
  }

  // Insert aggregates
  const aggData: Prisma.CostRecordMonthlyAggCreateManyInput[] = Array.from(aggregates.values()).map(agg => ({
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

  await prisma.costRecordMonthlyAgg.createMany({
    data: aggData,
  });

  console.log(`✅ Created ${aggData.length} monthly aggregates`);

  // Show summary
  const summary = await prisma.costRecordMonthlyAgg.aggregate({
    _sum: { amountSum: true, recordCount: true },
    _count: true,
  });

  console.log('\n📈 Summary:');
  console.log(`   Total aggregates: ${summary._count}`);
  console.log(`   Total amount: €${Number(summary._sum.amountSum || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`);
  console.log(`   Total records: ${summary._sum.recordCount}`);

  // Show by year
  const byYear = await prisma.costRecordMonthlyAgg.groupBy({
    by: ['year'],
    _sum: { amountSum: true },
    orderBy: { year: 'desc' },
  });

  console.log('\n📅 By Year:');
  for (const y of byYear) {
    console.log(`   ${y.year}: €${Number(y._sum.amountSum || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`);
  }

  console.log('\n🎉 Aggregates rebuilt successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
