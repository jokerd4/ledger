import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, IsPositive, IsOptional } from 'class-validator';

export class PayInDto {
  @ApiProperty({
    description: 'Unique idempotency key for the payment',
    example: 'payin_order_1001',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiProperty({
    description: 'Account UUID or account number of the payer',
    example: 'CLIENT_ALICE_USD',
  })
  @IsString()
  @IsNotEmpty()
  payerAccountId: string;

  @ApiProperty({
    description: 'Account UUID or account number of the merchant',
    example: 'MERCH_ALPHA_USD',
  })
  @IsString()
  @IsNotEmpty()
  merchantAccountId: string;

  @ApiProperty({
    description: 'Account UUID or account number of the payment provider/acquirer',
    example: 'PROV_MAIN_USD',
  })
  @IsString()
  @IsNotEmpty()
  providerAccountId: string;

  @ApiProperty({
    description: 'Payment amount in minor currency units (cents: 10000 = $100.00)',
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

  @ApiPropertyOptional({
    description: 'Payment description or order details',
    example: 'Order #1042 payment',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
