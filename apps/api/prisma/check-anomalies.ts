import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check anomaly stats
  const total = await prisma.anomaly.count();
  const byStatus = await prisma.anomaly.groupBy({
    by: ['status'],
    _count: true,
  });
  const bySeverity = await prisma.anomaly.groupBy({
    by: ['severity'],
    _count: true,
  });

  console.log('Total anomalies:', total);
  console.log('By status:', byStatus);
  console.log('By severity:', bySeverity);

  // Check a few anomalies
  const anomalies = await prisma.anomaly.findMany({
    take: 5,
    include: { costRecord: true },
  });

  console.log('\nFirst 5 anomalies:');
  for (const a of anomalies) {
    console.log(`  - ${a.type} | ${a.severity} | ${a.status} | costRecordId: ${a.costRecordId} | has costRecord: ${!!a.costRecord}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
