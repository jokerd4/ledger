import { DataSource } from 'typeorm';
import { typeOrmConfig } from '../config/typeorm.config';

async function seedMany() {
  const dataSource = new DataSource(typeOrmConfig);
  console.log(`Connecting to PostgreSQL via TypeORM at ${process.env.DB_HOST}:${process.env.DB_PORT}...`);
  await dataSource.initialize();

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  
  console.log('Seeding 10,000 randomized client accounts...');
  
  await queryRunner.startTransaction();
  try {
    // Generate 10,000 accounts using PostgreSQL generate_series to be ultra fast
    await queryRunner.query(`
      INSERT INTO accounts (number, type, currency, balance, allow_negative, updated_at)
      SELECT 
        'CLIENT_RND_' || i || '_USD', 
        'CLIENT', 
        'USD', 
        100000, -- Give everyone $1000 to avoid overdrafts
        false,
        clock_timestamp()
      FROM generate_series(1, 10000) AS i
      ON CONFLICT (number) DO NOTHING;
    `);

    // Give them money via double-entry from Issuance account
    // For simplicity of the benchmark, we already set balance = 100000 in the INSERT above,
    // which technically breaks strict double-entry history for these test accounts.
    // However, since this is strictly for a concurrency benchmark and not an audit test,
    // this is acceptable. If we wanted strict audit, we would insert 10,000 ledger_postings here.
    
    await queryRunner.commitTransaction();
    console.log('Successfully seeded 10,000 accounts.');
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('Failed to seed:', err);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

seedMany().catch(console.error);
