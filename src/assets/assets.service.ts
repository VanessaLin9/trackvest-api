// src/assets/assets.service.ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { AssetClass, AssetType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { AssetAliasConflictException } from './asset-alias-conflict.exception'
import { CreateAndUpdateAssetDto } from './dto/asset.createAndUpdate.dto'
import { CreateAssetAliasDto } from './dto/create-asset-alias.dto'
import { FindAssetsDto } from './dto/find-assets.dto'
import {
  normalizeAssetCurrencyInput,
  normalizeAssetNameInput,
  normalizeAssetSearchInput,
  normalizeAssetSymbolInput,
} from '../common/utils'

type AssetAliasMappedAsset = {
  id: string
  symbol: string
  name: string
}

type AssetAliasMapping = {
  id: string
  assetId: string
  alias: string
  broker: string
  asset: AssetAliasMappedAsset
}

const EQUITY_ETF_SYMBOLS = new Set(['0050', '006208'])
const BOND_ETF_SYMBOLS = new Set(['SGOV', 'BNDW'])
const BOND_ETF_KEYWORDS = ['bond', 'treasury']
const PRECIOUS_METAL_KEYWORDS = ['gold', 'silver', 'precious']

type NormalizedAssetPayload = Omit<CreateAndUpdateAssetDto, 'assetClass'> & {
  assetClass: AssetClass
}

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  private normalizeAssetPayload(
    dto: CreateAndUpdateAssetDto,
    options?: { fallbackAssetClass?: AssetClass },
  ): NormalizedAssetPayload {
    const normalizedDto = {
      ...dto,
      symbol: normalizeAssetSymbolInput(dto.symbol),
      name: normalizeAssetNameInput(dto.name),
      baseCurrency: normalizeAssetCurrencyInput(dto.baseCurrency),
    }

    return {
      ...normalizedDto,
      assetClass: this.resolveAssetClass(normalizedDto, options?.fallbackAssetClass),
    }
  }

  private resolveAssetClass(
    dto: CreateAndUpdateAssetDto,
    fallbackAssetClass?: AssetClass,
  ): AssetClass {
    if (dto.assetClass) {
      this.assertCompatibleAssetClass(dto.type, dto.assetClass)
      return dto.assetClass
    }

    if (fallbackAssetClass) {
      this.assertCompatibleAssetClass(dto.type, fallbackAssetClass)
      return fallbackAssetClass
    }

    const inferredAssetClass = this.inferAssetClass(dto)

    if (inferredAssetClass) {
      return inferredAssetClass
    }

    throw new BadRequestException(
      `assetClass is required for ${dto.type} assets when it cannot be inferred automatically`,
    )
  }

  private inferAssetClass(dto: Pick<CreateAndUpdateAssetDto, 'symbol' | 'name' | 'type'>): AssetClass | null {
    switch (dto.type) {
      case AssetType.equity:
        return AssetClass.equity
      case AssetType.crypto:
        return AssetClass.crypto
      case AssetType.cash:
        return AssetClass.cash
      case AssetType.etf: {
        if (EQUITY_ETF_SYMBOLS.has(dto.symbol)) {
          return AssetClass.equity
        }

        const normalizedName = dto.name.toLowerCase()

        if (
          BOND_ETF_SYMBOLS.has(dto.symbol)
          || BOND_ETF_KEYWORDS.some((keyword) => normalizedName.includes(keyword))
        ) {
          return AssetClass.bond
        }

        if (PRECIOUS_METAL_KEYWORDS.some((keyword) => normalizedName.includes(keyword))) {
          return AssetClass.precious_metal
        }

        return null
      }
      default:
        return null
    }
  }

  private assertCompatibleAssetClass(type: AssetType, assetClass: AssetClass) {
    const expectedAssetClassByType: Partial<Record<AssetType, AssetClass>> = {
      [AssetType.equity]: AssetClass.equity,
      [AssetType.crypto]: AssetClass.crypto,
      [AssetType.cash]: AssetClass.cash,
    }

    const expectedAssetClass = expectedAssetClassByType[type]

    if (expectedAssetClass && assetClass !== expectedAssetClass) {
      throw new BadRequestException(
        `${type} assets must use assetClass "${expectedAssetClass}"`,
      )
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

    if (query.assetClass) {
      where.assetClass = query.assetClass
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
    const existingAsset = await this.findOne(id)
    const normalizedDto = this.normalizeAssetPayload(dto, {
      fallbackAssetClass: existingAsset.assetClass,
    })
    
    // Check if another asset with same symbol exists (excluding current one)
    const conflictingAsset = await this.prisma.asset.findFirst({ 
      where: { 
        symbol: normalizedDto.symbol,
        id: { not: id }
      } 
    })
    if (conflictingAsset) {
      throw new ConflictException('Asset with this symbol already exists')
    }
    
    return this.prisma.asset.update({ where: { id }, data: normalizedDto })
  }

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.asset.delete({ where: { id } })
  }

  async createAlias(assetId: string, dto: CreateAssetAliasDto): Promise<AssetAliasMapping> {
    const alias = normalizeAssetNameInput(dto.alias)
    if (!alias) {
      throw new BadRequestException('alias must not be empty')
    }

    const broker = dto.broker
    await this.findOne(assetId)

    const existing = await this.findAliasByPair(alias, broker)
    if (existing) {
      return this.resolveExistingAliasMapping(existing, assetId)
    }

    try {
      const created = await this.prisma.assetAlias.create({
        data: { assetId, alias, broker },
        include: {
          asset: {
            select: { id: true, symbol: true, name: true },
          },
        },
      })

      return {
        id: created.id,
        assetId: created.assetId,
        alias: created.alias,
        broker: created.broker,
        asset: created.asset,
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        const raced = await this.findAliasByPair(alias, broker)
        if (raced) {
          return this.resolveExistingAliasMapping(raced, assetId)
        }
      }

      throw error
    }
  }

  private async findAliasByPair(alias: string, broker: string) {
    return this.prisma.assetAlias.findUnique({
      where: {
        alias_broker: { alias, broker },
      },
      include: {
        asset: {
          select: { id: true, symbol: true, name: true },
        },
      },
    })
  }

  private resolveExistingAliasMapping(
    existing: AssetAliasMapping,
    assetId: string,
  ): AssetAliasMapping {
    if (existing.assetId === assetId) {
      return {
        id: existing.id,
        assetId: existing.assetId,
        alias: existing.alias,
        broker: existing.broker,
        asset: existing.asset,
      }
    }

    throw new AssetAliasConflictException(existing.asset)
  }
}
