import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator'

export enum TaiwanPriceSyncModeDto {
  daily = 'daily',
  backfill = 'backfill',
}

export class SyncTaiwanPricesDto {
  @ApiPropertyOptional({
    enum: TaiwanPriceSyncModeDto,
    default: TaiwanPriceSyncModeDto.daily,
    description: 'daily = recent window; backfill = first buy → today for incomplete assets',
  })
  @IsOptional()
  @IsEnum(TaiwanPriceSyncModeDto)
  mode?: TaiwanPriceSyncModeDto

  @ApiPropertyOptional({ example: '2026-05-27' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string

  @ApiPropertyOptional({ example: '2026-06-03' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string

  @ApiPropertyOptional({
    description: 'Backfill only: max assets per run (FinMind rate limit)',
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxAssetsPerRun?: number

  @ApiPropertyOptional({
    description: 'Limit sync to specific assets (UUIDs)',
    type: [String],
  })
  @IsOptional()
  @IsUUID('4', { each: true })
  assetIds?: string[]
}
