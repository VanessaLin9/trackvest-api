import { ApiProperty } from '@nestjs/swagger'
import { AccountType, Currency } from '@prisma/client'
import { IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator'
import { SUPPORTED_BROKER } from '../../accounts/account-broker.constants'

const ONBOARDING_CURRENCIES = [Currency.TWD] as const

export class OnboardingStarterAccountDto {
  @ApiProperty({ example: 'My Broker Account' })
  @IsString()
  @Length(1, 100)
  name!: string

  @ApiProperty({ enum: AccountType, example: AccountType.broker })
  @IsEnum(AccountType)
  type!: AccountType

  @ApiProperty({ enum: ONBOARDING_CURRENCIES, example: Currency.TWD, default: Currency.TWD })
  @IsIn(ONBOARDING_CURRENCIES)
  currency: Currency = Currency.TWD

  @ApiProperty({
    required: false,
    example: SUPPORTED_BROKER,
    description: '券商識別碼，只有 broker account 需要',
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  broker?: string
}
