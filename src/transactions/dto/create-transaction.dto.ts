import { TransactionBaseDto } from './transaction.base.dto'
import { Type } from 'class-transformer'
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator'

export class CreateTransactionDto extends TransactionBaseDto {

  @ValidateIf(
    (dto: CreateTransactionDto, value: string | undefined) =>
      value !== undefined || dto.type === 'buy' || dto.type === 'dividend',
  )
  @IsUUID()
  override assetId?: string

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  override amount!: number

  @ValidateIf(
    (dto: CreateTransactionDto, value: number | undefined) =>
      value !== undefined || dto.type === 'buy',
  )
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  override quantity?: number

  @ValidateIf(
    (dto: CreateTransactionDto, value: number | undefined) =>
      value !== undefined || dto.type === 'buy',
  )
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  override price?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  override fee?: number
}
