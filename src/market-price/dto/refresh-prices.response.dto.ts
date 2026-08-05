import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RefreshPricesMarketResultDto {
  @ApiProperty({ enum: ['tw', 'us'] })
  market!: 'tw' | 'us'

  @ApiProperty({ enum: ['success', 'failed'] })
  status!: 'success' | 'failed'

  @ApiPropertyOptional({ example: '2026-07-20' })
  startDate?: string

  @ApiPropertyOptional({ example: '2026-08-02' })
  endDate?: string

  @ApiPropertyOptional()
  assetsProcessed?: number

  @ApiPropertyOptional()
  rowsUpserted?: number

  @ApiPropertyOptional({ example: 'PRICE_REFRESH_FAILED' })
  errorCode?: 'PRICE_REFRESH_FAILED'

  @ApiPropertyOptional({ example: 'US price refresh failed' })
  message?: string
}

export class RefreshPricesResponseDto {
  @ApiProperty({ enum: ['success', 'partial_success', 'failed'] })
  status!: 'success' | 'partial_success' | 'failed'

  @ApiProperty({
    type: [RefreshPricesMarketResultDto],
    description: 'Fixed order: tw, then us.',
  })
  markets!: RefreshPricesMarketResultDto[]
}
