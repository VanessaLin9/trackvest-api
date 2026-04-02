import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { AssetType } from '@prisma/client'
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator'
import { SUPPORTED_CURRENCIES } from '../../common/constants/currency.constants'
import {
  ASSET_SEARCH_REGEX,
  ASSET_SYMBOL_REGEX,
  normalizeAssetCurrencyInput,
  normalizeAssetSearchInput,
  normalizeAssetSymbolInput,
} from '../../common/utils'

export class FindAssetsDto {
  @ApiPropertyOptional({
    description: 'Keyword search over symbol and name',
    example: 'apple inc',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAssetSearchInput(value) : value)
  @IsString()
  @Length(1, 100)
  @Matches(ASSET_SEARCH_REGEX, {
    message: 'search contains unsupported characters',
  })
  search?: string

  @ApiPropertyOptional({
    description: 'Exact symbol filter',
    example: 'AAPL',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAssetSymbolInput(value) : value)
  @IsString()
  @Length(1, 20)
  @Matches(ASSET_SYMBOL_REGEX, {
    message:
      'symbol may only contain uppercase letters, numbers, and . _ : / - without spaces',
  })
  symbol?: string

  @ApiPropertyOptional({
    description: 'Asset type filter',
    example: 'equity',
    enum: AssetType,
  })
  @IsOptional()
  @IsEnum(AssetType)
  type?: AssetType

  @ApiPropertyOptional({
    description: 'Base currency filter',
    example: 'USD',
    enum: SUPPORTED_CURRENCIES,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAssetCurrencyInput(value) : value)
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  @Length(3, 10)
  baseCurrency?: string

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number = 50
}
