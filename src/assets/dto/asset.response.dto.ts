// src/assets/dto/asset.response.dto.ts
import { ApiProperty, IntersectionType } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { AssetBaseDto } from './asset.base.dto'

export class AssetBaseResponseDto {
  @ApiProperty({ example: 'e8e1d0a6-...' })
  @Expose()
  id!: string
}

export class AssetResponseDto extends IntersectionType(
  AssetBaseDto,
  AssetBaseResponseDto,
) {}
