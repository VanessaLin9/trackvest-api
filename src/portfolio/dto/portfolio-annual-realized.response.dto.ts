import { ApiProperty } from '@nestjs/swagger'

export enum PortfolioAnnualRealizedIssue {
  MissingFifo = 'MISSING_FIFO',
}

const decimalPattern = '^-?\\d+(\\.\\d{1,8})?$'

export class PortfolioAnnualRealizedItemResponseDto {
  @ApiProperty({ type: 'integer', example: 2026, description: 'Sell year in Asia/Taipei. A sale just after UTC 12/31 16:00 belongs to the next Taipei year.' })
  year!: number

  @ApiProperty({ example: 'TWD', description: 'Account currency. Rows are not summed across currencies.' })
  currency!: string

  @ApiProperty({ type: 'integer', minimum: 0, example: 2 })
  sellCount!: number

  @ApiProperty({ type: String, pattern: decimalPattern, example: '500', description: 'Sum of active sell amounts (net proceeds). Fees and tax are already inside amount and are not deducted again.' })
  netProceeds!: string

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, example: '420', description: 'FIFO match quantity times unit cost for this year and currency. Null when any sell match is missing or incomplete.' })
  disposedCost!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, example: '80', description: 'Net proceeds minus disposed cost. Null when disposed cost is unavailable. This is not an annual return rate.' })
  realizedNetPnl!: string | null

  @ApiProperty({ enum: PortfolioAnnualRealizedIssue, enumName: 'PortfolioAnnualRealizedIssue', isArray: true })
  issues!: PortfolioAnnualRealizedIssue[]
}

export class PortfolioAnnualRealizedResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string

  @ApiProperty({ example: 'Asia/Taipei' })
  timeZone!: 'Asia/Taipei'

  @ApiProperty({
    type: [PortfolioAnnualRealizedItemResponseDto],
    description: 'One row per year and account currency, from the first buy/sell year through the current Taipei year. Ordered by year descending, then currency ascending.',
  })
  items!: PortfolioAnnualRealizedItemResponseDto[]
}
