import { AccountType } from '../enums/account-type.enum';

export interface IAccountResponse {
  id: string;
  number: string;
  type: AccountType | string;
  currency: string;
  balance: string;
  allowNegative: boolean;
  bucketGroup: string | null;
  consolidatedGroupBalance: string | null;
  updatedAt: Date;
}
