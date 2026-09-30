import { ApiProperty } from '@nestjs/swagger'
import { AssetClass, AssetType, TxType } from '@prisma/client'
import { PortfolioDisplayCurrencyResponseDto } from './portfolio-display-currency.response.dto'

export class PortfolioHoldingLastActivityDto {
  @ApiProperty({ enum: TxType, example: TxType.buy })
  type!: TxType

  @ApiProperty({ example: '2026-04-04', description: 'UTC 日期 YYYY-MM-DD' })
  tradeDate!: string

  @ApiProperty({ nullable: true, description: '使用者自己寫的備註。沒有備註時前端用 type 與 tradeDate 組文案。' })
  note!: string | null
}

export class PortfolioHoldingItemResponseDto {
  @ApiProperty({ example: 'asset-1' })
  assetId!: string

  @ApiProperty({ example: 'AAPL' })
  symbol!: string

  @ApiProperty({ example: 'Apple Inc.' })
  name!: string

  @ApiProperty({ enum: AssetType, example: AssetType.equity })
  type!: AssetType

  @ApiProperty({ enum: AssetClass, example: AssetClass.equity })
  assetClass!: AssetClass

  @ApiProperty({ example: 12.5 })
  quantity!: number

  @ApiProperty({ example: 102.35 })
  avgCost!: number

  @ApiProperty({ example: 118.2, nullable: true })
  latestPrice!: number | null

  @ApiProperty({ example: 'USD', nullable: true })
  latestPriceCurrency!: string | null

  @ApiProperty({ example: 'USD' })
  assetBaseCurrency!: string

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

  @ApiProperty({
    nullable: true,
    type: PortfolioHoldingLastActivityDto,
    description: '最近一筆交易的種類與日期。文案由前端 i18n 組，不回英文句子（PR #46）。',
  })
  lastActivity!: PortfolioHoldingLastActivityDto | null
}

export class PortfolioAllocationByTypeItemResponseDto {
  @ApiProperty({ enum: AssetType, example: AssetType.equity })
  type!: AssetType

  @ApiProperty({ example: 48600 })
  marketValue!: number

  @ApiProperty({ example: 0.35 })
  weight!: number
}

export class PortfolioAllocationByAssetClassItemResponseDto {
  @ApiProperty({ enum: AssetClass, example: AssetClass.equity })
  assetClass!: AssetClass

  @ApiProperty({ example: 48600 })
  marketValue!: number

  @ApiProperty({ example: 0.35 })
  weight!: number
}

export class PortfolioHoldingsResponseDto extends PortfolioDisplayCurrencyResponseDto {
  @ApiProperty({ type: PortfolioHoldingItemResponseDto, isArray: true })
  items!: PortfolioHoldingItemResponseDto[]

  @ApiProperty({ type: PortfolioAllocationByTypeItemResponseDto, isArray: true })
  allocationByType!: PortfolioAllocationByTypeItemResponseDto[]

  @ApiProperty({ type: PortfolioAllocationByAssetClassItemResponseDto, isArray: true })
  allocationByAssetClass!: PortfolioAllocationByAssetClassItemResponseDto[]
}
