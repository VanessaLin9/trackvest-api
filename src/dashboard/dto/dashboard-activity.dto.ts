import { ApiProperty } from '@nestjs/swagger'

export class DashboardAccountOverviewItemDto {
  @ApiProperty({ example: '3f3ccdc2-6bc0-4b4e-bf4b-f9936470d8eb' })
  id!: string

  @ApiProperty({ example: '資產-銀行(台幣)' })
  name!: string

  @ApiProperty({ example: 'bank' })
  type!: string

  @ApiProperty({ example: 'TWD', nullable: true })
  currency!: string | null

  @ApiProperty({ example: 12850 })
  balance!: number
}

export class DashboardRecentActivityItemDto {
  @ApiProperty({ example: 'cashbook-5e9f57f5-9ca6-4ab6-b2ab-c28a3eb3894a' })
  id!: string

  @ApiProperty({ example: 'cashbook', enum: ['cashbook', 'investment'] })
  kind!: 'cashbook' | 'investment'

  @ApiProperty({ example: '2026-03-18T09:00:00.000Z' })
  date!: string

  @ApiProperty({ example: 'Lunch' })
  title!: string

  @ApiProperty({ example: 'Expense · 資產-銀行(台幣)' })
  subtitle!: string

  @ApiProperty({ example: 180, nullable: true })
  amount!: number | null

  @ApiProperty({ example: 'TWD', nullable: true })
  currency!: string | null

  @ApiProperty({ example: 'out', enum: ['in', 'out', 'neutral'] })
  direction!: 'in' | 'out' | 'neutral'
}

export class DashboardActivityDto {
  @ApiProperty({ type: DashboardAccountOverviewItemDto, isArray: true })
  accountOverview!: DashboardAccountOverviewItemDto[]

  @ApiProperty({ type: DashboardRecentActivityItemDto, isArray: true })
  recentActivity!: DashboardRecentActivityItemDto[]
}
