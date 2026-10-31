import { ApiProperty } from '@nestjs/swagger'

export enum PortfolioAssetPerformanceStatus {
  Holding = 'holding',
  Closed = 'closed',
}

export enum PortfolioAssetPerformanceIssue {
  MissingFifo = 'MISSING_FIFO',
  MissingPrice = 'MISSING_PRICE',
  CurrencyMismatch = 'CURRENCY_MISMATCH',
  InconsistentLots = 'INCONSISTENT_LOTS',
}

const decimalPattern = '^-?\\d+(\\.\\d{1,8})?$'

export class PortfolioAssetPerformanceItemResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  assetId!: string

  @ApiProperty({ example: '0050' })
  symbol!: string

  @ApiProperty({ example: '元大台灣50' })
  name!: string

  @ApiProperty({ example: 'TWD', description: 'Account currency. One row per assetId + currency; no FX conversion or cross-currency totals.' })
  currency!: string

  @ApiProperty({ enum: PortfolioAssetPerformanceStatus, enumName: 'PortfolioAssetPerformanceStatus' })
  status!: PortfolioAssetPerformanceStatus

  @ApiProperty({ type: String, pattern: '^\\d+(\\.\\d{1,8})?$', example: '12.5', description: 'Remaining lot quantity. Never a JavaScript number.' })
  quantity!: string

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, example: '50', description: 'Recorded net sell proceeds minus FIFO disposed cost. Null when FIFO or lot data cannot support the calculation.' })
  realizedNetPnl!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, example: '1250', description: 'Remaining lot cost in account currency. Zero for a consistent closed position.' })
  remainingCost!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, example: '120', description: 'Latest usable non-seed quote in the row currency. Null if unavailable or its currency differs. Closed rows do not require a quote.' })
  latestPrice!: string | null

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'UTC ISO timestamp of the usable quote, not the response generation time. Null when latestPrice is null.' })
  priceAsOf!: string | null

  @ApiProperty({ type: String, nullable: true, example: 'finmind', description: 'Source of the usable quote. Null when latestPrice is null.' })
  priceSource!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, example: '250', description: 'Quantity times usable quote minus remaining cost. Zero for a consistent closed position; null when required data is unavailable.' })
  unrealizedPnl!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, example: '300', description: 'Realized net P&L plus unrealized P&L, excluding dividends. Null if either term is unavailable.' })
  tradeNetPnl!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, example: '20', description: 'Only the dividend amounts recorded in this scope. Null when there are no dividend records; this does not establish the actual dividend total.' })
  recordedDividendAmount!: string | null

  @ApiProperty({ type: 'integer', minimum: 0, example: 1 })
  recordedDividendCount!: number

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'First active buy timestamp (UTC ISO). Null if no buy history is recorded.' })
  firstBuyAt!: string | null

  @ApiProperty({ type: String, format: 'date-time', description: 'Latest active buy/sell timestamp (UTC ISO), excluding dividends.' })
  lastTradeAt!: string

  @ApiProperty({ enum: PortfolioAssetPerformanceIssue, enumName: 'PortfolioAssetPerformanceIssue', isArray: true, description: 'Deterministic, unique issue codes. Missing data must remain distinguishable from genuine zero P&L.' })
  issues!: PortfolioAssetPerformanceIssue[]
}

export class PortfolioAssetPerformanceResponseDto {
  @ApiProperty({ type: String, format: 'date-time', description: 'UTC ISO response generation time. Each row carries its own quote timestamp.' })
  generatedAt!: string

  @ApiProperty({ type: [PortfolioAssetPerformanceItemResponseDto], description: 'All active buy/sell history, including closed holdings. Ordered by symbol, currency, assetId.' })
  items!: PortfolioAssetPerformanceItemResponseDto[]
}
