import { ApiProperty } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'
import { AssetClass, AssetType } from '@prisma/client'
import { IsEnum, IsIn, IsString, Length, Matches } from 'class-validator'
import { SUPPORTED_CURRENCIES } from '../../common/constants/currency.constants'
import {
  ASSET_NAME_REGEX,
  ASSET_SYMBOL_REGEX,
  normalizeAssetCurrencyInput,
  normalizeAssetNameInput,
  normalizeAssetSymbolInput,
} from '../../common/utils'

export class AssetBaseDto {

    @ApiProperty({
        description: '資產代號',
        example: 'AAPL',
    })
    @Expose()
    @Transform(({ value }) =>
      typeof value === 'string' ? normalizeAssetSymbolInput(value) : value)
    @IsString()
    @Length(1, 20)
    @Matches(ASSET_SYMBOL_REGEX, {
      message:
        'symbol may only contain uppercase letters, numbers, and . _ : / - without spaces',
    })
    symbol!: string

    @ApiProperty({
        description: '資產名稱',
        example: 'Apple Inc.',
    })
    @Expose()
    @Transform(({ value }) =>
      typeof value === 'string' ? normalizeAssetNameInput(value) : value)
    @IsString()
    @Length(1, 100)
    @Matches(ASSET_NAME_REGEX, {
      message: 'name contains unsupported characters',
    })
    name!: string

    @ApiProperty({
        description: '資產類型',
        example: 'equity',
        enum: AssetType,
    })
    @Expose()
    @IsEnum(AssetType)
    type!: AssetType

    @ApiProperty({
        description: '資產本質分類',
        example: 'equity',
        enum: AssetClass,
    })
    @Expose()
    @IsEnum(AssetClass)
    assetClass!: AssetClass

    @ApiProperty({
        description: '基礎貨幣',
        example: 'USD',
        enum: SUPPORTED_CURRENCIES,
    })
    @Expose()
    @Transform(({ value }) =>
      typeof value === 'string' ? normalizeAssetCurrencyInput(value) : value)
    @IsString()
    @IsIn(SUPPORTED_CURRENCIES)
    @Length(3, 10)
    baseCurrency!: string
}
