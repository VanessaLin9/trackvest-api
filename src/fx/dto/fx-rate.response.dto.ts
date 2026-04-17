import { ApiProperty } from '@nestjs/swagger'

export class FxRateResponseDto {
  @ApiProperty({ example: 'TWD' })
  base!: string

  @ApiProperty({ example: 'USD' })
  quote!: string

  @ApiProperty({ example: 0.03125 })
  rate!: number

  @ApiProperty({ example: '2026-04-14' })
  date!: string

  @ApiProperty({ example: 'db' })
  provider!: string
}
