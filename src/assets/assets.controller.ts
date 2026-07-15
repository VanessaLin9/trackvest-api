// src/assets/assets.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { AssetsService } from './assets.service'
import {
  AssetAliasConflictResponseDto,
  AssetAliasResponseDto,
} from './dto/asset-alias.response.dto'
import { CreateAndUpdateAssetDto } from './dto/asset.createAndUpdate.dto'
import { AssetListResponseDto, AssetResponseDto } from './dto/asset.response.dto'
import { CreateAssetAliasDto } from './dto/create-asset-alias.dto'
import { FindAssetsDto } from './dto/find-assets.dto'
import { ErrorResponse } from '../common/dto'
import { Serialize } from '../common/interceptors/serialize.interceptor'

@ApiTags('assets')
@ApiCookieAuth('access_token')
@ApiBadRequestResponse({ type: ErrorResponse })
@Controller('assets')
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Post()
  @ApiCreatedResponse({ type: AssetResponseDto })
  @Serialize(AssetResponseDto)
  async create(@Body() dto: CreateAndUpdateAssetDto) {
    return this.svc.create(dto)
  }

  @Post(':id/aliases')
  @ApiOperation({
    summary: 'Create a broker-specific asset alias',
    description:
      'Maps a Cathay broker display name to an existing catalog Asset. '
      + 'Creating the same normalized (alias, broker) pair for the same Asset is idempotent. '
      + 'If the pair already maps to another Asset, returns ASSET_ALIAS_CONFLICT without overwriting.',
  })
  @ApiCreatedResponse({ type: AssetAliasResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponse })
  @ApiConflictResponse({ type: AssetAliasConflictResponseDto })
  @Serialize(AssetAliasResponseDto)
  async createAlias(
    @Param('id') id: string,
    @Body() dto: CreateAssetAliasDto,
  ) {
    return this.svc.createAlias(id, dto)
  }

  @Get()
  @ApiOkResponse({ type: AssetListResponseDto })
  @Serialize(AssetListResponseDto)
  async findAll(@Query() query: FindAssetsDto) {
    return this.svc.findAll(query)
  }

  @Get('symbol/:symbol')
  @ApiOkResponse({ type: AssetResponseDto })
  @Serialize(AssetResponseDto)
  async findBySymbol(@Param('symbol') symbol: string) {
    return this.svc.findBySymbol(symbol)
  }

  @Get(':id')
  @ApiOkResponse({ type: AssetResponseDto })
  @Serialize(AssetResponseDto)
  async findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  @Patch(':id')
  @ApiOkResponse({ type: AssetResponseDto })
  @Serialize(AssetResponseDto)
  async update(@Param('id') id: string, @Body() dto: CreateAndUpdateAssetDto) {
    return this.svc.update(id, dto)
  }

  @Delete(':id')
  @ApiOkResponse({ type: AssetResponseDto })
  @Serialize(AssetResponseDto)
  async remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}
