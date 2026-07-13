import { ApiProperty } from '@nestjs/swagger'

export class ImportCommitResponseDto {
  @ApiProperty({ example: 10 })
  totalRows!: number

  @ApiProperty({ example: 10 })
  successCount!: number

  @ApiProperty({ example: 0 })
  skippedCount!: number

  @ApiProperty({ example: 0 })
  failureCount!: number

  @ApiProperty({
    example: ['9f5a51ae-1cca-401e-afa7-1ebf541d0000'],
    type: [String],
  })
  createdTransactionIds!: string[]
}
