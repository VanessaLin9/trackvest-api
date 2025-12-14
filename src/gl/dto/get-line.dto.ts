// src/gl/dto/get-line.dto.ts
import { ApiProperty } from '@nestjs/swagger'
import { GlAccount, GlLine } from '@prisma/client'
import { IsIn, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator'

export class GlLineDto {
  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  id!: string

  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  glAccountId!: string

  @ApiProperty({ example: 'Expense: Food' })
  @IsString()
  @IsOptional()
  glAccountName?: string

  @ApiProperty({ example: 'debit', enum: ['debit', 'credit'] })
  @IsIn(['debit', 'credit'])
  side!: 'debit' | 'credit'

  @ApiProperty({ example: 320 })
  @IsNumber()
  amount!: number

  @ApiProperty({ example: 'TWD' })
  @IsString()
  currency!: string

  static fromEntity(entity: GlLine & { glAccount?: GlAccount }): GlLineDto {
    return {
      id: entity.id,
      glAccountId: entity.glAccountId,
      glAccountName: entity.glAccount?.name,
      side: entity.side,
      amount: Number(entity.amount),
      currency: entity.currency,
    }
  }
}
