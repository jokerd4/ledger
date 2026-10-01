import { TransactionType } from '../enums/transaction-type.enum';
import { IPostingInstruction } from './posting-instruction.interface';

export interface IExecutePaymentCommand {
  idempotencyKey: string;
  transactionType: TransactionType | string;
  postings: IPostingInstruction[];
  description?: string;
}
