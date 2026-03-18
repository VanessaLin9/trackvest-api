import { ApiProperty } from '@nestjs/swagger'
import { AccountType, Currency } from '@prisma/client'
import { Expose } from 'class-transformer'
import { IsEnum, IsOptional, IsString, Length } from 'class-validator'
import { SUPPORTED_BROKER } from '../account-broker.constants'

export class AccountBaseDto {

    @ApiProperty({
        description: '帳戶名稱',
        example: 'My Broker Account',
    })
    @Expose()
    @IsString()
    @Length(1, 100)
    name!: string

    @ApiProperty({
        description: '帳戶類型',
        example: 'broker',
        enum: AccountType,
    })
    @Expose()
    @IsEnum(AccountType)
    type!: AccountType

    @ApiProperty({
        description: '幣別',
        example: 'TWD',
        enum: Currency,
    })
    @Expose()
    @IsEnum(Currency)
    @Length(3, 10)
    currency!: Currency

    @ApiProperty({
        description: '券商識別碼，只有 broker account 需要',
        example: SUPPORTED_BROKER,
        required: false,
    })
    @Expose()
    @IsOptional()
    @IsString()
    @Length(1, 50)
    broker?: string
}
