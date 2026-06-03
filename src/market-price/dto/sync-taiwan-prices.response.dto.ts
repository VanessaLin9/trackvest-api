import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

class SyncTaiwanPricesPerAssetDto {
  @ApiProperty()
  assetId!: string

  @ApiProperty()
  symbol!: string

  @ApiProperty()
  rows!: number

  @ApiPropertyOptional()
  skipped?: boolean

  @ApiPropertyOptional()
  reason?: string
}

export class SyncTaiwanPricesResponseDto {
  @ApiProperty({ example: 'tw' })
  market!: 'tw'

  @ApiProperty({ enum: ['daily', 'backfill'] })
  mode!: 'daily' | 'backfill'

  @ApiProperty()
  startDate!: string

  @ApiProperty()
  endDate!: string

  @ApiProperty()
  assetsRequested!: number

  @ApiProperty()
  assetsProcessed!: number

  @ApiProperty()
  assetsSkipped!: number

  @ApiProperty()
  rowsUpserted!: number

  @ApiProperty({ type: [SyncTaiwanPricesPerAssetDto] })
  perAsset!: SyncTaiwanPricesPerAssetDto[]
}
