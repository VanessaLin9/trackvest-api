// src/accounts/accounts.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { AccountType } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { CreateAndUpdateAccountDto } from './dto/account.createAndUpdate.dto'
import { OwnershipService } from '../common/services/ownership.service'
import { SUPPORTED_BROKER } from './account-broker.constants'

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private ownershipService: OwnershipService,
  ) {}

  private normalizeBroker(type: AccountType, broker?: string | null): string | null {
    const normalizedBroker = broker?.trim().toLowerCase() || null

    if (type !== AccountType.broker) {
      return null
    }

    if (!normalizedBroker) {
      return null
    }

    if (normalizedBroker !== SUPPORTED_BROKER) {
      throw new BadRequestException(
        `Broker must be ${SUPPORTED_BROKER} or empty for broker accounts`,
      )
    }

    return normalizedBroker
  }

  private buildAccountData(dto: CreateAndUpdateAccountDto) {
    const trimmedName = dto.name.trim()
    if (!trimmedName) {
      throw new BadRequestException('Account name is required')
    }

    return {
      userId: dto.userId,
      name: trimmedName,
      type: dto.type,
      currency: dto.currency,
      broker: this.normalizeBroker(dto.type, dto.broker),
    }
  }

  async create(dto: CreateAndUpdateAccountDto, userId: string) {
    // Validate user exists
    await this.ownershipService.validateUserExists(dto.userId)
    
    // Ensure the DTO userId matches the authenticated user (unless admin)
    const isAdmin = await this.ownershipService.isAdmin(userId)
    if (!isAdmin && dto.userId !== userId) {
      throw new NotFoundException('User ID mismatch')
    }
    
    return this.prisma.account.create({ data: this.buildAccountData(dto) })
  }

  async findAll(userId: string) {
    // Admins can see all accounts, regular users only their own
    const isAdmin = await this.ownershipService.isAdmin(userId)
    return this.prisma.account.findMany({
      where: isAdmin ? undefined : { userId },
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
    // Validate ownership (admins can update any account)
    await this.ownershipService.validateAccountOwnership(id, userId)
    
    // Ensure the DTO userId matches the authenticated user (unless admin)
    const isAdmin = await this.ownershipService.isAdmin(userId)
    if (!isAdmin && dto.userId !== userId) {
      throw new NotFoundException('User ID mismatch')
    }
    
    return this.prisma.account.update({ where: { id }, data: this.buildAccountData(dto) })
  }

  async remove(id: string, userId: string) {
    // Validate ownership
    await this.ownershipService.validateAccountOwnership(id, userId)
    
    return this.prisma.account.delete({ where: { id } })
  }
}
