export interface IPostingInstruction {
  sequenceNumber: number;
  debitAccountId: string;
  creditAccountId: string;
  amount: bigint;
  currency: string;
}
