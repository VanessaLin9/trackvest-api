import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { FindTransactionsDto } from './dto/find-transaction.dto'
import { Prisma, Transaction } from '@prisma/client'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { CreateAndUpdateTransactionDto } from './dto/transaction.createAndUpdate.dto'

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}


  async findAll(q: FindTransactionsDto) {
    const where: Prisma.TransactionWhereInput = {}
    // 軟刪過濾
    const includeDeleted = q.includeDeleted === 'true'
    if (!includeDeleted) where.isDeleted = false

    if (q.accountId) where.accountId = q.accountId
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

  async create(dto: CreateTransactionDto): Promise<Transaction> {
    return this.prisma.transaction.create({
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
  }

  async findOne(id: string) {
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

  async update(id: string, dto: CreateAndUpdateTransactionDto) {
    await this.findOne(id)
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

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.transaction.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    })
  }

  async hardDelete(id: string) {
    await this.findOne(id)
    return this.prisma.transaction.delete({ where: { id } })
  }
}
