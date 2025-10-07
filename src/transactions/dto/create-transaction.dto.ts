import { IsString, IsNumber, IsOptional, IsDateString, IsEnum, IsUUID, Min } from 'class-validator';
import { TxType } from '@prisma/client';

export class CreateTransactionDto {
  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsEnum(TxType)
  type: TxType;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @IsDateString()
  tradeTime: string;

  @IsOptional()
  @IsString()
  note?: string;
}
