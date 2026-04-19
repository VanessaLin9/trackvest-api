import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNumber, IsOptional, Max, Min } from 'class-validator'
import { GetPortfolioDisplayCurrencyDto } from './get-portfolio-display-currency.dto'

export class GetPortfolioRebalanceDto extends GetPortfolioDisplayCurrencyDto {
  @ApiPropertyOptional({
    description: 'Target equity allocation ratio. If omitted, backend uses the default or derives it from targetBond.',
    example: 0.8,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  targetEquity?: number

  @ApiPropertyOptional({
    description: 'Target bond allocation ratio. If omitted, backend uses the default or derives it from targetEquity.',
    example: 0.2,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  targetBond?: number
}
