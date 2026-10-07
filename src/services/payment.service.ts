import { Injectable } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { PayInDto } from '../dto/pay-in.dto';
import { PayOutDto } from '../dto/pay-out.dto';
import { IPaymentExecutionResult } from '../interfaces/payment-execution-result.interface';
import { IPostingInstruction } from '../interfaces/posting-instruction.interface';
import { TransactionType } from '../enums/transaction-type.enum';
import { DEFAULT_FEES, BPS_DIVISOR } from '../constants/fee.constants';

@Injectable()
export class PaymentService {
  constructor(
    private readonly ledgerService: LedgerService,
  ) {}

  // Constructs and executes canonical 14-posting Pay-In chain.
  async executePayIn(dto: PayInDto): Promise<IPaymentExecutionResult> {
    const grossAmount = BigInt(dto.amount);
    const currency = dto.currency.toUpperCase();

    const revenueAccountId = `REVENUE_${currency}`;

    const totalFee = (grossAmount * DEFAULT_FEES.PLATFORM_TOTAL_BPS) / BPS_DIVISOR;
    const providerFee = (grossAmount * DEFAULT_FEES.PROVIDER_BPS) / BPS_DIVISOR;
    const affProv1 = (grossAmount * DEFAULT_FEES.AFFILIATE_PROVIDER_1_BPS) / BPS_DIVISOR;
    const affProv2 = (grossAmount * DEFAULT_FEES.AFFILIATE_PROVIDER_2_BPS) / BPS_DIVISOR;
    const affMerch1 = (grossAmount * DEFAULT_FEES.AFFILIATE_MERCHANT_1_BPS) / BPS_DIVISOR;
    const affMerch2 = (grossAmount * DEFAULT_FEES.AFFILIATE_MERCHANT_2_BPS) / BPS_DIVISOR;
    const netIncome = totalFee - (providerFee + affProv1 + affProv2 + affMerch1 + affMerch2);
    const rollingReserve = (grossAmount * DEFAULT_FEES.ROLLING_RESERVE_BPS) / BPS_DIVISOR;
    const vatAmount = (providerFee * DEFAULT_FEES.VAT_BPS) / BPS_DIVISOR;
    const techFee = DEFAULT_FEES.TECH_FEE_AMOUNT;

    const rawPostings: Omit<IPostingInstruction, 'sequenceNumber'>[] = [
      { debitAccountId: dto.payerAccountId, creditAccountId: dto.providerAccountId, amount: grossAmount, currency },
      { debitAccountId: dto.providerAccountId, creditAccountId: dto.merchantAccountId, amount: grossAmount, currency },
      { debitAccountId: dto.merchantAccountId, creditAccountId: revenueAccountId, amount: totalFee, currency },
      { debitAccountId: revenueAccountId, creditAccountId: `PROV_FEE_${currency}`, amount: providerFee, currency },
      { debitAccountId: revenueAccountId, creditAccountId: `AFF_PROV_1_${currency}`, amount: affProv1, currency },
      { debitAccountId: revenueAccountId, creditAccountId: `AFF_PROV_2_${currency}`, amount: affProv2, currency },
      { debitAccountId: revenueAccountId, creditAccountId: `AFF_MERCH_1_${currency}`, amount: affMerch1, currency },
      { debitAccountId: revenueAccountId, creditAccountId: `AFF_MERCH_2_${currency}`, amount: affMerch2, currency },
      { debitAccountId: revenueAccountId, creditAccountId: `NET_INCOME_${currency}`, amount: netIncome, currency },
      { debitAccountId: dto.merchantAccountId, creditAccountId: `ROLLING_RESERVE_${currency}`, amount: rollingReserve, currency },
      { debitAccountId: `ROLLING_RESERVE_${currency}`, creditAccountId: `BANK_ESCROW_${currency}`, amount: rollingReserve, currency },
      { debitAccountId: `PROV_FEE_${currency}`, creditAccountId: `TAX_VAT_${currency}`, amount: vatAmount, currency },
      { debitAccountId: dto.merchantAccountId, creditAccountId: `TECH_FEE_${currency}`, amount: techFee, currency },
      { debitAccountId: `TECH_FEE_${currency}`, creditAccountId: `INFRA_CLEARING_${currency}`, amount: techFee, currency },
    ];

    const postings: IPostingInstruction[] = rawPostings
      .filter((p) => p.amount > 0n)
      .map((p, index) => ({
        ...p,
        sequenceNumber: index + 1,
      }));

    return this.ledgerService.executeTransaction({
      idempotencyKey: dto.idempotencyKey,
      transactionType: TransactionType.PAY_IN,
      postings,
      description: dto.description || `Pay-In gross: ${grossAmount} ${currency}`,
    });
  }

  // Constructs and executes merchant payout (Pay-Out).
  async executePayOut(dto: PayOutDto): Promise<IPaymentExecutionResult> {
    const amount = BigInt(dto.amount);
    const currency = dto.currency.toUpperCase();

    const revenueAccountId = `REVENUE_${currency}`;

    const payoutFee = DEFAULT_FEES.PAYOUT_FIXED_FEE;

    const rawPostings: Omit<IPostingInstruction, 'sequenceNumber'>[] = [
      { debitAccountId: dto.merchantAccountId, creditAccountId: dto.providerAccountId, amount, currency },
      { debitAccountId: dto.providerAccountId, creditAccountId: dto.recipientAccountId, amount, currency },
      { debitAccountId: dto.merchantAccountId, creditAccountId: revenueAccountId, amount: payoutFee, currency },
    ];

    const postings: IPostingInstruction[] = rawPostings
      .filter((p) => p.amount > 0n)
      .map((p, index) => ({
        ...p,
        sequenceNumber: index + 1,
      }));

    return this.ledgerService.executeTransaction({
      idempotencyKey: dto.idempotencyKey,
      transactionType: TransactionType.PAY_OUT,
      postings,
      description: dto.description || `Pay-Out amount: ${amount} ${currency}`,
    });
  }
}
