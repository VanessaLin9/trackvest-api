import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsOptional, IsString, Length } from 'class-validator'
import { APP_CURRENCIES } from '../../common/constants/currency.constants'
import { normalizeAssetCurrencyInput } from '../../common/utils'

export class GetFxRateDto {
  @ApiPropertyOptional({
    description: 'Base currency for the requested FX reference rate',
    example: 'TWD',
    enum: APP_CURRENCIES,
    default: 'TWD',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAssetCurrencyInput(value) : value)
  @IsString()
  @IsIn(APP_CURRENCIES)
  @Length(3, 10)
  base: string = 'TWD'

  @ApiPropertyOptional({
    description: 'Quote currency for the requested FX reference rate',
    example: 'USD',
    enum: APP_CURRENCIES,
    default: 'USD',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAssetCurrencyInput(value) : value)
  @IsString()
  @IsIn(APP_CURRENCIES)
  @Length(3, 10)
  quote: string = 'USD'
}
