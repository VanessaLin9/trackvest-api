import { IsEnum, IsOptional, IsString, Length } from 'class-validator'
import { AccountType, Currency } from '@prisma/client'

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType

  @IsOptional()
  @IsEnum(Currency)
  @Length(3, 10)
  currency?: Currency
}
