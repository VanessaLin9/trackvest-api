import { ApiProperty } from '@nestjs/swagger'

export class PortfolioDisplayCurrencyResponseDto {
  @ApiProperty({ example: 'USD', nullable: true })
  requestedDisplayCurrency!: string | null

  @ApiProperty({ example: 'USD', nullable: true })
  effectiveDisplayCurrency!: string | null
}
