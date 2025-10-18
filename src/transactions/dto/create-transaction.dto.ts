import { TxType } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsDateString, IsDecimal, IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator'

export class CreateTransactionDto {

  @IsUUID()
  accountId: string

  @IsOptional()
  @IsUUID()
  assetId?: string

  @IsEnum(TxType)
  type: TxType

  @Type(() => Number)
  @IsNumber()
  amount: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quantity?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fee?: number

  @IsOptional()
  @IsDateString()
  tradeTime?: string

  @IsOptional()
  @IsString()
  note?: string
}
