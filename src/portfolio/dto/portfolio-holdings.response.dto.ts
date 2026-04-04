import { ApiProperty } from '@nestjs/swagger'
import { AssetType } from '@prisma/client'

export class PortfolioHoldingItemResponseDto {
  @ApiProperty({ example: 'asset-1' })
  assetId!: string

  @ApiProperty({ example: 'AAPL' })
  symbol!: string

  @ApiProperty({ example: 'Apple Inc.' })
  name!: string

  @ApiProperty({ enum: AssetType, example: AssetType.equity })
  type!: AssetType

  @ApiProperty({ example: 12.5 })
  quantity!: number

  @ApiProperty({ example: 102.35 })
  avgCost!: number

  @ApiProperty({ example: 118.2, nullable: true })
  latestPrice!: number | null

  @ApiProperty({ example: 1279.375 })
  investedAmount!: number

  @ApiProperty({ example: 1477.5 })
  marketValue!: number

  @ApiProperty({ example: 198.125 })
  pnl!: number

  @ApiProperty({ example: 0.154859472 })
  returnRate!: number

  @ApiProperty({ example: 0.2764 })
  weight!: number

  @ApiProperty({ example: 'Buy on 2026-04-05', nullable: true })
  lastActivitySummary!: string | null
}

export class PortfolioAllocationByTypeItemResponseDto {
  @ApiProperty({ enum: AssetType, example: AssetType.equity })
  type!: AssetType

  @ApiProperty({ example: 48600 })
  marketValue!: number

  @ApiProperty({ example: 0.35 })
  weight!: number
}

export class PortfolioHoldingsResponseDto {
  @ApiProperty({ type: PortfolioHoldingItemResponseDto, isArray: true })
  items!: PortfolioHoldingItemResponseDto[]

  @ApiProperty({ type: PortfolioAllocationByTypeItemResponseDto, isArray: true })
  allocationByType!: PortfolioAllocationByTypeItemResponseDto[]
}
