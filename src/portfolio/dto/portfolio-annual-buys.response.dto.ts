import { ApiProperty } from '@nestjs/swagger'

export enum PortfolioAnnualBuyAssetType {
  Equity = 'equity',
  Etf = 'etf',
  Crypto = 'crypto',
  Cash = 'cash',
  Other = 'other',
}

const decimalPattern = '^-?\\d+(\\.\\d{1,8})?$'

export class PortfolioAnnualBuyTypeResponseDto {
  @ApiProperty({
    enum: PortfolioAnnualBuyAssetType,
    enumName: 'PortfolioAnnualBuyAssetType',
    description: 'Asset.type. equity and etf stay separate even when assetClass is equity. Unknown types are other.',
  })
  type!: PortfolioAnnualBuyAssetType

  @ApiProperty({
    type: String,
    pattern: decimalPattern,
    example: '300',
    description: 'Sum of buy.amount for this type. Fees already inside amount are not added again.',
  })
  buyAmount!: string

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: decimalPattern,
    example: '0.75',
    description: 'This type divided by the buy total of the same year, currency, and month scope. Null when that total is zero.',
  })
  share!: string | null
}

export class PortfolioAnnualBuyMonthResponseDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 12, example: 3 })
  month!: number

  @ApiProperty({
    type: String,
    pattern: decimalPattern,
    example: '350',
    description: 'Buy amount in this Taipei month. A finished month with no buys is 0. Future months of the current year are omitted.',
  })
  buyAmount!: string

  @ApiProperty({ type: [PortfolioAnnualBuyTypeResponseDto] })
  types!: PortfolioAnnualBuyTypeResponseDto[]
}

export class PortfolioAnnualBuyItemResponseDto {
  @ApiProperty({
    type: 'integer',
    example: 2026,
    description: 'Trade year in Asia/Taipei. UTC 12/31 16:00 belongs to the next Taipei year.',
  })
  year!: number

  @ApiProperty({ example: 'TWD', description: 'Account currency. Rows are not summed across currencies.' })
  currency!: string

  @ApiProperty({ type: 'integer', minimum: 0, example: 2 })
  buyCount!: number

  @ApiProperty({
    type: String,
    pattern: decimalPattern,
    example: '350',
    description: 'Sum of active buy amounts. This counts money spent on buys, including buys funded by earlier sells. It is not new principal, net deposits, or market value.',
  })
  buyAmount!: string

  @ApiProperty({ type: 'integer', minimum: 0, example: 1 })
  sellCount!: number

  @ApiProperty({
    type: String,
    pattern: decimalPattern,
    example: '80',
    description: 'Sum of active sell amounts (net proceeds). Fees and tax already inside amount are not deducted again.',
  })
  sellNetProceeds!: string

  @ApiProperty({
    type: String,
    pattern: decimalPattern,
    example: '270',
    description: 'buyAmount minus sellNetProceeds. Not external cash flow and not a return denominator.',
  })
  buyMinusSellProceeds!: string

  @ApiProperty({
    type: [PortfolioAnnualBuyTypeResponseDto],
    description: 'Buy amount by Asset.type. Empty when the year has no buys; shares are then absent rather than 0%.',
  })
  types!: PortfolioAnnualBuyTypeResponseDto[]

  @ApiProperty({
    type: [PortfolioAnnualBuyMonthResponseDto],
    description: 'Taipei months 1–12 for a finished year. The current year stops at the as-of month.',
  })
  months!: PortfolioAnnualBuyMonthResponseDto[]
}

export class PortfolioAnnualBuysResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string

  @ApiProperty({ example: 'Asia/Taipei' })
  timeZone!: 'Asia/Taipei'

  @ApiProperty({
    type: [PortfolioAnnualBuyItemResponseDto],
    description: 'One row per year and account currency, from the first buy/sell year through the current Taipei year. Ordered by year descending, then currency ascending.',
  })
  items!: PortfolioAnnualBuyItemResponseDto[]
}
