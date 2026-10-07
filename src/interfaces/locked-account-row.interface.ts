export interface LockedAccountRow {
  id: string;
  number: string;
  currency: string;
  balance: string; // BIGINT is returned as string by node-postgres
  allow_negative: boolean;
}
