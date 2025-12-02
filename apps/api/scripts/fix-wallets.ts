/**
 * Fix users without wallets
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Finding users without wallets...');
  
  // Find users without wallets
  const usersWithoutWallets = await prisma.user.findMany({
    where: { wallet: null },
    select: { id: true, username: true, phoneLastFour: true }
  });
  
  console.log(`Found ${usersWithoutWallets.length} users without wallets:`);
  
  if (usersWithoutWallets.length === 0) {
    console.log('All users have wallets!');
    return;
  }
  
  for (const user of usersWithoutWallets) {
    console.log(`  - ${user.username || '(no username)'} (***-***-${user.phoneLastFour})`);
  }
  
  // Create wallets for them
  console.log('\nCreating wallets...');
  for (const user of usersWithoutWallets) {
    await prisma.wallet.create({
      data: {
        userId: user.id,
        balance: BigInt(100), // Give them $100 to start
        totalLoaded: BigInt(100),
      }
    });
    console.log(`  ✓ Created wallet for: ${user.username || user.phoneLastFour}`);
  }
  
  console.log('\n✅ Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

