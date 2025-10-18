import { AccountType } from '@prisma/client'
import { IsEnum, IsString, IsUUID, Length } from 'class-validator'

export class CreateAccountDto {
    @IsUUID()
    userId: string

    @IsString()
    @Length(1, 100)
    name: string

    @IsEnum(AccountType)
    type: AccountType

    @IsString()
    @Length(3, 10)
    currency: string
}
