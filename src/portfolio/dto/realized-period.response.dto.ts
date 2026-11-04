import { ApiProperty } from '@nestjs/swagger'

export enum PortfolioRealizedPeriodIssue {
  MissingFifo = 'MISSING_FIFO',
}

const decimalPattern = '^-?\\d+(\\.\\d{1,8})?$'

export class PortfolioRealizedMoneySummaryDto {
  @ApiProperty({ type: 'integer', minimum: 0, example: 2 })
  sellCount!: number

  @ApiProperty({
    type: String,
    pattern: decimalPattern,
    example: '540',
    description:
      'Sum of active sell amounts (net proceeds). Fees and tax are already inside amount and are not deducted again. Rounded half up to 8 decimal places only after the sum.',
  })
  netProceeds!: string

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: decimalPattern,
    example: '384',
    description:
      'Sum of SellLotMatch quantity times unit cost. Null when any sell in this scope is missing a complete FIFO match. Not zero in that case.',
  })
  disposedCost!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: decimalPattern,
    example: '156',
    description:
      'Net proceeds minus disposed cost, rounded only after subtraction. Null when disposed cost is unavailable. This is not a return rate.',
  })
  realizedNetPnl!: string | null

  @ApiProperty({
    enum: PortfolioRealizedPeriodIssue,
    enumName: 'PortfolioRealizedPeriodIssue',
    isArray: true,
  })
  issues!: PortfolioRealizedPeriodIssue[]
}

export class PortfolioRealizedPeriodScopeDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Requested account. Null means every account owned by the signed-in user.',
  })
  accountId!: string | null

  @ApiProperty({ type: 'integer', example: 2024 })
  year!: number

  @ApiProperty({
    type: 'integer',
    nullable: true,
    example: null,
    description:
      'Null on the year endpoint and when a month was not requested.',
  })
  month!: number | null

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'Null on the year endpoint because currencies are returned as separate groups.',
  })
  currency!: string | null
}

export class PortfolioRealizedTradeScopeDto extends PortfolioRealizedPeriodScopeDto {
  @ApiProperty({ type: String, format: 'uuid' })
  assetId!: string
}

export class PortfolioRealizedMonthDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 12, example: 3 })
  month!: number

  @ApiProperty({
    description:
      'True only for the current Asia/Taipei month of the current year.',
  })
  isCurrentMonth!: boolean

  @ApiProperty({ type: 'integer', minimum: 0, example: 2 })
  sellCount!: number

  @ApiProperty({ type: String, pattern: decimalPattern, example: '330' })
  netProceeds!: string

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: decimalPattern,
    example: '300',
  })
  disposedCost!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: decimalPattern,
    example: '30',
  })
  realizedNetPnl!: string | null

  @ApiProperty({
    enum: PortfolioRealizedPeriodIssue,
    enumName: 'PortfolioRealizedPeriodIssue',
    isArray: true,
  })
  issues!: PortfolioRealizedPeriodIssue[]
}

export class PortfolioRealizedPeriodGroupDto {
  @ApiProperty({
    example: 'TWD',
    description: 'Account currency. Groups are never summed across currencies.',
  })
  currency!: string

  @ApiProperty({ type: PortfolioRealizedMoneySummaryDto })
  summary!: PortfolioRealizedMoneySummaryDto

  @ApiProperty({
    type: [PortfolioRealizedMonthDto],
    description:
      'Taipei months ascending. A finished year has 1–12. The current year stops at the current month. Future months are omitted, not filled with zero. A month with no sells is a real zero.',
  })
  months!: PortfolioRealizedMonthDto[]
}

export class PortfolioRealizedPeriodsResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string

  @ApiProperty({ example: 'Asia/Taipei' })
  timeZone!: 'Asia/Taipei'

  @ApiProperty({ type: PortfolioRealizedPeriodScopeDto })
  scope!: PortfolioRealizedPeriodScopeDto

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Start of the selected Taipei year, inclusive.',
  })
  periodStart!: string

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'Start of the next Taipei year, exclusive. This stays the calendar boundary even when the year is still open.',
  })
  periodEndExclusive!: string

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Equal to generatedAt when this year is still open, so sells after this instant are excluded. Null when the calendar year has ended.',
  })
  asOf!: string | null

  @ApiProperty()
  isCurrentYear!: boolean

  @ApiProperty({
    type: [PortfolioRealizedPeriodGroupDto],
    description:
      'One group per account currency that already has an active buy or sell on or before generatedAt, and whose first such trade is in this year or earlier. Ordered by currency ascending. Dividends alone do not open a group. A selected year before that first trade is omitted.',
  })
  groups!: PortfolioRealizedPeriodGroupDto[]
}

export class PortfolioRealizedAssetItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  assetId!: string

  @ApiProperty({ example: 'AAA' })
  symbol!: string

  @ApiProperty({ example: 'Alpha' })
  name!: string

  @ApiProperty({
    example: 'etf',
    description: 'Asset.type. This report does not use asset class.',
  })
  type!: string

  @ApiProperty({ type: 'integer', minimum: 0, example: 22 })
  sellCount!: number

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: decimalPattern,
    example: '23',
    description:
      'Sum of matched sell quantities when every sell in this row has a complete FIFO match. Null when any sell is missing FIFO. This is shares sold in the period, not the remaining position.',
  })
  realizedQuantity!: string | null

  @ApiProperty({ type: String, pattern: decimalPattern, example: '460' })
  netProceeds!: string

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: decimalPattern,
    example: '284',
  })
  disposedCost!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: decimalPattern,
    example: '176',
  })
  realizedNetPnl!: string | null

  @ApiProperty({
    enum: PortfolioRealizedPeriodIssue,
    enumName: 'PortfolioRealizedPeriodIssue',
    isArray: true,
  })
  issues!: PortfolioRealizedPeriodIssue[]
}

export class PortfolioRealizedAssetsResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string

  @ApiProperty({ example: 'Asia/Taipei' })
  timeZone!: 'Asia/Taipei'

  @ApiProperty({ type: PortfolioRealizedPeriodScopeDto })
  scope!: PortfolioRealizedPeriodScopeDto

  @ApiProperty({ type: String, format: 'date-time' })
  periodStart!: string

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Start of the next Taipei year or month, exclusive.',
  })
  periodEndExclusive!: string

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Equal to generatedAt when the selected year or month is still open. Null when that calendar period has ended.',
  })
  asOf!: string | null

  @ApiProperty({
    type: PortfolioRealizedMoneySummaryDto,
    description: 'Covers every matching asset, not only the current page.',
  })
  summary!: PortfolioRealizedMoneySummaryDto

  @ApiProperty({
    type: [PortfolioRealizedAssetItemDto],
    description:
      'Assets with at least one active sell in the period and currency. Ordered by symbol ascending, then assetId ascending. Buys without a sell are omitted. Holding and closed assets are both included.',
  })
  items!: PortfolioRealizedAssetItemDto[]

  @ApiProperty({ type: 'integer', minimum: 0 })
  total!: number

  @ApiProperty({ type: 'integer', minimum: 0 })
  skip!: number

  @ApiProperty({ type: 'integer', minimum: 1 })
  take!: number
}

export class PortfolioRealizedTradeItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  transactionId!: string

  @ApiProperty({ type: String, format: 'uuid' })
  accountId!: string

  @ApiProperty({ example: 'Broker TWD' })
  accountName!: string

  @ApiProperty({ type: String, format: 'uuid' })
  assetId!: string

  @ApiProperty({ example: 'AAA' })
  symbol!: string

  @ApiProperty({ example: 'Alpha' })
  name!: string

  @ApiProperty({ type: String, format: 'date-time' })
  tradeTime!: string

  @ApiProperty({ enum: ['sell'], example: 'sell' })
  type!: 'sell'

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: decimalPattern,
    description:
      'Quantity stored on the sell. A split is not applied again here. Null stays null.',
  })
  quantity!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: decimalPattern,
    description:
      'Price stored on the sell. Null stays null and is not treated as zero.',
  })
  price!: string | null

  @ApiProperty({
    type: String,
    pattern: decimalPattern,
    description:
      'Sell amount, which is the net proceeds. Do not subtract fee or tax again.',
  })
  amount!: string

  @ApiProperty({
    type: String,
    pattern: decimalPattern,
    description: 'Recorded fee, returned for reconciliation only.',
  })
  fee!: string

  @ApiProperty({
    type: String,
    pattern: decimalPattern,
    description: 'Recorded tax, returned for reconciliation only.',
  })
  tax!: string

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern })
  disposedCost!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern })
  realizedNetPnl!: string | null

  @ApiProperty({
    enum: PortfolioRealizedPeriodIssue,
    enumName: 'PortfolioRealizedPeriodIssue',
    isArray: true,
  })
  issues!: PortfolioRealizedPeriodIssue[]
}

export class PortfolioRealizedTradesResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string

  @ApiProperty({ example: 'Asia/Taipei' })
  timeZone!: 'Asia/Taipei'

  @ApiProperty({ type: PortfolioRealizedTradeScopeDto })
  scope!: PortfolioRealizedTradeScopeDto

  @ApiProperty({ type: String, format: 'date-time' })
  periodStart!: string

  @ApiProperty({ type: String, format: 'date-time' })
  periodEndExclusive!: string

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  asOf!: string | null

  @ApiProperty({
    type: PortfolioRealizedMoneySummaryDto,
    description:
      'Covers every matching sell, including rows on other pages. One missing FIFO match anywhere in the period nulls this summary.',
  })
  summary!: PortfolioRealizedMoneySummaryDto

  @ApiProperty({
    type: [PortfolioRealizedTradeItemDto],
    description:
      'One row per sell, including a sell matched to several lots. Ordered by tradeTime descending, then transactionId ascending.',
  })
  items!: PortfolioRealizedTradeItemDto[]

  @ApiProperty({ type: 'integer', minimum: 0 })
  total!: number

  @ApiProperty({ type: 'integer', minimum: 0 })
  skip!: number

  @ApiProperty({ type: 'integer', minimum: 1 })
  take!: number
}
