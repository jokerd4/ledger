import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IReconciliationReport } from '../interfaces/reconciliation-report.interface';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly dataSource: DataSource) { }

  // Reconciles materialized balances against posting history
  async runAudit(): Promise<IReconciliationReport> {
    const query = `
      WITH posting_deltas AS (
        SELECT 
          v.account_id,
          SUM(v.delta) AS net_delta
        FROM ledger_postings p
        JOIN ledger_transactions t ON t.id = p.transaction_id
        CROSS JOIN LATERAL (
          VALUES 
            (p.credit_account_id, p.amount),
            (p.debit_account_id, -p.amount)
        ) AS v(account_id, delta)
        WHERE t.status = 'POSTED'
        GROUP BY v.account_id
      )
      SELECT 
        a.id, 
        a.number,
        a.currency,
        a.balance::text AS stored_balance,
        COALESCE(pd.net_delta, 0)::text AS calculated_balance,
        (a.balance - COALESCE(pd.net_delta, 0))::text AS discrepancy
      FROM accounts a
      LEFT JOIN posting_deltas pd ON a.id = pd.account_id
      WHERE a.balance != COALESCE(pd.net_delta, 0);
    `;

    const countRows = await this.dataSource.query('SELECT COUNT(*)::int AS count FROM accounts');
    const totalAccountsChecked = parseInt(countRows[0].count, 10);

    const discrepancies = await this.dataSource.query(query);

    const report: IReconciliationReport = {
      checkedAt: new Date(),
      totalAccountsChecked,
      discrepanciesCount: discrepancies.length,
      status: discrepancies.length === 0 ? 'HEALTHY' : 'CRITICAL_DISCREPANCY_DETECTED',
      discrepancies: discrepancies.map((row: any) => ({
        accountId: row.id,
        accountNumber: row.number,
        currency: row.currency,
        storedBalance: row.stored_balance,
        calculatedBalance: row.calculated_balance,
        discrepancy: row.discrepancy,
      })),
    };

    if (report.status === 'HEALTHY') {
      this.logger.log(`Audit PASSED: All ${totalAccountsChecked} accounts matched sum of postings exactly.`);
    } else {
      this.logger.error(`CRITICAL AUDIT ALERT: Found ${discrepancies.length} discrepancy accounts!`);
    }

    return report;
  }
}
