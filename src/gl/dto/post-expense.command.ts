import { ApiProperty } from '@nestjs/swagger'
import { IsUUID, IsNumber, IsPositive, IsEnum, IsOptional, IsDateString, IsString } from 'class-validator'
import { Currency } from '@prisma/client'
import { Type } from 'class-transformer'

export class PostExpenseCommand {
  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  userId!: string

  @ApiProperty({ example: 'GL_ACC_ID_CASH_OR_BANK' })
  @IsUUID()
  payFromGlAccountId!: string

  @ApiProperty({ example: 'GL_ACC_ID_EXPENSE' })
  @IsUUID()
  expenseGlAccountId!: string

  @ApiProperty({ example: 320 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number

  @ApiProperty({ example: 'TWD', enum: Currency })
  @IsEnum(Currency)
  currency!: Currency

  @ApiProperty({ example: '2025-11-04T12:00:00.000Z', required: false })
  @IsOptional()
  @IsDateString()
  date?: string

  @ApiProperty({ example: 'Lunch', required: false })
  @IsOptional()
  @IsString()
  memo?: string

  @ApiProperty({ example: 'manual:expense', required: false })
  @IsOptional()
  @IsString()
  source?: string
}

