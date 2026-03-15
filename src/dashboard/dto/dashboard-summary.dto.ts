import { ApiProperty } from '@nestjs/swagger'

export class MoneySummaryDto {
  @ApiProperty({ example: 1250 })
  amount!: number

  @ApiProperty({ example: 'TWD', nullable: true })
  currency!: string | null
}

export class ReturnSummaryDto extends MoneySummaryDto {
  @ApiProperty({ example: 6.49 })
  rate!: number
}

export class InvestmentSummaryDto {
  @ApiProperty({ type: MoneySummaryDto })
  totalAssets!: MoneySummaryDto

  @ApiProperty({ type: ReturnSummaryDto })
  totalReturn!: ReturnSummaryDto
}

export class DashboardSummaryDto {
  @ApiProperty({ type: MoneySummaryDto })
  todayExpense!: MoneySummaryDto

  @ApiProperty({ type: MoneySummaryDto })
  monthExpense!: MoneySummaryDto

  @ApiProperty({ type: InvestmentSummaryDto })
  investment!: InvestmentSummaryDto
}
