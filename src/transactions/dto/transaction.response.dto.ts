// src/transactions/dto/transaction.response.dto.ts
import { ApiProperty, IntersectionType } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { TransactionBaseDto } from './transaction.base.dto'

export class TransactionBaseResponseDto {
  @ApiProperty({ example: 'e8e1d0a6-...' })
  @Expose()
  id!: string

  @ApiProperty({ example: false })
  @Expose()
  isDeleted!: boolean

  @ApiProperty({ example: '2025-01-20T10:30:00.000Z' })
  @Expose()
  deletedAt!: Date | null

  @ApiProperty({ example: '2025-01-20T10:30:00.000Z' })
  @Expose()
  tradeTime!: Date
}

export class TransactionResponseDto extends IntersectionType(
  TransactionBaseDto,
  TransactionBaseResponseDto,
) {}
