// src/assets/assets.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger'
import { AssetsService } from './assets.service'
import { CreateAndUpdateAssetDto } from './dto/asset.createAndUpdate.dto'
import { AssetListResponseDto, AssetResponseDto } from './dto/asset.response.dto'
import { FindAssetsDto } from './dto/find-assets.dto'
import { Serialize } from '../common/interceptors/serialize.interceptor'

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Post()
  @ApiCreatedResponse({ type: AssetResponseDto })
  @Serialize(AssetResponseDto)
  async create(@Body() dto: CreateAndUpdateAssetDto) {
    return this.svc.create(dto)
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
