import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { AssetType } from '@prisma/client'
import { IsEnum, IsIn, IsString, Length } from 'class-validator'
import { APP_CURRENCIES } from '../../common/constants/currency.constants'

export class AssetBaseDto {

    @ApiProperty({
        description: '資產代號',
        example: 'AAPL',
    })
    @Expose()
    @IsString()
    @Length(1, 20)
    symbol!: string

    @ApiProperty({
        description: '資產名稱',
        example: 'Apple Inc.',
    })
    @Expose()
    @IsString()
    @Length(1, 100)
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
        description: '基礎貨幣',
        example: 'USD',
        enum: APP_CURRENCIES,
    })
    @Expose()
    @IsString()
    @IsIn(APP_CURRENCIES)
    @Length(3, 10)
    baseCurrency!: string
}
