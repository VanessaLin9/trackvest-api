import { ApiProperty } from '@nestjs/swagger'
import { PortfolioDisplayCurrencyResponseDto } from './portfolio-display-currency.response.dto'

export class PortfolioSummaryResponseDto extends PortfolioDisplayCurrencyResponseDto {
  @ApiProperty({ example: '2026-04-05T00:00:00.000Z' })
  asOf!: string

  @ApiProperty({ example: 'TWD', nullable: true })
  baseCurrency!: string | null

  @ApiProperty({ example: 125000 })
  investedCapital!: number

  @ApiProperty({ example: 138600 })
  marketValue!: number

  @ApiProperty({ example: 13600 })
  totalPnl!: number

  @ApiProperty({ example: 0.1088 })
  totalReturnRate!: number

  @ApiProperty({ example: 4 })
  holdingsCount!: number
}
