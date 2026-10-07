import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('=== Database Statistics ===\n');

  try {
    // 1. Database-level stats (deadlocks, rollbacks, commits)
    const dbStats = await dataSource.query(`
      SELECT 
        xact_commit, 
        xact_rollback, 
        deadlocks, 
        blks_read, 
        blks_hit 
      FROM pg_stat_database 
      WHERE datname = current_database();
    `);
    console.log('--- Transaction & Cache Stats ---');
    console.table(dbStats);

    // 2. Table-level stats (row inserts, updates, dead tuples, seq scans vs idx scans)
    const tableStats = await dataSource.query(`
      SELECT 
        relname AS table_name,
        seq_scan,
        seq_tup_read,
        idx_scan,
        idx_tup_fetch,
        n_tup_ins AS inserted_rows,
        n_tup_upd AS updated_rows,
        n_live_tup AS live_rows,
        n_dead_tup AS dead_rows
      FROM pg_stat_user_tables
      ORDER BY n_tup_ins DESC;
    `);
    console.log('\n--- Table Usage & Scans ---');
    console.table(tableStats);

    // 3. Index usage stats
    const indexStats = await dataSource.query(`
      SELECT 
        relname AS table_name,
        indexrelname AS index_name,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC;
    `);
    console.log('\n--- Index Effectiveness ---');
    console.table(indexStats);

    // 4. pg_stat_statements (if extension is enabled, for query timings)
    try {
      const queryStats = await dataSource.query(`
        SELECT 
          query, 
          calls, 
          total_exec_time / calls AS avg_time_ms,
          rows
        FROM pg_stat_statements
        JOIN pg_roles r ON r.oid = userid
        WHERE r.rolname = current_user
        ORDER BY total_exec_time DESC
        LIMIT 5;
      `);
      if (queryStats.length > 0) {
        console.log('\n--- Top 5 Slowest Queries (pg_stat_statements) ---');
        console.table(queryStats.map((q: any) => ({
          query: q.query.substring(0, 60) + '...',
          calls: q.calls,
          avg_time_ms: parseFloat(q.avg_time_ms).toFixed(3),
          rows: q.rows
        })));
      }
    } catch (e) {
      console.log('\n(pg_stat_statements is not enabled or accessible)');
    }

  } catch (err) {
    console.error('Error fetching stats:', err);
  }

  await app.close();
}

bootstrap();
