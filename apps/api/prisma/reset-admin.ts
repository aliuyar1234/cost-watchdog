import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

async function main() {
  // Hash password using Argon2id
  const passwordHash = await hash('Admin123!', {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });

  // Delete and recreate admin user
  await prisma.user.deleteMany({
    where: { email: 'admin@example.com' },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      permissions: [],
      isActive: true,
    },
  });

  console.log('✅ Admin user reset successfully!');
  console.log('Email:    admin@example.com');
  console.log('Password: Admin123!');
  console.log('Hash:', passwordHash.substring(0, 50) + '...');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
