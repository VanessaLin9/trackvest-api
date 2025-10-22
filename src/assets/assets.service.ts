// src/assets/assets.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateAndUpdateAssetDto } from './dto/asset.createAndUpdate.dto'

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAndUpdateAssetDto) {
    // Check if asset with same symbol already exists
    const existingAsset = await this.prisma.asset.findUnique({ 
      where: { symbol: dto.symbol } 
    })
    if (existingAsset) {
      throw new ConflictException('Asset with this symbol already exists')
    }
    
    return this.prisma.asset.create({ data: dto })
  }

  findAll() {
    return this.prisma.asset.findMany({
      orderBy: { symbol: 'asc' },
    })
  }

  async findOne(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } })
    if (!asset) throw new NotFoundException('Asset not found')
    return asset
  }

  async findBySymbol(symbol: string) {
    const asset = await this.prisma.asset.findUnique({ where: { symbol } })
    if (!asset) throw new NotFoundException('Asset not found')
    return asset
  }

  async update(id: string, dto: CreateAndUpdateAssetDto) {
    await this.findOne(id)
    
    // Check if another asset with same symbol exists (excluding current one)
    const existingAsset = await this.prisma.asset.findFirst({ 
      where: { 
        symbol: dto.symbol,
        id: { not: id }
      } 
    })
    if (existingAsset) {
      throw new ConflictException('Asset with this symbol already exists')
    }
    
    return this.prisma.asset.update({ where: { id }, data: dto })
  }

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.asset.delete({ where: { id } })
  }
}
