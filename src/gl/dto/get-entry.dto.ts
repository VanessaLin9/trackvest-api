import { ApiProperty } from '@nestjs/swagger'
import { GlAccount, GlEntry, GlLine } from '@prisma/client'
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator'
import { GlLineDto } from './get-line.dto'

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

  @ApiProperty({ type: [GlLineDto] })
  lines!: GlLineDto[]

  static fromEntity(entity: GlEntry & { lines: (GlLine & { glAccount?: GlAccount })[] }): GlEntryDto {
    return {
      id: entity.id,
      userId: entity.userId,
      date: entity.date instanceof Date ? entity.date.toISOString() : entity.date,
      memo: entity.memo,
      source: entity.source,
      refTxId: entity.refTxId,
      lines: (entity.lines ?? []).map((line) => GlLineDto.fromEntity(line)),
    }
  }
}