import { ApiProperty } from '@nestjs/swagger'

export class ImportTransactionsErrorDto {
  @ApiProperty({ example: 2 })
  row!: number

  @ApiProperty({ example: '股名' })
  field!: string

  @ApiProperty({ example: 'Asset alias not found for 富邦台50' })
  message!: string
}

export class ImportTransactionsResponseDto {
  @ApiProperty({ example: 3 })
  totalRows!: number

  @ApiProperty({ example: 2 })
  successCount!: number

  @ApiProperty({ example: 1 })
  failureCount!: number

  @ApiProperty({
    example: ['9f5a51ae-1cca-401e-afa7-1ebf541d0000'],
    type: [String],
  })
  createdTransactionIds!: string[]

  @ApiProperty({ type: [ImportTransactionsErrorDto] })
  errors!: ImportTransactionsErrorDto[]
}
