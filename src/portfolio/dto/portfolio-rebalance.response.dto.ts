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

  @ApiProperty({ type: String, isArray: true, example: ['Current ratios are calculated from equity and bond holdings only.'] })
  notes!: string[]
}
