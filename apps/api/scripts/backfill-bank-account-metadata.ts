/**
 * Backfill Bank Account Metadata
 * 
 * Marks all existing bank accounts as fake accounts (for testing).
 * Since all accounts in the database are test accounts, we mark them with isFake: true
 * so they work with the fake bank account service (instant loads/redeems).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillBankAccountMetadata() {
  console.log('Starting bank account metadata backfill...');
  console.log('Marking all existing accounts as fake (test accounts)...');

  try {
    // Get count of all bank accounts
    const totalAccounts = await prisma.bankAccount.count();
    console.log(`Found ${totalAccounts} total bank account(s)`);

    if (totalAccounts === 0) {
      console.log('✅ No bank accounts to backfill.');
      return;
    }

    // Update all accounts to mark them as fake
    // This ensures they work with the fake bank account service (instant loads/redeems)
    const result = await prisma.$executeRaw`
      UPDATE bank_accounts
      SET metadata = jsonb_build_object(
        'isFake', true,
        'createdFor', 'alpha_testing',
        'backfilled', true,
        'backfilledAt', NOW()
      )
      WHERE metadata IS NULL 
         OR metadata::text = 'null'
         OR (metadata->>'isFake')::boolean IS DISTINCT FROM true
    `;

    console.log(`✅ Updated ${result} bank account(s) to be marked as fake accounts`);

    // Verify the update
    const allAccounts = await prisma.bankAccount.findMany();
    const fakeAccounts = allAccounts.filter(acc => {
      const metadata = (acc as any).metadata as any;
      return metadata && metadata.isFake === true;
    });

    console.log(`✅ Verified: ${fakeAccounts.length} account(s) are now marked as fake`);

    // Check for any that might have been missed
    const accountsWithoutFakeFlag = allAccounts.filter(acc => {
      const metadata = (acc as any).metadata as any;
      return !metadata || metadata.isFake !== true;
    });

    if (accountsWithoutFakeFlag.length > 0) {
      console.warn(`⚠️  Warning: ${accountsWithoutFakeFlag.length} account(s) still not marked as fake:`);
      accountsWithoutFakeFlag.forEach(acc => {
        console.warn(`   - Account ID: ${acc.id}, Institution: ${acc.institutionName}`);
      });
    } else {
      console.log('✅ All bank accounts are now marked as fake accounts');
      console.log('   They will work with instant load/redeem via the fake bank account service');
    }

  } catch (error) {
    console.error('❌ Error during backfill:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the backfill
backfillBankAccountMetadata()
  .then(() => {
    console.log('Backfill completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });

