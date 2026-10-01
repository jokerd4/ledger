export interface IPaymentExecutionResult {
  transactionId: string;
  status: string;
  idempotencyKey: string;
  isCached: boolean;
  postingsCount: number;
  affectedAccountsCount: number;
}
