import { ApiPropertyOptional, OmitType } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { AssetClass } from '@prisma/client'
import { IsEnum, IsOptional } from 'class-validator'
import { AssetBaseDto } from './asset.base.dto'

export class CreateAndUpdateAssetDto extends OmitType(AssetBaseDto, ['assetClass'] as const) {
  @ApiPropertyOptional({
    description: '資產本質分類；若省略，後端只會在可明確推論時自動補上',
    example: 'equity',
    enum: AssetClass,
  })
  @Expose()
  @IsOptional()
  @IsEnum(AssetClass)
  assetClass?: AssetClass
}
