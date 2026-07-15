import { ConflictException } from '@nestjs/common'
import { AssetAliasMappedAssetDto } from './dto/asset-alias.response.dto'

export const ASSET_ALIAS_CONFLICT_CODE = 'ASSET_ALIAS_CONFLICT' as const

export type AssetAliasConflictBody = {
  code: typeof ASSET_ALIAS_CONFLICT_CODE
  message: string
  existingAsset: AssetAliasMappedAssetDto
}

export class AssetAliasConflictException extends ConflictException {
  constructor(existingAsset: AssetAliasMappedAssetDto) {
    const body: AssetAliasConflictBody = {
      code: ASSET_ALIAS_CONFLICT_CODE,
      message: 'Asset alias already maps to another asset',
      existingAsset,
    }
    super(body)
  }
}
