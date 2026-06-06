import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsIn, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator'

export class SyncSplitsDto {
  @ApiPropertyOptional({ enum: ['tw', 'us', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['tw', 'us', 'all'])
  market?: 'tw' | 'us' | 'all'

  @ApiPropertyOptional({ example: '2020-01-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string

  @ApiPropertyOptional({ example: '2026-06-05' })
  @IsOptional()
  @IsISO8601({ strict: true })
  endDate?: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assetIds?: string[]
}
