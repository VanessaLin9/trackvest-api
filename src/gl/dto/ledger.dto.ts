// src/gl/dto/ledger.dto.ts
import { ApiProperty } from '@nestjs/swagger'
import { IsUUID, IsString, IsNumber, IsPositive, IsOptional, IsIn } from 'class-validator'

const CURRENCIES = ['TWD', 'USD', 'JPY', 'EUR'] as const
type Currency = typeof CURRENCIES[number]

export class ExpenseBodyDto {
  @ApiProperty({ example: 'USER_ID_UUID' })
  @IsUUID()
  userId!: string

  @ApiProperty({ example: 'GL_ACC_ID_CASH_OR_BANK' })
  @IsString()
  payFromGlAccountId!: string

  @ApiProperty({ example: 'GL_ACC_ID_EXPENSE' })
  @IsString()
  expenseGlAccountId!: string

  @ApiProperty({ example: 320 })
  @IsNumber()
  @IsPositive()
  amount!: number

  @ApiProperty({ example: 'TWD', enum: CURRENCIES })
  @IsIn([...CURRENCIES])
  currency!: Currency

  @ApiProperty({ example: '2025-11-04T12:00:00.000Z', required: false })
  @IsOptional()
  @IsString()
  date?: string

  @ApiProperty({ example: 'Lunch', required: false })
  @IsOptional()
  @IsString()
  memo?: string
}

export class IncomeBodyDto {
  @ApiProperty({ example: 'USER_ID_UUID' })
  @IsUUID()
  userId!: string

  @ApiProperty({ example: 'GL_ACC_ID_CASH_OR_BANK' })
  @IsString()
  receiveToGlAccountId!: string

  @ApiProperty({ example: 'GL_ACC_ID_INCOME' })
  @IsString()
  incomeGlAccountId!: string

  @ApiProperty({ example: 1500 })
  @IsNumber()
  @IsPositive()
  amount!: number

  @ApiProperty({ example: 'TWD', enum: CURRENCIES })
  @IsIn([...CURRENCIES])
  currency!: Currency

  @ApiProperty({ example: '2025-11-04T09:30:00.000Z', required: false })
  @IsOptional()
  @IsString()
  date?: string

  @ApiProperty({ example: 'Salary (partial)', required: false })
  @IsOptional()
  @IsString()
  memo?: string
}
