// src/accounts/accounts.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateAndUpdateAccountDto } from './dto/account.createAndUpdate.dto'
import { OwnershipService } from '../common/services/ownership.service'

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private ownershipService: OwnershipService,
  ) {}

  async create(dto: CreateAndUpdateAccountDto, userId: string) {
    // Validate user exists and ensure userId matches
    await this.ownershipService.validateUserExists(userId)
    
    // Ensure the DTO userId matches the authenticated user
    if (dto.userId !== userId) {
      throw new NotFoundException('User ID mismatch')
    }
    
    return this.prisma.account.create({ data: { ...dto, userId } })
  }

  findAll(userId: string) {
    // Always filter by userId for security
    return this.prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string, userId: string) {
    // Validate ownership
    await this.ownershipService.validateAccountOwnership(id, userId)
    
    const acc = await this.prisma.account.findUnique({ where: { id } })
    if (!acc) throw new NotFoundException('Account not found')
    return acc
  }

  async update(id: string, dto: CreateAndUpdateAccountDto, userId: string) {
    // Validate ownership
    await this.ownershipService.validateAccountOwnership(id, userId)
    
    // Ensure the DTO userId matches the authenticated user
    if (dto.userId !== userId) {
      throw new NotFoundException('User ID mismatch')
    }
    
    return this.prisma.account.update({ where: { id }, data: { ...dto, userId } })
  }

  async remove(id: string, userId: string) {
    // Validate ownership
    await this.ownershipService.validateAccountOwnership(id, userId)
    
    return this.prisma.account.delete({ where: { id } })
  }
}
