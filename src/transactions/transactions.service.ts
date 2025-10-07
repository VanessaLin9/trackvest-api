import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { UpdateTransactionDto } from './dto/update-transaction.dto'
import { QueryTransactionsDto } from './dto/query-transactions.dto'

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async create(createTransactionDto: CreateTransactionDto) {
    // Validate that account exists
    const account = await this.prisma.account.findUnique({
      where: { id: createTransactionDto.accountId },
    })
    if (!account) {
      throw new NotFoundException('Account not found')
    }

    // Validate that asset exists if provided
    if (createTransactionDto.assetId) {
      const asset = await this.prisma.asset.findUnique({
        where: { id: createTransactionDto.assetId },
      })
      if (!asset) {
        throw new NotFoundException('Asset not found')
      }
    }

    return this.prisma.transaction.create({
      data: {
        ...createTransactionDto,
        tradeTime: new Date(createTransactionDto.tradeTime),
      },
      include: {
        account: { select: { name: true, currency: true, userId: true } },
        asset: { select: { symbol: true, name: true } },
        tags: { include: { tag: true } },
      },
    })
  }

  async findAll(query: QueryTransactionsDto) {
    const { includeDeleted = false, page = 1, limit = 50, accountId, assetId, type } = query
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    
    if (!includeDeleted) {
      where.isDeleted = false
    }

    if (accountId) {
      where.accountId = accountId
    }

    if (assetId) {
      where.assetId = assetId
    }

    if (type) {
      where.type = type
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { tradeTime: 'desc' },
        include: {
          account: { select: { name: true, currency: true, userId: true } },
          asset: { select: { symbol: true, name: true } },
          tags: { include: { tag: true } },
        },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ])

    return {
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }

  async findOne(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id, isDeleted: false },
      include: {
        account: { select: { name: true, currency: true, userId: true } },
        asset: { select: { symbol: true, name: true } },
        tags: { include: { tag: true } },
      },
    })

    if (!transaction) {
      throw new NotFoundException('Transaction not found')
    }

    return transaction
  }

  async update(id: string, updateTransactionDto: UpdateTransactionDto) {
    // Check if transaction exists
    const existingTransaction = await this.prisma.transaction.findUnique({
      where: { id, isDeleted: false },
    })

    if (!existingTransaction) {
      throw new NotFoundException('Transaction not found')
    }

    // Validate account if provided
    if (updateTransactionDto.accountId) {
      const account = await this.prisma.account.findUnique({
        where: { id: updateTransactionDto.accountId },
      })
      if (!account) {
        throw new NotFoundException('Account not found')
      }
    }

    // Validate asset if provided
    if (updateTransactionDto.assetId) {
      const asset = await this.prisma.asset.findUnique({
        where: { id: updateTransactionDto.assetId },
      })
      if (!asset) {
        throw new NotFoundException('Asset not found')
      }
    }

    const updateData: Record<string, unknown> = { ...updateTransactionDto }
    if (updateTransactionDto.tradeTime) {
      updateData.tradeTime = new Date(updateTransactionDto.tradeTime)
    }

    return this.prisma.transaction.update({
      where: { id },
      data: updateData,
      include: {
        account: { select: { name: true, currency: true, userId: true } },
        asset: { select: { symbol: true, name: true } },
        tags: { include: { tag: true } },
      },
    })
  }

  async remove(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id, isDeleted: false },
    })

    if (!transaction) {
      throw new NotFoundException('Transaction not found')
    }

    return this.prisma.transaction.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    })
  }

  async restore(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id, isDeleted: true },
    })

    if (!transaction) {
      throw new NotFoundException('Deleted transaction not found')
    }

    return this.prisma.transaction.update({
      where: { id },
      data: { isDeleted: false, deletedAt: null },
      include: {
        account: { select: { name: true, currency: true, userId: true } },
        asset: { select: { symbol: true, name: true } },
        tags: { include: { tag: true } },
      },
    })
  }
}
