import { DataSource } from 'typeorm';
import { typeOrmConfig } from '../config/typeorm.config';
import { AccountEntity } from '../entities/account.entity';
import { LedgerTransactionEntity } from '../entities/ledger-transaction.entity';
import { LedgerPostingEntity } from '../entities/ledger-posting.entity';
import { AccountType } from '../enums/account-type.enum';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionStatus } from '../enums/transaction-status.enum';
import { SystemAccountCode, getSystemAccountNumber } from '../constants/system-account.constants';

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
  await dataSource.query('ALTER TABLE accounts SET (fillfactor = 70);').catch(() => {});

  const accountRepository = dataSource.getRepository(AccountEntity);
  const txRepository = dataSource.getRepository(LedgerTransactionEntity);
  const postingRepository = dataSource.getRepository(LedgerPostingEntity);

  const baseAccounts: AccountSeedData[] = [
    // 0. System Issuance / Equity (Central Bank / Capital injection)
    { number: getSystemAccountNumber(SystemAccountCode.SYSTEM_ISSUANCE, 'USD'), type: AccountType.CLEARING, currency: 'USD', allowNegative: true },

    // 1. Clients
    { number: 'CLIENT_ALICE_USD', type: AccountType.CLIENT, currency: 'USD', allowNegative: false },
    { number: 'CLIENT_BOB_USD', type: AccountType.CLIENT, currency: 'USD', allowNegative: false },
    { number: 'RECIPIENT_BOB_USD', type: AccountType.CLIENT, currency: 'USD', allowNegative: false },

    // 2. Providers (transit accounts)
    { number: getSystemAccountNumber(SystemAccountCode.PROV_MAIN, 'USD'), type: AccountType.PROVIDER, currency: 'USD', allowNegative: true },

    // 3. Merchants
    { number: 'MERCH_ALPHA_USD', type: AccountType.MERCHANT, currency: 'USD', allowNegative: false },
    { number: 'MERCH_BETA_USD', type: AccountType.MERCHANT, currency: 'USD', allowNegative: false },

    // 4. System Revenue and P&L accounts (single canonical accounts per currency)
    { number: getSystemAccountNumber(SystemAccountCode.REVENUE, 'USD'), type: AccountType.REVENUE, currency: 'USD', allowNegative: true },
    { number: getSystemAccountNumber(SystemAccountCode.NET_INCOME, 'USD'), type: AccountType.NET_INCOME, currency: 'USD', allowNegative: true },

    // 5. System fee, tax, reserve and clearing accounts
    { number: getSystemAccountNumber(SystemAccountCode.PROVIDER_FEE, 'USD'), type: AccountType.FEE, currency: 'USD', allowNegative: true },
    { number: getSystemAccountNumber(SystemAccountCode.AFFILIATE_PROVIDER_1, 'USD'), type: AccountType.AFFILIATE, currency: 'USD', allowNegative: true },
    { number: getSystemAccountNumber(SystemAccountCode.AFFILIATE_PROVIDER_2, 'USD'), type: AccountType.AFFILIATE, currency: 'USD', allowNegative: true },
    { number: getSystemAccountNumber(SystemAccountCode.AFFILIATE_MERCHANT_1, 'USD'), type: AccountType.AFFILIATE, currency: 'USD', allowNegative: true },
    { number: getSystemAccountNumber(SystemAccountCode.AFFILIATE_MERCHANT_2, 'USD'), type: AccountType.AFFILIATE, currency: 'USD', allowNegative: true },
    { number: getSystemAccountNumber(SystemAccountCode.ROLLING_RESERVE, 'USD'), type: AccountType.RESERVE, currency: 'USD', allowNegative: true },
    { number: getSystemAccountNumber(SystemAccountCode.BANK_ESCROW, 'USD'), type: AccountType.CLEARING, currency: 'USD', allowNegative: true },
    { number: getSystemAccountNumber(SystemAccountCode.TAX_VAT, 'USD'), type: AccountType.FEE, currency: 'USD', allowNegative: true },
    { number: getSystemAccountNumber(SystemAccountCode.TECH_FEE, 'USD'), type: AccountType.FEE, currency: 'USD', allowNegative: true },
    { number: getSystemAccountNumber(SystemAccountCode.INFRA_CLEARING, 'USD'), type: AccountType.CLEARING, currency: 'USD', allowNegative: true },
    { number: getSystemAccountNumber(SystemAccountCode.DISPUTE_COVER, 'USD'), type: AccountType.DISPUTE, currency: 'USD', allowNegative: true },
  ];

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
  const issuanceAcc = accountMap.get(getSystemAccountNumber(SystemAccountCode.SYSTEM_ISSUANCE, 'USD'))!;

  const initialDistributions = [
    { key: 'INITIAL_SEED_CAPITAL_ALICE_USD', targetNumber: 'CLIENT_ALICE_USD', amount: 500000n }, // $5,000.00
    { key: 'INITIAL_SEED_CAPITAL_BOB_USD', targetNumber: 'CLIENT_BOB_USD', amount: 500000n },     // $5,000.00
    { key: 'INITIAL_SEED_CAPITAL_REC_BOB_USD', targetNumber: 'RECIPIENT_BOB_USD', amount: 500000n }, // $5,000.00
    { key: 'INITIAL_SEED_CAPITAL_MERCH_A_USD', targetNumber: 'MERCH_ALPHA_USD', amount: 100000n }, // $1,000.00
    { key: 'INITIAL_SEED_CAPITAL_MERCH_B_USD', targetNumber: 'MERCH_BETA_USD', amount: 50000n },  // $500.00
  ];

  for (const dist of initialDistributions) {
    const existingSeedTx = await txRepository.findOne({ where: { idempotencyKey: dist.key } });
    if (existingSeedTx) continue;

    // Check if previous legacy key was used for Alice / Merch
    if (dist.key === 'INITIAL_SEED_CAPITAL_ALICE_USD') {
      const legacyTx = await txRepository.findOne({ where: { idempotencyKey: 'INITIAL_SEED_CAPITAL_USD' } });
      if (legacyTx) continue;
    }
    if (dist.key === 'INITIAL_SEED_CAPITAL_MERCH_A_USD' || dist.key === 'INITIAL_SEED_CAPITAL_MERCH_B_USD') {
      const legacyTx = await txRepository.findOne({ where: { idempotencyKey: 'INITIAL_SEED_CAPITAL_USD' } });
      if (legacyTx) continue;
    }

    const target = accountMap.get(dist.targetNumber)!;
    console.log(`Issuing seed capital for ${dist.targetNumber}: ${dist.amount} cents via double-entry...`);

    const seedTx = txRepository.create({
      idempotencyKey: dist.key,
      type: TransactionType.ADJUSTMENT,
      status: TransactionStatus.POSTED,
      description: `Initial seed capital issuance for ${dist.targetNumber}`,
    });
    const savedTx = await txRepository.save(seedTx);

    const posting = postingRepository.create({
      transactionId: savedTx.id,
      sequenceNumber: 1,
      debitAccountId: issuanceAcc.id,
      creditAccountId: target.id,
      amount: dist.amount,
      currency: 'USD',
    });
    await postingRepository.save(posting);

    target.balance = BigInt(target.balance) + dist.amount;
    await accountRepository.save(target);

    issuanceAcc.balance = BigInt(issuanceAcc.balance) - dist.amount;
    await accountRepository.save(issuanceAcc);
  }

  console.log('Seeding completed successfully!');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
