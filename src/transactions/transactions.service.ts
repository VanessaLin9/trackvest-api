import { Injectable, NotFoundException } from '@nestjs/common'
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


  async findAll(q: FindTransactionsDto, userId: string) {
    const where: Prisma.TransactionWhereInput = {
      // Always filter by user's accounts
      account: {
        userId,
      },
    }
    
    // 軟刪過濾
    const includeDeleted = q.includeDeleted === 'true'
    if (!includeDeleted) where.isDeleted = false

    if (q.accountId) {
      // Validate account belongs to user
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
    
    const created = await this.prisma.transaction.create({
      data: {
        accountId: dto.accountId,
        assetId: dto.assetId,
        type: dto.type,
        amount: dto.amount,
        quantity: dto.quantity,
        price: dto.price,
        fee: dto.fee?? 0,
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
    
    await this.postingService.postTransaction(account.userId, created)
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
