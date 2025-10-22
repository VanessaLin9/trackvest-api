// src/assets/assets.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger'
import { AssetsService } from './assets.service'
import { CreateAndUpdateAssetDto } from './dto/asset.createAndUpdate.dto'
import { AssetResponseDto } from './dto/asset.response.dto'
import { plainToInstance } from 'class-transformer'

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Post()
  @ApiCreatedResponse({ type: AssetResponseDto })
  async create(@Body() dto: CreateAndUpdateAssetDto): Promise<AssetResponseDto> {
    const created = await this.svc.create(dto)
    return plainToInstance(AssetResponseDto, created, { excludeExtraneousValues: true })
  }

  @Get()
  @ApiOkResponse({ type: AssetResponseDto, isArray: true })
  async findAll(): Promise<AssetResponseDto[]> {
    const list = await this.svc.findAll()
    return list.map(e => plainToInstance(AssetResponseDto, e, { excludeExtraneousValues: true }))
  }

  @Get('symbol/:symbol')
  @ApiOkResponse({ type: AssetResponseDto })
  async findBySymbol(@Param('symbol') symbol: string): Promise<AssetResponseDto> {
    const asset = await this.svc.findBySymbol(symbol)
    return plainToInstance(AssetResponseDto, asset, { excludeExtraneousValues: true })
  }

  @Get(':id')
  @ApiOkResponse({ type: AssetResponseDto })
  async findOne(@Param('id') id: string): Promise<AssetResponseDto> {
    const asset = await this.svc.findOne(id)
    return plainToInstance(AssetResponseDto, asset, { excludeExtraneousValues: true })
  }

  @Patch(':id')
  @ApiOkResponse({ type: AssetResponseDto })
  async update(@Param('id') id: string, @Body() dto: CreateAndUpdateAssetDto): Promise<AssetResponseDto> {
    const asset = await this.svc.update(id, dto)
    return plainToInstance(AssetResponseDto, asset, { excludeExtraneousValues: true })
  } 

  @Delete(':id')
  @ApiOkResponse({ type: AssetResponseDto })
  async remove(@Param('id') id: string): Promise<AssetResponseDto> {
    const asset = await this.svc.remove(id)
    return plainToInstance(AssetResponseDto, asset, { excludeExtraneousValues: true })
  }
}
