import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check aggregate table structure
  const count = await prisma.costRecordMonthlyAgg.count();
  console.log('Total aggregates:', count);

  // Check unique year-months
  const byYearMonth = await prisma.costRecordMonthlyAgg.groupBy({
    by: ['year', 'month'],
    _sum: { amountSum: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  console.log('\nYear-Month breakdown:');
  for (const item of byYearMonth) {
    console.log(`  ${item.year}-${String(item.month).padStart(2, '0')}: €${Number(item._sum.amountSum || 0).toLocaleString('de-DE')}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
