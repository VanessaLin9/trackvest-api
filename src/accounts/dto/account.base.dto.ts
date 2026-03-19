import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { AccountType, Currency } from '@prisma/client'
import { IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator'

const ACCOUNT_BROKER_OPTIONS = ['cathay'] as const
type AccountBroker = (typeof ACCOUNT_BROKER_OPTIONS)[number]

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
        description: '券商代碼',
        example: 'cathay',
        enum: ACCOUNT_BROKER_OPTIONS,
        required: false,
        nullable: true,
    })
    @Expose()
    @IsOptional()
    @IsIn(ACCOUNT_BROKER_OPTIONS)
    broker?: AccountBroker
}
