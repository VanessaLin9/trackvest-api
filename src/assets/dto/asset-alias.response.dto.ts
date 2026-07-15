import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { SUPPORTED_BROKER } from '../../accounts/account-broker.constants'

export class AssetAliasMappedAssetDto {
  @ApiProperty({ example: 'e8e1d0a6-...' })
  @Expose()
  id!: string

  @ApiProperty({ example: '00900' })
  @Expose()
  symbol!: string

  @ApiProperty({ example: '國泰台灣領袖50' })
  @Expose()
  name!: string
}

export class AssetAliasResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  @Expose()
  id!: string

  @ApiProperty({ example: 'e8e1d0a6-...' })
  @Expose()
  assetId!: string

  @ApiProperty({ example: '國泰台灣領袖50' })
  @Expose()
  alias!: string

  @ApiProperty({ example: SUPPORTED_BROKER })
  @Expose()
  broker!: string

  @ApiProperty({ type: AssetAliasMappedAssetDto })
  @Expose()
  @Type(() => AssetAliasMappedAssetDto)
  asset!: AssetAliasMappedAssetDto
}

export class AssetAliasConflictResponseDto {
  @ApiProperty({ example: 'ASSET_ALIAS_CONFLICT' })
  code!: string

  @ApiProperty({
    example: 'Asset alias already maps to another asset',
  })
  message!: string

  @ApiProperty({ type: AssetAliasMappedAssetDto })
  existingAsset!: AssetAliasMappedAssetDto
}
