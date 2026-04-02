// src/assets/assets.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { CreateAndUpdateAssetDto } from './dto/asset.createAndUpdate.dto'
import { FindAssetsDto } from './dto/find-assets.dto'
import {
  normalizeAssetCurrencyInput,
  normalizeAssetNameInput,
  normalizeAssetSearchInput,
  normalizeAssetSymbolInput,
} from '../common/utils'

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  private normalizeAssetPayload(dto: CreateAndUpdateAssetDto): CreateAndUpdateAssetDto {
    return {
      ...dto,
      symbol: normalizeAssetSymbolInput(dto.symbol),
      name: normalizeAssetNameInput(dto.name),
      baseCurrency: normalizeAssetCurrencyInput(dto.baseCurrency),
    }
  }

  async create(dto: CreateAndUpdateAssetDto) {
    const normalizedDto = this.normalizeAssetPayload(dto)

    // Check if asset with same symbol already exists
    const existingAsset = await this.prisma.asset.findUnique({ 
      where: { symbol: normalizedDto.symbol } 
    })
    if (existingAsset) {
      throw new ConflictException('Asset with this symbol already exists')
    }
    
    return this.prisma.asset.create({ data: normalizedDto })
  }

  findAll(query: FindAssetsDto = {}) {
    const where: Prisma.AssetWhereInput = {}
    const search = query.q
      ? normalizeAssetSearchInput(query.q)
      : undefined
    const baseCurrency = query.baseCurrency
      ? normalizeAssetCurrencyInput(query.baseCurrency)
      : undefined
    const page = query.page ?? 1
    const take = query.take ?? 10
    const skip = (page - 1) * take

    if (search) {
      where.OR = [
        { symbol: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (query.type) {
      where.type = query.type
    }

    if (baseCurrency) {
      where.baseCurrency = baseCurrency
    }

    return this.prisma.$transaction(async (db) => {
      const [items, total] = await Promise.all([
        db.asset.findMany({
          where,
          orderBy: { symbol: 'asc' },
          skip,
          take,
        }),
        db.asset.count({ where }),
      ])

      return {
        items,
        total,
        page,
        take,
      }
    })
  }

  async findOne(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } })
    if (!asset) throw new NotFoundException('Asset not found')
    return asset
  }

  async findBySymbol(symbol: string) {
    const normalizedSymbol = normalizeAssetSymbolInput(symbol)
    const asset = await this.prisma.asset.findUnique({ where: { symbol: normalizedSymbol } })
    if (!asset) throw new NotFoundException('Asset not found')
    return asset
  }

  async update(id: string, dto: CreateAndUpdateAssetDto) {
    await this.findOne(id)
    const normalizedDto = this.normalizeAssetPayload(dto)
    
    // Check if another asset with same symbol exists (excluding current one)
    const existingAsset = await this.prisma.asset.findFirst({ 
      where: { 
        symbol: normalizedDto.symbol,
        id: { not: id }
      } 
    })
    if (existingAsset) {
      throw new ConflictException('Asset with this symbol already exists')
    }
    
    return this.prisma.asset.update({ where: { id }, data: normalizedDto })
  }

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.asset.delete({ where: { id } })
  }
}
