import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { FindTransactionsDto } from './dto/find-transaction.dto'
import { Prisma, Transaction } from '@prisma/client'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { CreateAndUpdateTransactionDto } from './dto/transaction.createAndUpdate.dto'
import { PostingService } from '../gl/posting.service'
import { OwnershipService } from '../common/services/ownership.service'
import { UserContext } from '../common/types/auth-user'
import { ImportTransactionsDto } from './dto/import-transactions.dto'
import { ImportTransactionsResponseDto } from './dto/import-transactions.response.dto'
import { TransactionImportService } from './transaction-import.service'
import { TransactionPositionOrchestratorService } from './transaction-position-orchestrator.service'

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private postingService: PostingService,
    private ownershipService: OwnershipService,
    private transactionPositionOrchestrator: TransactionPositionOrchestratorService,
    private transactionImportService: TransactionImportService,
  ) {}

  async importTransactions(
    dto: ImportTransactionsDto,
    userId: string,
  ): Promise<ImportTransactionsResponseDto> {
    return this.transactionImportService.importTransactions(dto, userId)
  }

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

  async create(dto: CreateTransactionDto, userId: string): Promise<Transaction> {
    // Validate account belongs to user
    await this.ownershipService.validateAccountOwnership(dto.accountId, userId)
    this.validateTransactionBusinessRules(dto)

    return this.prisma.$transaction(async (db) => {
      const tradeTime = dto.tradeTime ? new Date(dto.tradeTime) : new Date()
      const createSideEffectPlan =
        await this.transactionPositionOrchestrator.prepareCreateSideEffects(db, {
          accountId: dto.accountId,
          assetId: dto.assetId ?? null,
          type: dto.type,
          quantity: dto.quantity,
          tradeTime,
        })

      const created = await db.transaction.create({
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
          tradeTime,
          note: dto.note,
        },
        include: {
          account: { select: { id: true, name: true, currency: true, userId: true } },
          asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
        },
      })

      const sideEffects = await this.transactionPositionOrchestrator.applyCreateSideEffects(
        db,
        created,
        createSideEffectPlan,
      )

      if (!sideEffects.skipPrimaryGlPost) {
        await this.postingService.postTransaction({
          userId: created.account.userId,
          transaction: created,
          db,
        })
      }
      return created
    })
  }
  async findAll(q: FindTransactionsDto, user: UserContext) {
    const { userId, isAdmin } = await this.ownershipService.resolveUser(user)

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
      await this.ownershipService.validateAccountOwnership(q.accountId, user)
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

    const existing = await this.prisma.transaction.findUnique({
      where: { id },
    })
    if (!existing) {
      throw new NotFoundException('Transaction not found')
    }

    const nextTransaction: CreateTransactionDto = {
      accountId: dto.accountId ?? existing.accountId,
      assetId: dto.assetId === undefined ? existing.assetId ?? undefined : dto.assetId,
      type: dto.type ?? existing.type,
      amount: dto.amount ?? Number(existing.amount),
      quantity: dto.quantity === undefined ? (existing.quantity == null ? undefined : Number(existing.quantity)) : dto.quantity,
      price: dto.price === undefined ? (existing.price == null ? undefined : Number(existing.price)) : dto.price,
      fee: dto.fee ?? Number(existing.fee),
      tax: dto.tax ?? Number(existing.tax),
      brokerOrderNo:
        dto.brokerOrderNo === undefined ? existing.brokerOrderNo ?? undefined : dto.brokerOrderNo,
      tradeTime: dto.tradeTime ?? existing.tradeTime.toISOString(),
      note: dto.note === undefined ? existing.note ?? undefined : dto.note,
    }

    this.validateTransactionBusinessRules(nextTransaction)

    if (
      existing.type !== nextTransaction.type &&
      (existing.type === 'sell' || nextTransaction.type === 'sell')
    ) {
      throw new BadRequestException(
        'Changing a transaction into or out of sell is not supported',
      )
    }

    return this.prisma.$transaction(async (db) => {
      const transaction = await db.transaction.update({
        where: { id },
        data: {
          accountId: nextTransaction.accountId,
          assetId: nextTransaction.assetId,
          type: nextTransaction.type,
          amount: nextTransaction.amount,
          quantity: nextTransaction.quantity,
          price: nextTransaction.price,
          fee: nextTransaction.fee ?? 0,
          tax: nextTransaction.tax ?? 0,
          brokerOrderNo: nextTransaction.brokerOrderNo,
          tradeTime: new Date(nextTransaction.tradeTime),
          note: nextTransaction.note,
        },
        include: {
          account: { select: { id: true, name: true, currency: true, userId: true } },
          asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
          tags: { include: { tag: true } },
        },
      })

      const sideEffects = await this.transactionPositionOrchestrator.applyUpdateSideEffects(
        db,
        existing,
        transaction,
      )

      if (!sideEffects.skipPrimaryGlPost) {
        await this.postingService.postTransaction({
          userId: transaction.account.userId,
          transaction,
          db,
        })
      }

      return transaction
    })
  }

  async remove(id: string, userId: string) {
    // Validate ownership
    await this.ownershipService.validateTransactionOwnership(id, userId)

    return this.prisma.$transaction(async (db) => {
      const existing = await db.transaction.findUnique({
        where: { id },
        include: {
          account: { select: { userId: true } },
        },
      })

      if (existing?.type === 'sell' && existing.assetId) {
        const transaction = await db.transaction.update({
          where: { id },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
          },
          include: {
            account: { select: { userId: true } },
          },
        })

        await this.postingService.archiveTransactionEntries(transaction.account.userId, id, db)
        await this.transactionPositionOrchestrator.applyRemoveSideEffects(db, transaction)
        return transaction
      }

      const transaction = await db.transaction.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
        include: {
          account: { select: { userId: true } },
        },
      })

      await this.postingService.archiveTransactionEntries(transaction.account.userId, id, db)
      await this.transactionPositionOrchestrator.applyRemoveSideEffects(db, transaction)

      return transaction
    })
  }

  async hardDelete(id: string, userId: string) {
    // Validate ownership
    await this.ownershipService.validateTransactionOwnership(id, userId)

    return this.prisma.$transaction(async (db) => {
      const existing = await db.transaction.findUnique({
        where: { id },
        include: {
          account: { select: { userId: true } },
        },
      })
      if (!existing) {
        throw new NotFoundException('Transaction not found')
      }
      if (existing.type === 'sell' && existing.assetId) {
        await this.postingService.archiveTransactionEntries(existing.account.userId, id, db)
        const deleted = await db.transaction.delete({ where: { id } })
        await this.transactionPositionOrchestrator.applyHardDeleteSideEffects(db, existing)
        return deleted
      }

      await this.postingService.archiveTransactionEntries(existing.account.userId, id, db)

      if (existing.type === 'buy' && existing.assetId) {
        const deleted = await db.transaction.delete({ where: { id } })
        await this.transactionPositionOrchestrator.applyHardDeleteSideEffects(db, existing)
        return deleted
      }

      return db.transaction.delete({ where: { id } })
    })
  }
}
