import { AccountType, Currency } from '@prisma/client'
import { IsEnum, IsString, IsUUID, Length } from 'class-validator'

export class CreateAccountDto {
    @IsUUID()
    userId: string

    @IsString()
    @Length(1, 100)
    name: string

    @IsEnum(AccountType)
    type: AccountType

    @IsEnum(Currency)
    @Length(3, 10)
    currency: Currency
}
