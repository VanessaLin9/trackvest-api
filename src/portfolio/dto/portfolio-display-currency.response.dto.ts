import { ApiProperty } from '@nestjs/swagger'
import {
  PORTFOLIO_DISPLAY_CURRENCY_MODES,
  type PortfolioDisplayCurrencyMode,
} from './portfolio-display-currency.types'

export class PortfolioDisplayCurrencyResponseDto {
  @ApiProperty({
    enum: PORTFOLIO_DISPLAY_CURRENCY_MODES,
    example: 'preferred-base',
  })
  displayCurrencyMode!: PortfolioDisplayCurrencyMode

  @ApiProperty({ example: 'USD', nullable: true })
  requestedDisplayCurrency!: string | null

  @ApiProperty({ example: 'USD', nullable: true })
  effectiveDisplayCurrency!: string | null
}
