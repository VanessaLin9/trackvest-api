import { ApiProperty } from '@nestjs/swagger'

class SyncTaiwanPricesPerAssetDto {
  @ApiProperty()
  assetId!: string

  @ApiProperty()
  symbol!: string

  @ApiProperty()
  rows!: number
}

export class SyncTaiwanPricesResponseDto {
  @ApiProperty({ example: 'tw' })
  market!: 'tw'

  @ApiProperty()
  startDate!: string

  @ApiProperty()
  endDate!: string

  @ApiProperty()
  assetsRequested!: number

  @ApiProperty()
  rowsUpserted!: number

  @ApiProperty({ type: [SyncTaiwanPricesPerAssetDto] })
  perAsset!: SyncTaiwanPricesPerAssetDto[]
}
