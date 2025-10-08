// src/transactions/dto/find-transactions.dto.ts
import { IsBooleanString, IsISO8601, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class FindTransactionsDto {
  @IsOptional()
  @IsUUID()
  accountId?: string

  @IsOptional()
  @IsUUID()
  assetId?: string

  // 預設不含軟刪；?includeDeleted=true 才會含
  @IsOptional()
  @IsBooleanString()
  includeDeleted?: 'true' | 'false'

  // 時間區間（可選）
  @IsOptional()
  @IsISO8601()
  from?: string

  @IsOptional()
  @IsISO8601()
  to?: string

  // 簡單分頁
  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(0)
  skip?: number = 0

  @IsOptional()
  @Type(() => Number)
  @IsInt() @Min(1) @Max(200)
  take?: number = 50
}
