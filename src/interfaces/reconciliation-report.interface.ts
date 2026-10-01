export interface IDiscrepancyItem {
  accountId: string;
  accountNumber: string;
  currency: string;
  storedBalance: string;
  calculatedBalance: string;
  discrepancy: string;
}

export interface IReconciliationReport {
  checkedAt: Date;
  totalAccountsChecked: number;
  discrepanciesCount: number;
  status: 'HEALTHY' | 'CRITICAL_DISCREPANCY_DETECTED';
  discrepancies: IDiscrepancyItem[];
}
