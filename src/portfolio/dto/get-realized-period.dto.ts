import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type, Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'
import { SUPPORTED_CURRENCIES } from '../../common/constants/currency.constants'
import { normalizeAssetCurrencyInput } from '../../common/utils'

export class GetRealizedPeriodsDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1900,
    maximum: 9999,
    example: 2024,
    description:
      'Taipei calendar year. Years after the current Taipei year are rejected.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  year!: number

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Optional account scope. The account must belong to the signed-in user, including when the caller is an admin.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string
}

export class GetRealizedAssetsDto extends GetRealizedPeriodsDto {
  @ApiProperty({ enum: SUPPORTED_CURRENCIES, example: 'TWD' })
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAssetCurrencyInput(value) : value,
  )
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 12,
    description:
      'Taipei month. Omit for the whole year. A month that has not started is rejected.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number

  @ApiPropertyOptional({ type: 'integer', minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number
}

export class GetRealizedTradesDto extends GetRealizedAssetsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  assetId!: string
}
