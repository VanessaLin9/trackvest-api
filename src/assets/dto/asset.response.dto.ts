// src/assets/dto/asset.response.dto.ts
import { ApiProperty, IntersectionType } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
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

export class AssetListResponseDto {
  @ApiProperty({ type: AssetResponseDto, isArray: true })
  @Expose()
  @Type(() => AssetResponseDto)
  items!: AssetResponseDto[]

  @ApiProperty({ example: 42 })
  @Expose()
  total!: number

  @ApiProperty({ example: 1 })
  @Expose()
  page!: number

  @ApiProperty({ example: 10 })
  @Expose()
  take!: number
}
