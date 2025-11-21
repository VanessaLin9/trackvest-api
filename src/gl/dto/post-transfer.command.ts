import { ApiProperty } from '@nestjs/swagger'
import { IsUUID, IsNumber, IsPositive, IsEnum, IsOptional, IsDateString, IsString } from 'class-validator'
import { Currency } from '@prisma/client'
import { Type } from 'class-transformer'

export class PostTransferCommand {
  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  userId!: string

  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  fromGlAccountId!: string

  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  toGlAccountId!: string

  @ApiProperty({ example: 1000 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number

  @ApiProperty({ example: 'TWD', enum: Currency })
  @IsEnum(Currency)
  currency!: Currency

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z', required: false })
  @IsOptional()
  @IsDateString()
  date?: string

  @ApiProperty({ example: 'Transfer from account to account', required: false })
  @IsOptional()
  @IsString()
  memo?: string

  @ApiProperty({ example: 'manual:transfer', required: false })
  @IsOptional()
  @IsString()
  source?: string
}

