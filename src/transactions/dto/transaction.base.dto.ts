import { ApiProperty } from '@nestjs/swagger'
import { TxType } from '@prisma/client'
import { IsEnum, IsString, IsOptional, IsNumber, IsDateString, IsUUID } from 'class-validator'
import { Type } from 'class-transformer'

export class TransactionBaseDto {

    @ApiProperty({
        description: '帳戶ID',
        example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000',
    })
    @IsUUID()
    accountId!: string

    @ApiProperty({
        description: '資產ID',
        example: 'e8e1d0a6-1234-5678-9abc-def012345678',
        required: false,
    })
    @IsOptional()
    @IsUUID()
    assetId?: string

    @ApiProperty({
        description: '交易類型',
        example: 'buy',
        enum: TxType,
    })
    @IsEnum(TxType)
    type!: TxType

    @ApiProperty({
        description: '交易金額',
        example: 1000.50,
    })
    @Type(() => Number)
    @IsNumber()
    amount!: number

    @ApiProperty({
        description: '交易數量',
        example: 10,
        required: false,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    quantity?: number

    @ApiProperty({
        description: '交易價格',
        example: 100.05,
        required: false,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    price?: number

    @ApiProperty({
        description: '手續費',
        example: 5.0,
        required: false,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    fee?: number

    @ApiProperty({
        description: '交易時間',
        example: '2025-01-20T10:30:00.000Z',
        required: false,
    })
    @IsOptional()
    @IsDateString()
    tradeTime?: string

    @ApiProperty({
        description: '備註',
        example: 'Buy AAPL shares',
        required: false,
    })
    @IsOptional()
    @IsString()
    note?: string
}
