import { ApiProperty } from '@nestjs/swagger'

export enum AnnualExternalFundingCoverage {
  NotRecorded = 'not_recorded',
  Partial = 'partial',
  Complete = 'complete',
}

export enum AnnualExternalFundingIssue {
  UnknownCashflow = 'UNKNOWN_CASHFLOW',
  CoverageUnconfirmed = 'COVERAGE_UNCONFIRMED',
}

const decimalPattern = '^-?\\d+(\\.\\d{1,8})?$'

export class PortfolioAnnualExternalFundingItemResponseDto {
  @ApiProperty({ type: 'integer', example: 2026, description: 'Cashflow year in Asia/Taipei. UTC 12/31 16:00 belongs to the next Taipei year.' })
  year!: number

  @ApiProperty({ example: 'TWD', description: 'Account currency. Rows are not summed across currencies.' })
  currency!: string

  @ApiProperty({
    enum: AnnualExternalFundingCoverage,
    enumName: 'AnnualExternalFundingCoverage',
    description: 'not_recorded has no deposit/withdraw rows. partial has records but is not a confirmed full year. complete is a confirmed year with no unknown origin.',
  })
  coverage!: AnnualExternalFundingCoverage

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, description: 'Sum of deposit rows explicitly marked external. Null when this year is not recorded. Not buy amount and not market value.' })
  externalDeposit!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, description: 'Sum of withdraw rows explicitly marked external. Null when this year is not recorded.' })
  externalWithdrawal!: string | null

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: decimalPattern,
    description: 'Recorded external deposit minus recorded external withdrawal. Null when the year is not recorded or any deposit/withdraw in this currency is still unknown. This is not a return rate.',
  })
  recordedNetContribution!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, description: 'Unknown-origin deposits in the selected accounts. Null when the year is not recorded.' })
  unknownDeposit!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, description: 'Unknown-origin withdrawals in the selected accounts. Null when the year is not recorded.' })
  unknownWithdrawal!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, description: 'Internal deposits into the selected accounts. Not new principal, including when the filter is a single account.' })
  internalIn!: string | null

  @ApiProperty({ type: String, nullable: true, pattern: decimalPattern, description: 'Internal withdrawals from the selected accounts. Not an external withdrawal.' })
  internalOut!: string | null

  @ApiProperty({ enum: AnnualExternalFundingIssue, enumName: 'AnnualExternalFundingIssue', isArray: true })
  issues!: AnnualExternalFundingIssue[]
}

export class PortfolioAnnualExternalFundingResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: string

  @ApiProperty({ example: 'Asia/Taipei' })
  timeZone!: 'Asia/Taipei'

  @ApiProperty({
    type: [PortfolioAnnualExternalFundingItemResponseDto],
    description: 'One row per year and account currency, from the first recorded or confirmed year through the current Taipei year. Ordered by year descending, then currency ascending. Trades after the reporting time are omitted.',
  })
  items!: PortfolioAnnualExternalFundingItemResponseDto[]
}
