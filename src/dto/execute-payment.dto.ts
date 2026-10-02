import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType } from '../enums/transaction-type.enum';
import { PostingInstructionDto } from './posting-instruction.dto';
import { IExecutePaymentCommand } from '../interfaces/execute-payment-command.interface';

export class ExecutePaymentDto {
  @ApiProperty({
    description: 'Unique idempotency key for the request',
    example: 'pay_tx_9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiProperty({
    description: 'Type of business transaction',
    enum: TransactionType,
    example: TransactionType.PAY_IN,
  })
  @IsString()
  @IsNotEmpty()
  transactionType: TransactionType | string;

  @ApiProperty({
    description: 'Array of double-entry postings composing the transaction',
    type: [PostingInstructionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostingInstructionDto)
  postings: PostingInstructionDto[];

  @ApiPropertyOptional({
    description: 'Transaction description or reference note',
    example: 'Custom transaction batch',
  })
  @IsString()
  @IsOptional()
  description?: string;

  toCommand(): IExecutePaymentCommand {
    return {
      idempotencyKey: this.idempotencyKey,
      transactionType: this.transactionType,
      description: this.description,
      postings: this.postings.map((p) => ({
        sequenceNumber: p.sequenceNumber,
        debitAccountId: p.debitAccountId,
        creditAccountId: p.creditAccountId,
        amount: BigInt(p.amount),
        currency: p.currency,
      })),
    };
  }
}

