import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, Min, IsPositive } from 'class-validator';

export class PostingInstructionDto {
  @ApiProperty({
    description: 'Sequence number of the posting in the transaction chain (starting from 1)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  sequenceNumber: number;

  @ApiProperty({
    description: 'Account UUID of the debit account (source of funds)',
    example: '11111111-1111-1111-1111-111111111111',
  })
  @IsString()
  @IsNotEmpty()
  debitAccountId: string;

  @ApiProperty({
    description: 'Account UUID of the credit account (destination of funds)',
    example: '22222222-2222-2222-2222-222222222222',
  })
  @IsString()
  @IsNotEmpty()
  creditAccountId: string;

  @ApiProperty({
    description: 'Posting amount in minor currency units (cents: 10000 = $100.00)',
    example: 10000,
  })
  @IsInt()
  @IsPositive()
  amount: number;

  @ApiProperty({
    description: 'Currency code (ISO 4217)',
    example: 'USD',
  })
  @IsString()
  @IsNotEmpty()
  currency: string;
}
