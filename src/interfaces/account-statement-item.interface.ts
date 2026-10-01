export interface IAccountStatementItem {
  posting_id: string;
  sequence_number: number;
  transaction_id: string;
  idempotency_key: string;
  transaction_type: string;
  debit_account_id: string;
  debit_account_number: string;
  credit_account_id: string;
  credit_account_number: string;
  amount: string;
  currency: string;
  created_at: Date;
  direction: 'DEBIT' | 'CREDIT';
}
