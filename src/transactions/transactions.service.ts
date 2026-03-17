import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { FindTransactionsDto } from './dto/find-transaction.dto'
import { Prisma, Transaction } from '@prisma/client'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { CreateAndUpdateTransactionDto } from './dto/transaction.createAndUpdate.dto'
import { PostingService } from 'src/gl/posting.service'
import { OwnershipService } from '../common/services/ownership.service'

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private postingService: PostingService,
    private ownershipService: OwnershipService,
  ) {}

  private validateTransactionBusinessRules(
    dto: CreateTransactionDto | CreateAndUpdateTransactionDto,
  ) {
    const hasAsset = typeof dto.assetId === 'string' && dto.assetId.length > 0
    const amount = Number(dto.amount)
    const quantity = dto.quantity === undefined ? undefined : Number(dto.quantity)
    const price = dto.price === undefined ? undefined : Number(dto.price)
    const fee = dto.fee === undefined ? 0 : Number(dto.fee)
    const tax = dto.tax === undefined ? 0 : Number(dto.tax)

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number')
    }

    if (!Number.isFinite(fee) || fee < 0) {
      throw new BadRequestException('Fee must be zero or a positive number')
    }

    if (!Number.isFinite(tax) || tax < 0) {
      throw new BadRequestException('Tax must be zero or a positive number')
    }

    switch (dto.type) {
      case 'buy':
      case 'sell':
        if (!hasAsset) {
          throw new BadRequestException(`Asset is required for ${dto.type} transactions`)
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new BadRequestException(`Quantity must be a positive number for ${dto.type} transactions`)
        }
        if (!Number.isFinite(price) || price <= 0) {
          throw new BadRequestException(`Price must be a positive number for ${dto.type} transactions`)
        }
        return
      case 'dividend':
        if (!hasAsset) {
          throw new BadRequestException('Asset is required for dividend transactions')
        }
        if (dto.quantity !== undefined) {
          throw new BadRequestException('Quantity is not allowed for dividend transactions')
        }
        if (dto.price !== undefined) {
          throw new BadRequestException('Price is not allowed for dividend transactions')
        }
        return
      case 'deposit':
        if (hasAsset) {
          throw new BadRequestException('Asset is not allowed for deposit transactions')
        }
        if (dto.quantity !== undefined) {
          throw new BadRequestException('Quantity is not allowed for deposit transactions')
        }
        if (dto.price !== undefined) {
          throw new BadRequestException('Price is not allowed for deposit transactions')
        }
        if (fee !== 0) {
          throw new BadRequestException('Fee must be zero for deposit transactions')
        }
        if (tax !== 0) {
          throw new BadRequestException('Tax must be zero for deposit transactions')
        }
        return
      default:
        return
    }
  }

  async findAll(q: FindTransactionsDto, userId: string) {
    const isAdmin = await this.ownershipService.isAdmin(userId)
    
    const where: Prisma.TransactionWhereInput = {}
    
    // Admins can see all transactions, regular users only their own
    if (!isAdmin) {
      where.account = {
        userId,
      }
    }
    
    // 軟刪過濾
    const includeDeleted = q.includeDeleted === 'true'
    if (!includeDeleted) where.isDeleted = false

    if (q.accountId) {
      // Validate account belongs to user (or admin can access any)
      await this.ownershipService.validateAccountOwnership(q.accountId, userId)
      where.accountId = q.accountId
    }
    if (q.assetId) where.assetId = q.assetId
    if (q.from || q.to) {
      where.tradeTime = {}
      if (q.from) where.tradeTime.gte = new Date(q.from)
      if (q.to) where.tradeTime.lte = new Date(q.to)
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: { tradeTime: 'desc' },
        skip: q.skip ?? 0,
        take: q.take ?? 50,
        include: {
          account: { select: { id: true, name: true, currency: true, userId: true } },
          asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
          tags: { include: { tag: true } },
        },
      }),
      this.prisma.transaction.count({ where }),
    ])

    return {
      total,
      skip: q.skip ?? 0,
      take: q.take ?? 50,
      items,
    }
  }

  async create(dto: CreateTransactionDto, userId: string): Promise<Transaction> {
    // Validate account belongs to user
    await this.ownershipService.validateAccountOwnership(dto.accountId, userId)
    this.validateTransactionBusinessRules(dto)
    
    const created = await this.prisma.transaction.create({
      data: {
        accountId: dto.accountId,
        assetId: dto.assetId,
        type: dto.type,
        amount: dto.amount,
        quantity: dto.quantity,
        price: dto.price,
        fee: dto.fee ?? 0,
        tax: dto.tax ?? 0,
        brokerOrderNo: dto.brokerOrderNo,
        tradeTime: dto.tradeTime? new Date(dto.tradeTime) : new Date(),
        note: dto.note,
      },
      include: {
        account: { select: { id: true, name: true, currency: true, userId: true } },
        asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
      },
    })
    
    // Get account to pass userId to posting service
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: created.accountId },
      select: { userId: true },
    })
    
    await this.postingService.postTransaction({
      userId: account.userId,
      transaction: created,
    })
    return created
  }

  async findOne(id: string, userId: string) {
    // Validate ownership
    await this.ownershipService.validateTransactionOwnership(id, userId)
    
    const transaction = await this.prisma.transaction.findUnique({ 
      where: { id },
      include: {
        account: { select: { id: true, name: true, currency: true, userId: true } },
        asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
        tags: { include: { tag: true } },
      },
    })
    if (!transaction) throw new NotFoundException('Transaction not found')
    return transaction
  }

  async update(id: string, dto: CreateAndUpdateTransactionDto, userId: string) {
    // Validate ownership
    await this.ownershipService.validateTransactionOwnership(id, userId)
    
    // If accountId is being updated, validate new account ownership
    if (dto.accountId) {
      await this.ownershipService.validateAccountOwnership(dto.accountId, userId)
    }
    this.validateTransactionBusinessRules(dto)
    
    return this.prisma.transaction.update({
      where: { id },
      data: {
        accountId: dto.accountId,
        assetId: dto.assetId,
        type: dto.type,
        amount: dto.amount,
        quantity: dto.quantity,
        price: dto.price,
        fee: dto.fee ?? 0,
        tax: dto.tax ?? 0,
        brokerOrderNo: dto.brokerOrderNo,
        tradeTime: dto.tradeTime ? new Date(dto.tradeTime) : new Date(),
        note: dto.note,
      },
      include: {
        account: { select: { id: true, name: true, currency: true, userId: true } },
        asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
        tags: { include: { tag: true } },
      },
    })
  }

  async remove(id: string, userId: string) {
    // Validate ownership
    await this.ownershipService.validateTransactionOwnership(id, userId)
    
    return this.prisma.transaction.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    })
  }

  async hardDelete(id: string, userId: string) {
    // Validate ownership
    await this.ownershipService.validateTransactionOwnership(id, userId)
    
    return this.prisma.transaction.delete({ where: { id } })
  }
}
