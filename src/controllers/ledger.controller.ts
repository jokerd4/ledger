import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  LedgerService,
  PaymentService,
  AccountService,
  ReconciliationService,
} from '../services';
import { ExecutePaymentDto } from '../dto/execute-payment.dto';
import { PayInDto } from '../dto/pay-in.dto';
import { PayOutDto } from '../dto/pay-out.dto';
import {
  ApiExecutePayIn,
  ApiExecutePayOut,
  ApiExecuteTransaction,
  ApiGetAccount,
  ApiGetAccountStatement,
  ApiGetTransactionDetails,
  ApiRunAudit,
} from './ledger.swagger';

@ApiTags('Ledger')
@Controller('api/ledger')
export class LedgerController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly ledgerService: LedgerService,
    private readonly accountService: AccountService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  @Post('pay-in')
  @HttpCode(HttpStatus.OK)
  @ApiExecutePayIn()
  async executePayIn(@Body() dto: PayInDto) {
    return this.paymentService.executePayIn(dto);
  }

  @Post('pay-out')
  @HttpCode(HttpStatus.OK)
  @ApiExecutePayOut()
  async executePayOut(@Body() dto: PayOutDto) {
    return this.paymentService.executePayOut(dto);
  }

  @Post('transactions')
  @HttpCode(HttpStatus.OK)
  @ApiExecuteTransaction()
  async executeTransaction(@Body() dto: ExecutePaymentDto) {
    const postings = dto.postings.map((p) => ({
      sequenceNumber: p.sequenceNumber,
      debitAccountId: p.debitAccountId,
      creditAccountId: p.creditAccountId,
      amount: BigInt(p.amount),
      currency: p.currency,
    }));

    return this.ledgerService.executeTransaction({
      idempotencyKey: dto.idempotencyKey,
      transactionType: dto.transactionType,
      postings,
      description: dto.description,
    });
  }

  @Get('transactions/:identifier')
  @ApiGetTransactionDetails()
  async getTransaction(@Param('identifier') identifier: string) {
    return this.ledgerService.getTransactionDetails(identifier);
  }

  @Get('accounts/:identifier')
  @ApiGetAccount()
  async getAccount(@Param('identifier') identifier: string) {
    return this.accountService.getAccount(identifier);
  }

  @Get('accounts/:id/statement')
  @ApiGetAccountStatement()
  async getAccountStatement(
    @Param('id') id: string,
    @Query('limit') limit?: string
  ) {
    let parsedLimit: number | undefined;
    if (limit) {
      const num = parseInt(limit, 10);
      if (Number.isInteger(num) && num > 0) {
        parsedLimit = Math.min(num, 500);
      }
    }
    return this.accountService.getAccountStatement(id, parsedLimit);
  }

  @Get('reconcile')
  @ApiRunAudit()
  async runAudit() {
    return this.reconciliationService.runAudit();
  }
}
