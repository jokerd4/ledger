/**
 * Canonical System Account codes following financial Chart of Accounts principles.
 * System accounts are internal ledger entities representing transit, equity, clearing,
 * fees, tax, reserves, and revenue domains.
 */
export enum SystemAccountCode {
  // Equity & Central Issuance
  SYSTEM_ISSUANCE = 'SYSTEM_ISSUANCE',

  // Providers & Clearing
  PROV_MAIN = 'PROV_MAIN',
  INFRA_CLEARING = 'INFRA_CLEARING',
  BANK_ESCROW = 'BANK_ESCROW',

  // Revenue & Income
  REVENUE = 'REVENUE',
  NET_INCOME = 'NET_INCOME',

  // System Fees & Taxes
  PROVIDER_FEE = 'PROV_FEE',
  TECH_FEE = 'TECH_FEE',
  TAX_VAT = 'TAX_VAT',

  // Affiliate Networks
  AFFILIATE_PROVIDER_1 = 'AFF_PROV_1',
  AFFILIATE_PROVIDER_2 = 'AFF_PROV_2',
  AFFILIATE_MERCHANT_1 = 'AFF_MERCH_1',
  AFFILIATE_MERCHANT_2 = 'AFF_MERCH_2',

  // Reserves & Protection
  ROLLING_RESERVE = 'ROLLING_RESERVE',
  DISPUTE_COVER = 'DISPUTE_COVER',
}

/**
 * Builds canonical account number for system accounts following domain format:
 * [CODE]_[CURRENCY] (e.g. REVENUE_USD, PROV_FEE_USD, TAX_VAT_USD).
 */
export function getSystemAccountNumber(code: SystemAccountCode, currency: string): string {
  return `${code}_${currency.toUpperCase()}`;
}

/**
 * Builds domain-hierarchical system account number for fine-grained segmentation:
 * [CODE]_[DOMAIN]_[CURRENCY] (e.g. REVENUE_ACQUIRING_STRIPE_USD).
 * Used when scaling high-volume accounts across specific payment channels or providers.
 */
export function getHierarchicalAccountNumber(
  code: SystemAccountCode,
  currency: string,
  businessDomain?: string,
): string {
  const curr = currency.toUpperCase();
  if (businessDomain) {
    return `${code}_${businessDomain.toUpperCase()}_${curr}`;
  }
  return `${code}_${curr}`;
}
