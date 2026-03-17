import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsUUID, Length } from 'class-validator'

export class ImportTransactionsDto {
  @ApiProperty({
    description: 'Target brokerage account ID for the import',
    example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000',
  })
  @IsUUID()
  accountId!: string

  @ApiProperty({
    description: 'Raw CSV or TSV content copied from the uploaded brokerage file',
    example:
      '股名\\t日期\\t成交股數\\t淨收付\\t成交單價\\t成交價金\\t手續費\\t交易稅\\t稅款\\t委託書號\\t幣別\\t備註',
  })
  @IsString()
  @Length(1)
  csvContent!: string
}
