import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsOptional, IsString, Length } from 'class-validator'
import { SUPPORTED_CURRENCIES } from '../../common/constants/currency.constants'
import { normalizeAssetCurrencyInput } from '../../common/utils'

export class GetPortfolioDisplayCurrencyDto {
  @ApiPropertyOptional({
    description: 'Deprecated alias for preferredBaseCurrency',
    example: 'USD',
    enum: SUPPORTED_CURRENCIES,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAssetCurrencyInput(value) : value)
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  @Length(3, 10)
  displayCurrency?: string

  @ApiPropertyOptional({
    description: 'Preferred display currency for normalized portfolio values',
    example: 'USD',
    enum: SUPPORTED_CURRENCIES,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAssetCurrencyInput(value) : value)
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  @Length(3, 10)
  preferredBaseCurrency?: string
}
