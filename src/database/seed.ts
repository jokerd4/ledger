import { DataSource } from 'typeorm';
import { typeOrmConfig } from '../config/typeorm.config';
import { AccountEntity } from '../entities/account.entity';
import { LedgerTransactionEntity } from '../entities/ledger-transaction.entity';
import { LedgerPostingEntity } from '../entities/ledger-posting.entity';
import { AccountType } from '../enums/account-type.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionStatus } from '../enums/transaction-status.enum';
import { REVENUE_BUCKET_GROUP, DEFAULT_REVENUE_BUCKETS_COUNT } from '../constants/ledger.constants';

interface AccountSeedData {
  number: string;
  type: AccountType;
  currency: string;
  allowNegative: boolean;
  bucketGroup?: string;
}

async function seed() {
  const dataSource = new DataSource(typeOrmConfig);
  console.log(`Connecting to PostgreSQL via TypeORM at ${process.env.DB_HOST}:${process.env.DB_PORT}...`);
  await dataSource.initialize();

  const accountRepository = dataSource.getRepository(AccountEntity);
  const txRepository = dataSource.getRepository(LedgerTransactionEntity);
  const postingRepository = dataSource.getRepository(LedgerPostingEntity);

  const baseAccounts: AccountSeedData[] = [
    // 0. System Issuance / Equity (Central Bank / Capital injection)
    { number: 'SYSTEM_ISSUANCE_USD', type: AccountType.CLEARING, currency: 'USD', allowNegative: true },

    // 1. Clients
    { number: 'CLIENT_ALICE_USD', type: AccountType.CLIENT, currency: 'USD', allowNegative: false },
    { number: 'RECIPIENT_BOB_USD', type: AccountType.CLIENT, currency: 'USD', allowNegative: false },

    // 2. Providers (transit accounts)
    { number: 'PROV_MAIN_USD', type: AccountType.PROVIDER, currency: 'USD', allowNegative: true },

    // 3. Merchants
    { number: 'MERCH_ALPHA_USD', type: AccountType.MERCHANT, currency: 'USD', allowNegative: false },
    { number: 'MERCH_BETA_USD', type: AccountType.MERCHANT, currency: 'USD', allowNegative: false },

    // 4. System fee, reserve and clearing accounts
    { number: 'PROV_FEE_USD', type: AccountType.FEE, currency: 'USD', allowNegative: true },
    { number: 'AFF_PROV_1_USD', type: AccountType.AFFILIATE, currency: 'USD', allowNegative: true },
    { number: 'AFF_PROV_2_USD', type: AccountType.AFFILIATE, currency: 'USD', allowNegative: true },
    { number: 'AFF_MERCH_1_USD', type: AccountType.AFFILIATE, currency: 'USD', allowNegative: true },
    { number: 'AFF_MERCH_2_USD', type: AccountType.AFFILIATE, currency: 'USD', allowNegative: true },
    { number: 'NET_INCOME_USD', type: AccountType.NET_INCOME, currency: 'USD', allowNegative: true },
    { number: 'ROLLING_RESERVE_USD', type: AccountType.RESERVE, currency: 'USD', allowNegative: true },
    { number: 'BANK_ESCROW_USD', type: AccountType.CLEARING, currency: 'USD', allowNegative: true },
    { number: 'TAX_VAT_USD', type: AccountType.FEE, currency: 'USD', allowNegative: true },
    { number: 'TECH_FEE_USD', type: AccountType.FEE, currency: 'USD', allowNegative: true },
    { number: 'INFRA_CLEARING_USD', type: AccountType.CLEARING, currency: 'USD', allowNegative: true },
    { number: 'DISPUTE_COVER_USD', type: AccountType.DISPUTE, currency: 'USD', allowNegative: true },
  ];

  // 5. 16 Revenue shards (Account Bucketing)
  for (let i = 1; i <= DEFAULT_REVENUE_BUCKETS_COUNT; i++) {
    const bucketNumber = `REVENUE_USD_${String(i).padStart(2, '0')}`;
    baseAccounts.push({
      number: bucketNumber,
      type: AccountType.REVENUE,
      currency: 'USD',
      allowNegative: true,
      bucketGroup: REVENUE_BUCKET_GROUP,
    });
  }

  console.log(`Seeding ${baseAccounts.length} accounts using TypeORM...`);

  const accountMap = new Map<string, AccountEntity>();

  for (const accData of baseAccounts) {
    let acc = await accountRepository.findOne({ where: { number: accData.number } });
    if (!acc) {
      acc = accountRepository.create({
        number: accData.number,
        type: accData.type,
        currency: accData.currency,
        balance: 0n,
        allowNegative: accData.allowNegative,
        bucketGroup: accData.bucketGroup || null,
      });
    } else {
      acc.type = accData.type;
      acc.currency = accData.currency;
      acc.allowNegative = accData.allowNegative;
      acc.bucketGroup = accData.bucketGroup || null;
    }
    const saved = await accountRepository.save(acc);
    accountMap.set(saved.number, saved);
  }

  // 6. Double-entry initial capital issuance to seed demo balances
  const seedIdempotencyKey = 'INITIAL_SEED_CAPITAL_USD';
  const existingSeedTx = await txRepository.findOne({ where: { idempotencyKey: seedIdempotencyKey } });

  if (!existingSeedTx) {
    console.log('Issuing initial seed capital via canonical double-entry transaction...');
    const issuanceAcc = accountMap.get('SYSTEM_ISSUANCE_USD')!;
    const aliceAcc = accountMap.get('CLIENT_ALICE_USD')!;
    const merchAlphaAcc = accountMap.get('MERCH_ALPHA_USD')!;
    const merchBetaAcc = accountMap.get('MERCH_BETA_USD')!;

    const seedTx = txRepository.create({
      idempotencyKey: seedIdempotencyKey,
      type: TransactionType.ADJUSTMENT,
      status: TransactionStatus.POSTED,
      description: 'Initial seed capital issuance for testing and demo',
    });
    const savedTx = await txRepository.save(seedTx);

    const initialDistributions = [
      { target: aliceAcc, amount: 500000n },      // $5,000.00
      { target: merchAlphaAcc, amount: 100000n },  // $1,000.00
      { target: merchBetaAcc, amount: 50000n },    // $500.00
    ];

    let totalIssued = 0n;
    const postings: LedgerPostingEntity[] = [];

    for (let i = 0; i < initialDistributions.length; i++) {
      const { target, amount } = initialDistributions[i];
      totalIssued += amount;

      const posting = postingRepository.create({
        transactionId: savedTx.id,
        sequenceNumber: i + 1,
        debitAccountId: issuanceAcc.id,
        creditAccountId: target.id,
        amount,
        currency: 'USD',
      });
      postings.push(posting);

      target.balance = BigInt(target.balance) + amount;
      await accountRepository.save(target);
    }

    issuanceAcc.balance = BigInt(issuanceAcc.balance) - totalIssued;
    await accountRepository.save(issuanceAcc);
    await postingRepository.save(postings);

    console.log(`Initial capital issued: ${totalIssued} cents across ${initialDistributions.length} accounts.`);
  }

  console.log('Seeding completed successfully!');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
