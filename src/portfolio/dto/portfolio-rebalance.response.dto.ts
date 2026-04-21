import { ApiProperty } from '@nestjs/swagger'
import { PortfolioDisplayCurrencyResponseDto } from './portfolio-display-currency.response.dto'

export class PortfolioRebalanceAllocationResponseDto {
  @ApiProperty({ example: 0.8 })
  equity!: number

  @ApiProperty({ example: 0.2 })
  bond!: number
}

export class PortfolioRebalanceMarketValueResponseDto {
  @ApiProperty({ example: 80000 })
  equity!: number

  @ApiProperty({ example: 20000 })
  bond!: number
}

export class PortfolioRebalanceSuggestionResponseDto {
  @ApiProperty({ enum: ['equity', 'bond'], example: 'equity' })
  assetClass!: 'equity' | 'bond'

  @ApiProperty({ example: 'asset-1' })
  assetId!: string

  @ApiProperty({ example: 'AAPL' })
  symbol!: string

  @ApiProperty({ example: 'Apple Inc.' })
  name!: string

  @ApiProperty({ example: 2480.67063 })
  currentMarketValue!: number

  @ApiProperty({ example: 1 })
  currentWeightWithinAssetClass!: number

  @ApiProperty({ example: 9689.32937 })
  suggestedBuyAmount!: number

  @ApiProperty({ example: 38.75731748, nullable: true })
  estimatedQuantity!: number | null

  @ApiProperty({ example: 250, nullable: true })
  latestPrice!: number | null

  @ApiProperty({ example: 'USD', nullable: true })
  latestPriceCurrency!: string | null
}

export class PortfolioRebalanceCandidateResponseDto {
  @ApiProperty({ enum: ['equity', 'bond'], example: 'equity' })
  assetClass!: 'equity' | 'bond'

  @ApiProperty({ example: 'asset-1' })
  assetId!: string

  @ApiProperty({ example: 'AAPL' })
  symbol!: string

  @ApiProperty({ example: 'Apple Inc.' })
  name!: string

  @ApiProperty({ example: 2480.67063 })
  currentMarketValue!: number

  @ApiProperty({ example: 1 })
  currentWeightWithinAssetClass!: number

  @ApiProperty({ example: 250, nullable: true })
  latestPrice!: number | null

  @ApiProperty({ example: 'USD', nullable: true })
  latestPriceCurrency!: string | null

  @ApiProperty({ example: 'USD' })
  assetBaseCurrency!: string

  @ApiProperty({ example: null, nullable: true })
  lotSize!: number | null

  @ApiProperty({ example: null, nullable: true })
  minTradeUnit!: number | null
}

export class PortfolioRebalanceResponseDto extends PortfolioDisplayCurrencyResponseDto {
  @ApiProperty({ example: '2026-04-19T00:00:00.000Z' })
  asOf!: string

  @ApiProperty({ example: 'USD', nullable: true })
  baseCurrency!: string | null

  @ApiProperty({ type: PortfolioRebalanceAllocationResponseDto })
  targets!: PortfolioRebalanceAllocationResponseDto

  @ApiProperty({ type: PortfolioRebalanceAllocationResponseDto })
  current!: PortfolioRebalanceAllocationResponseDto

  @ApiProperty({ type: PortfolioRebalanceAllocationResponseDto })
  gaps!: PortfolioRebalanceAllocationResponseDto

  @ApiProperty({ type: PortfolioRebalanceMarketValueResponseDto })
  marketValueByAssetClass!: PortfolioRebalanceMarketValueResponseDto

  @ApiProperty({ type: PortfolioRebalanceMarketValueResponseDto })
  recommendedBuyAmountByAssetClass!: PortfolioRebalanceMarketValueResponseDto

  @ApiProperty({ example: 100000 })
  trackedMarketValue!: number

  @ApiProperty({ type: PortfolioRebalanceCandidateResponseDto, isArray: true })
  candidates!: PortfolioRebalanceCandidateResponseDto[]

  @ApiProperty({ type: PortfolioRebalanceSuggestionResponseDto, isArray: true })
  suggestions!: PortfolioRebalanceSuggestionResponseDto[]

  @ApiProperty({ type: String, isArray: true, example: ['Current ratios are calculated from equity and bond holdings only.'] })
  notes!: string[]
}
