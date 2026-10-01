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
      SELECT 
        a.id, 
        a.number,
        a.currency,
        a.balance::text AS stored_balance,
        (COALESCE(c.credits_sum, 0) - COALESCE(d.debits_sum, 0))::text AS calculated_balance,
        (a.balance - (COALESCE(c.credits_sum, 0) - COALESCE(d.debits_sum, 0)))::text AS discrepancy
      FROM accounts a
      LEFT JOIN (
        SELECT credit_account_id, SUM(amount) AS credits_sum 
        FROM ledger_postings 
        GROUP BY credit_account_id
      ) c ON a.id = c.credit_account_id
      LEFT JOIN (
        SELECT debit_account_id, SUM(amount) AS debits_sum 
        FROM ledger_postings 
        GROUP BY debit_account_id
      ) d ON a.id = d.debit_account_id
      WHERE a.balance != (COALESCE(c.credits_sum, 0) - COALESCE(d.debits_sum, 0));
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
