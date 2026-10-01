import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, IsPositive, IsOptional } from 'class-validator';

export class PayOutDto {
  @ApiProperty({
    description: 'Unique idempotency key for the payout',
    example: 'payout_req_5001',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiProperty({
    description: 'Account UUID or account number of the merchant initiating the payout',
    example: 'MERCH_ALPHA_USD',
  })
  @IsString()
  @IsNotEmpty()
  merchantAccountId: string;

  @ApiProperty({
    description: 'Account UUID or account number of the payout provider (transit account)',
    example: 'PROV_MAIN_USD',
  })
  @IsString()
  @IsNotEmpty()
  providerAccountId: string;

  @ApiProperty({
    description: 'Account UUID or account number of the recipient',
    example: 'RECIPIENT_BOB_USD',
  })
  @IsString()
  @IsNotEmpty()
  recipientAccountId: string;

  @ApiProperty({
    description: 'Payout amount in minor currency units (cents: 15000 = $150.00)',
    example: 15000,
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

  @ApiPropertyOptional({
    description: 'Payout description or reference note',
    example: 'Payout to contractor',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
