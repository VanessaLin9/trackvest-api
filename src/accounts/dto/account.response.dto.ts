// src/accounts/dto/account.response.dto.ts
import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { AccountType, Currency } from '@prisma/client'

export class AccountResponseDto {
  @ApiProperty({ example: 'e8e1d0a6-...' })
  @Expose()
  id!: string

  @ApiProperty({ example: '3f8b6bfa-...' })
  @Expose()
  userId!: string

  @ApiProperty({ example: 'My Broker' })
  @Expose()
  name!: string

  @ApiProperty({ enum: AccountType, example: AccountType.broker })
  @Expose()
  type!: AccountType

  @ApiProperty({ enum: Currency, example: Currency.TWD })
  @Expose()
  currency!: Currency

  @ApiProperty({ example: '2025-10-08T05:00:00.000Z' })
  @Expose()
  createdAt!: Date
}
