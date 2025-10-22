import { ApiProperty } from '@nestjs/swagger'
import { AssetType } from '@prisma/client'
import { IsEnum, IsString, Length } from 'class-validator'

export class AssetBaseDto {

    @ApiProperty({
        description: '資產代號',
        example: 'AAPL',
    })
    @IsString()
    @Length(1, 20)
    symbol!: string

    @ApiProperty({
        description: '資產名稱',
        example: 'Apple Inc.',
    })
    @IsString()
    @Length(1, 100)
    name!: string

    @ApiProperty({
        description: '資產類型',
        example: 'equity',
        enum: AssetType,
    })
    @IsEnum(AssetType)
    type!: AssetType

    @ApiProperty({
        description: '基礎貨幣',
        example: 'USD',
    })
    @IsString()
    @Length(3, 10)
    baseCurrency!: string
}
