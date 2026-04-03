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
  normalizeAssetCurrencyInput,
  normalizeAssetSearchInput,
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
    message: 'q contains unsupported characters',
  })
  q?: string

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

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 10
}
