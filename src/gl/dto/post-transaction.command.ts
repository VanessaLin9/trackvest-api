import { ApiProperty } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import { Transaction } from '@prisma/client'

/**
 * Command DTO for automatic transaction posting
 * Wraps a Transaction entity for posting to GL
 */
export class PostTransactionCommand {
  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  userId!: string

  @ApiProperty({ description: 'Transaction to post to GL' })
  transaction!: Transaction
}

