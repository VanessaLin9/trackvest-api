import { IsOptional, IsBoolean, IsNumber, Min, IsEnum, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { TxType } from '@prisma/client';

export class QueryTransactionsDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includeDeleted?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsEnum(TxType)
  type?: TxType;
}
