import { ApiProperty } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'
import { IsIn, IsString, Length, Matches } from 'class-validator'
import { SUPPORTED_BROKER } from '../../accounts/account-broker.constants'
import {
  ASSET_NAME_REGEX,
  normalizeAssetNameInput,
} from '../../common/utils'

export class CreateAssetAliasDto {
  @ApiProperty({
    description: 'Raw broker display name to map to an existing Asset',
    example: '國泰台灣領袖50',
  })
  @Expose()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAssetNameInput(value) : value)
  @IsString()
  @Length(1, 100)
  @Matches(ASSET_NAME_REGEX, {
    message: 'alias contains unsupported characters',
  })
  alias!: string

  @ApiProperty({
    description: 'Broker scope for the alias. Only Cathay is accepted in this flow.',
    example: SUPPORTED_BROKER,
    enum: [SUPPORTED_BROKER],
  })
  @Expose()
  @IsString()
  @IsIn([SUPPORTED_BROKER], {
    message: `broker must be "${SUPPORTED_BROKER}"`,
  })
  broker!: string
}
