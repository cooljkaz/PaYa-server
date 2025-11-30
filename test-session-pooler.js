import { PrismaClient } from '@prisma/client';

const testConnection = async () => {
  // Session pooler (port 5432) - what you're seeing
  const sessionPoolerUrl = 'postgresql://postgres.iodokznmskiendlffkwf:NKgBKAJE1CPvItfU@aws-1-us-east-2.pooler.supabase.com:5432/postgres';
  
  console.log('Testing Session Pooler (port 5432)...');
  try {
    const prisma = new PrismaClient({ datasources: { db: { url: sessionPoolerUrl } } });
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Session pooler works!', result);
    await prisma.$disconnect();
  } catch (error) {
    console.log('❌ Session pooler failed:', error.message);
  }
};

testConnection();
