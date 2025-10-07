import { IsString, IsNumber, IsOptional, IsDateString, IsEnum, IsUUID, Min } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { TxType } from '@prisma/client'

export class CreateTransactionDto {
  @ApiProperty({ description: 'Account ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  accountId: string

  @ApiPropertyOptional({ description: 'Asset ID (optional for cash transactions)', example: '123e4567-e89b-12d3-a456-426614174001' })
  @IsOptional()
  @IsUUID()
  assetId?: string

  @ApiProperty({ description: 'Transaction type', enum: TxType, example: 'buy' })
  @IsEnum(TxType)
  type: TxType

  @ApiProperty({ description: 'Transaction amount', example: 1000.50 })
  @IsNumber()
  @Min(0)
  amount: number

  @ApiPropertyOptional({ description: 'Quantity of assets (for buy/sell transactions)', example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number

  @ApiPropertyOptional({ description: 'Price per unit (for buy/sell transactions)', example: 100.05 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number

  @ApiPropertyOptional({ description: 'Transaction fee', example: 5.00 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number

  @ApiProperty({ description: 'Trade time (ISO 8601 format)', example: '2024-01-15T10:30:00Z' })
  @IsDateString()
  tradeTime: string

  @ApiPropertyOptional({ description: 'Optional note about the transaction', example: 'Monthly investment' })
  @IsOptional()
  @IsString()
  note?: string
}
