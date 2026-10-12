import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class LedgerBatchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LedgerBatchWorker.name);
  private isRunning = false;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    this.isRunning = true;
    this.logger.log('Ledger Batch Worker initialized and listening for pending transactions...');
    // Launch worker loop asynchronously without blocking NestJS bootstrap
    void this.startWorkerLoop();
  }

  onModuleDestroy() {
    this.isRunning = false;
    this.logger.log('Ledger Batch Worker stopped.');
  }

  private async startWorkerLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        if (!this.dataSource.isInitialized) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        const result = await this.dataSource.query(
          'SELECT process_pending_ledger_transactions(1000) AS count'
        );
        const processedCount = Number(result[0]?.count ?? 0);

        if (processedCount > 0) {
          this.logger.log(`Processed batch of ${processedCount} pending ledger transactions.`);
          // If transactions were processed, immediately drain the next batch
          continue;
        }
      } catch (err) {
        this.logger.error('Batch worker execution error', err);
      }

      // If no transactions or an error occurred, wait 500ms before polling again
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
