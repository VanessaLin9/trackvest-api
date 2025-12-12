import { ApiProperty } from '@nestjs/swagger'
import { GlEntry } from '@prisma/client'
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator'

export class GlEntryDto {
  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  id!: string

  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  userId!: string

  @ApiProperty({ example: '2025-01-15T10:00:00Z' })
  @IsDateString()
  date!: string

  @ApiProperty({ example: 'Transfer from account to account' })
  @IsString()
  @IsOptional()
  memo?: string

  @ApiProperty({ example: 'manual:transfer' })
  @IsString()
  @IsOptional()
  source?: string

  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  @IsOptional()
  refTxId?: string

  static fromEntity(entity: GlEntry): GlEntryDto {
    return {
      id: entity.id,
      userId: entity.userId,
      date: entity.date.toISOString(),
      memo: entity.memo,
      source: entity.source,
      refTxId: entity.refTxId,
    }
  }
}