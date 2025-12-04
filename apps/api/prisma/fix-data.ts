import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Fixing data issues...\n');

  // 1. Update all documents to completed status
  const docUpdate = await prisma.document.updateMany({
    data: {
      extractionStatus: 'completed',
      verificationStatus: 'auto_verified',
      extractedAt: new Date(),
    },
  });
  console.log(`✅ Updated ${docUpdate.count} documents to completed status`);

  // 2. Check anomalies
  const anomalyStats = await prisma.anomaly.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('\n📊 Anomaly stats:');
  for (const stat of anomalyStats) {
    console.log(`   ${stat.status}: ${stat._count}`);
  }

  // 3. Verify anomalies have valid costRecord references
  const anomaliesWithoutRecords = await prisma.anomaly.findMany({
    where: {
      costRecord: null,
    },
  });
  console.log(`\n⚠️  Anomalies without cost records: ${anomaliesWithoutRecords.length}`);

  if (anomaliesWithoutRecords.length > 0) {
    // Delete orphaned anomalies
    await prisma.anomaly.deleteMany({
      where: {
        id: { in: anomaliesWithoutRecords.map(a => a.id) },
      },
    });
    console.log(`   Deleted ${anomaliesWithoutRecords.length} orphaned anomalies`);
  }

  // 4. Show final anomaly count
  const finalCount = await prisma.anomaly.count();
  const newCount = await prisma.anomaly.count({ where: { status: 'new' } });
  console.log(`\n✅ Total anomalies: ${finalCount} (${newCount} new)`);

  console.log('\n🎉 Data fixes complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
