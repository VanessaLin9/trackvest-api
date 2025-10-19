import { ApiProperty } from '@nestjs/swagger'
import { AccountType, Currency } from '@prisma/client'
import { IsEnum, Length } from 'class-validator'

export class AccountBaseDto {

    @ApiProperty({
        description: '帳戶名稱',
        example: 'My Broker Account',
    })
    name!: string

    @ApiProperty({
        description: '帳戶類型',
        example: 'broker',
        enum: AccountType,
    })
    @IsEnum(AccountType)
    type!: AccountType

    @ApiProperty({
        description: '幣別',
        example: 'TWD',
        enum: Currency,
    })
    @IsEnum(Currency)
    @Length(3, 10)
    currency!: Currency
}
