import { ApiProperty } from '@nestjs/swagger'

export class PortfolioTrendPointResponseDto {
  @ApiProperty({ example: '2026-04-05' })
  label!: string

  @ApiProperty({ example: '2026-04-05' })
  date!: string

  @ApiProperty({ example: 125000 })
  investedCapital!: number

  @ApiProperty({ example: 138600 })
  marketValue!: number
}

export class PortfolioTrendResponseDto {
  @ApiProperty({ type: PortfolioTrendPointResponseDto, isArray: true })
  points!: PortfolioTrendPointResponseDto[]
}

export class PortfolioHoldingTrendPointResponseDto {
  @ApiProperty({ example: '2026-04-05' })
  label!: string

  @ApiProperty({ example: '2026-04-05' })
  date!: string

  @ApiProperty({ example: 4200 })
  investedAmount!: number

  @ApiProperty({ example: 4500 })
  marketValue!: number
}

export class PortfolioHoldingTrendResponseDto {
  @ApiProperty({ example: 'asset-1' })
  assetId!: string

  @ApiProperty({ type: PortfolioHoldingTrendPointResponseDto, isArray: true })
  points!: PortfolioHoldingTrendPointResponseDto[]
}
