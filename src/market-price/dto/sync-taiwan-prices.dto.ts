import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator'

export class SyncTaiwanPricesDto {
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
    description: 'Rolling window length when startDate is omitted',
    default: 7,
    minimum: 1,
    maximum: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  lookbackDays?: number

  @ApiPropertyOptional({
    description: 'Limit sync to specific assets (UUIDs)',
    type: [String],
  })
  @IsOptional()
  @IsUUID('4', { each: true })
  assetIds?: string[]
}
