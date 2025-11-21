import { ApiProperty } from '@nestjs/swagger'
import { IsUUID, IsNumber, IsPositive, IsEnum, IsOptional, IsDateString, IsString } from 'class-validator'
import { Currency } from '@prisma/client'
import { Type } from 'class-transformer'

export class PostIncomeCommand {
  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  userId!: string

  @ApiProperty({ example: 'GL_ACC_ID_CASH_OR_BANK' })
  @IsUUID()
  receiveToGlAccountId!: string

  @ApiProperty({ example: 'GL_ACC_ID_INCOME' })
  @IsUUID()
  incomeGlAccountId!: string

  @ApiProperty({ example: 1500 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number

  @ApiProperty({ example: 'TWD', enum: Currency })
  @IsEnum(Currency)
  currency!: Currency

  @ApiProperty({ example: '2025-11-04T09:30:00.000Z', required: false })
  @IsOptional()
  @IsDateString()
  date?: string

  @ApiProperty({ example: 'Salary (partial)', required: false })
  @IsOptional()
  @IsString()
  memo?: string

  @ApiProperty({ example: 'manual:income', required: false })
  @IsOptional()
  @IsString()
  source?: string
}

