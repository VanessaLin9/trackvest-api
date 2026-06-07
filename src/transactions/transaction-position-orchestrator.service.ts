import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Currency, Prisma, Transaction } from '@prisma/client'
import { PositionReplayService } from '../corporate-actions/position-replay.service'
import { PostingService } from '../gl/posting.service'
import { toNumber } from '../common/utils/number.util'

type SellLotConsumptionPlan = {
  positionId: string
  lotConsumptions: Array<{
    buyLotId: string
    consumedQuantity: number
    unitCost: number
    nextRemainingQuantity: number
    nextClosedAt: Date | null
  }>
  nextPositionQuantity: number
  nextPositionAvgCost: number
  nextPositionClosedAt: Date | null
}

type PositionScope = {
  accountId: string
  assetId: string
}

type RebuildTransaction = Transaction & {
  account: {
    id: string
    name: string
    currency: Currency
    userId: string
  }
  asset: {
    id: string
    symbol: string
    name: string
    baseCurrency: string
  } | null
}

export type TransactionSideEffectResult = {
  skipPrimaryGlPost: boolean
}

type CreateSideEffectPlan = {
  requiresScopeRebuild: boolean
  scope: PositionScope | null
  sellPlan: SellLotConsumptionPlan | null
}

@Injectable()
export class TransactionPositionOrchestratorService {
  constructor(
    private readonly positionReplayService: PositionReplayService,
    private readonly postingService: PostingService,
  ) {}

  async prepareCreateSideEffects(
    prisma: Prisma.TransactionClient,
    candidate: {
      accountId: string
      assetId?: string | null
      type: Transaction['type']
      quantity?: number | null
      tradeTime: Date
    },
  ): Promise<CreateSideEffectPlan> {
    const scope = this.getTransactionScope({
      accountId: candidate.accountId,
      assetId: candidate.assetId ?? null,
      type: candidate.type,
    })
    const requiresScopeRebuild = await this.requiresScopeRebuildOnCreate(
      prisma,
      {
        accountId: candidate.accountId,
        assetId: candidate.assetId ?? null,
        type: candidate.type,
        tradeTime: candidate.tradeTime,
      } as Transaction,
      scope,
    )
    const sellPlan =
      !requiresScopeRebuild && candidate.type === 'sell' && candidate.assetId
        ? await this.buildSellLotConsumptionPlan(prisma, {
            accountId: candidate.accountId,
            assetId: candidate.assetId,
            quantity: Number(candidate.quantity),
            tradeTime: candidate.tradeTime,
          })
        : null

    return {
      requiresScopeRebuild,
      scope,
      sellPlan,
    }
  }

  async applyCreateSideEffects(
    prisma: Prisma.TransactionClient,
    created: Transaction,
    plan: CreateSideEffectPlan,
  ): Promise<TransactionSideEffectResult> {
    const { requiresScopeRebuild, scope, sellPlan } = plan

    if (created.type === 'buy') {
      if (requiresScopeRebuild && scope) {
        await this.rebuildAndRepostSellScopes(prisma, [scope])
      } else {
        await this.syncPositionOnCreate(prisma, created)
        await this.createBuyLotOnCreate(prisma, created)
      }
    }

    if (created.type === 'sell' && sellPlan) {
      await this.applySellLotConsumptionPlan(prisma, created, sellPlan)
    } else if (created.type === 'sell' && requiresScopeRebuild && scope) {
      await this.rebuildAndRepostSellScopes(prisma, [scope])
    }

    return {
      skipPrimaryGlPost: created.type === 'sell' && requiresScopeRebuild,
    }
  }

  async applyUpdateSideEffects(
    prisma: Prisma.TransactionClient,
    existing: Transaction,
    updated: Transaction,
  ): Promise<TransactionSideEffectResult> {
    const scopes = this.getUpdateRebuildScopes(existing, updated)

    if (scopes.length === 0) {
      return { skipPrimaryGlPost: false }
    }

    await this.rebuildAndRepostSellScopes(prisma, scopes)

    return {
      skipPrimaryGlPost: this.isScopedSellTransaction(updated),
    }
  }

  async applyRemoveSideEffects(
    prisma: Prisma.TransactionClient,
    transaction: Transaction,
  ): Promise<void> {
    const scope = this.getTransactionScope(transaction)

    if (transaction.type === 'sell' && scope) {
      await this.rebuildAndRepostSellScopes(
        prisma,
        this.getDistinctScopes(scope),
      )
      return
    }

    if (this.isScopedBuyTransaction(transaction) && scope) {
      await this.rebuildAndRepostSellScopes(prisma, [scope])
    }
  }

  async applyHardDeleteSideEffects(
    prisma: Prisma.TransactionClient,
    deleted: Pick<Transaction, 'accountId' | 'assetId' | 'type'>,
  ): Promise<void> {
    const scope = this.getTransactionScope(deleted)

    if (deleted.type === 'sell' && scope) {
      await this.rebuildAndRepostSellScopes(
        prisma,
        this.getDistinctScopes(scope),
      )
      return
    }

    if (this.isScopedBuyTransaction(deleted) && scope) {
      await this.rebuildAndRepostSellScopes(prisma, [scope])
    }
  }

  private async requiresScopeRebuildOnCreate(
    prisma: Prisma.TransactionClient,
    created: Transaction,
    scope: PositionScope | null,
  ) {
    if (!scope) {
      return false
    }

    if (created.type === 'sell') {
      return this.hasActiveScopedTransactionsOnOrAfter(
        prisma,
        scope,
        created.tradeTime,
      )
    }

    if (created.type === 'buy') {
      return this.hasActiveSellTransactionsOnOrAfter(
        prisma,
        scope,
        created.tradeTime,
      )
    }

    return false
  }

  private async syncPositionOnCreate(
    prisma: Prisma.TransactionClient,
    transaction: Transaction,
  ) {
    if (transaction.type !== 'buy' || !transaction.assetId) {
      return
    }

    const quantity = toNumber(transaction.quantity)
    const totalCost = toNumber(transaction.amount)

    if (quantity <= 0 || totalCost <= 0) {
      throw new BadRequestException('buy transactions require positive quantity and amount')
    }

    const existingPosition = await prisma.position.findFirst({
      where: {
        accountId: transaction.accountId,
        assetId: transaction.assetId,
        closedAt: null,
      },
      orderBy: { openedAt: 'desc' },
    })

    if (!existingPosition) {
      await prisma.position.create({
        data: {
          accountId: transaction.accountId,
          assetId: transaction.assetId,
          quantity,
          avgCost: totalCost / quantity,
          openedAt: transaction.tradeTime,
        },
      })
      return
    }

    const currentQuantity = toNumber(existingPosition.quantity)
    const currentAvgCost = toNumber(existingPosition.avgCost)
    const nextQuantity = currentQuantity + quantity

    if (nextQuantity <= 0) {
      throw new BadRequestException('resulting position quantity must stay positive')
    }

    const nextAvgCost =
      (currentQuantity * currentAvgCost + totalCost) / nextQuantity

    await prisma.position.update({
      where: { id: existingPosition.id },
      data: {
        quantity: nextQuantity,
        avgCost: nextAvgCost,
      },
    })
  }

  private async createBuyLotOnCreate(
    prisma: Prisma.TransactionClient,
    transaction: Transaction,
  ) {
    if (transaction.type !== 'buy' || !transaction.assetId) {
      return
    }

    const quantity = toNumber(transaction.quantity)
    const totalCost = toNumber(transaction.amount)

    if (quantity <= 0 || totalCost <= 0) {
      throw new BadRequestException('buy transactions require positive quantity and amount')
    }

    await prisma.positionLot.create({
      data: {
        accountId: transaction.accountId,
        assetId: transaction.assetId,
        sourceTransactionId: transaction.id,
        originalQuantity: quantity,
        remainingQuantity: quantity,
        unitCost: totalCost / quantity,
        openedAt: transaction.tradeTime,
      },
    })
  }

  private async buildSellLotConsumptionPlan(
    prisma: Prisma.TransactionClient,
    transactionLike: {
      accountId: string
      assetId: string
      quantity: number
      tradeTime: Date
    },
  ): Promise<SellLotConsumptionPlan> {
    const activePosition = await prisma.position.findFirst({
      where: {
        accountId: transactionLike.accountId,
        assetId: transactionLike.assetId,
        closedAt: null,
      },
      orderBy: { openedAt: 'desc' },
    })

    if (!activePosition) {
      throw new NotFoundException('Active position not found for sell transaction')
    }

    const openLots = await prisma.positionLot.findMany({
      where: {
        accountId: transactionLike.accountId,
        assetId: transactionLike.assetId,
        remainingQuantity: { gt: 0 },
      },
      orderBy: { openedAt: 'asc' },
    })

    let remainingToSell = transactionLike.quantity
    let remainingQuantity = 0
    let remainingCost = 0
    const lotConsumptions: SellLotConsumptionPlan['lotConsumptions'] = []

    for (const lot of openLots) {
      const lotRemainingQuantity = toNumber(lot.remainingQuantity)
      const unitCost = toNumber(lot.unitCost)
      const consumedQuantity = Math.min(lotRemainingQuantity, remainingToSell)
      const nextRemainingQuantity = lotRemainingQuantity - consumedQuantity

      if (consumedQuantity > 0) {
        lotConsumptions.push({
          buyLotId: lot.id,
          consumedQuantity,
          unitCost,
          nextRemainingQuantity,
          nextClosedAt: nextRemainingQuantity <= 1e-9 ? transactionLike.tradeTime : null,
        })
        remainingToSell -= consumedQuantity
      }

      if (nextRemainingQuantity > 1e-9) {
        remainingQuantity += nextRemainingQuantity
        remainingCost += nextRemainingQuantity * unitCost
      }
    }

    if (remainingToSell > 1e-9) {
      throw new BadRequestException('sell quantity exceeds the remaining open position lots')
    }

    return {
      positionId: activePosition.id,
      lotConsumptions,
      nextPositionQuantity: remainingQuantity,
      nextPositionAvgCost: remainingQuantity > 1e-9 ? remainingCost / remainingQuantity : 0,
      nextPositionClosedAt: remainingQuantity > 1e-9 ? null : transactionLike.tradeTime,
    }
  }

  private async applySellLotConsumptionPlan(
    prisma: Prisma.TransactionClient,
    transaction: Transaction,
    plan: SellLotConsumptionPlan,
  ) {
    for (const lotConsumption of plan.lotConsumptions) {
      await prisma.positionLot.update({
        where: { id: lotConsumption.buyLotId },
        data: {
          remainingQuantity: lotConsumption.nextRemainingQuantity,
          closedAt: lotConsumption.nextClosedAt,
        },
      })
    }

    await prisma.sellLotMatch.createMany({
      data: plan.lotConsumptions.map((lotConsumption) => ({
        sellTransactionId: transaction.id,
        buyLotId: lotConsumption.buyLotId,
        quantity: lotConsumption.consumedQuantity,
        unitCost: lotConsumption.unitCost,
      })),
    })

    await prisma.position.update({
      where: { id: plan.positionId },
      data: {
        quantity: plan.nextPositionQuantity,
        avgCost: plan.nextPositionAvgCost,
        closedAt: plan.nextPositionClosedAt,
      },
    })
  }

  private getTransactionScope(transaction: Pick<Transaction, 'accountId' | 'assetId' | 'type'>) {
    if (!transaction.assetId) {
      return null
    }

    if (transaction.type !== 'buy' && transaction.type !== 'sell') {
      return null
    }

    return {
      accountId: transaction.accountId,
      assetId: transaction.assetId,
    }
  }

  private getDistinctScopes(...scopes: Array<PositionScope | null>) {
    const uniqueScopes = new Map<string, PositionScope>()

    for (const scope of scopes) {
      if (!scope) {
        continue
      }

      uniqueScopes.set(`${scope.accountId}:${scope.assetId}`, scope)
    }

    return [...uniqueScopes.values()]
  }

  private isScopedBuyTransaction(
    transaction: Pick<Transaction, 'type' | 'assetId'>,
  ) {
    return transaction.type === 'buy' && Boolean(transaction.assetId)
  }

  private isScopedSellTransaction(
    transaction: Pick<Transaction, 'type' | 'assetId'>,
  ) {
    return transaction.type === 'sell' && Boolean(transaction.assetId)
  }

  private getUpdateRebuildScopes(existing: Transaction, updated: Transaction) {
    return this.getDistinctScopes(
      this.getTransactionScope(existing),
      this.getTransactionScope(updated),
    )
  }

  private async hasActiveScopedTransactionsOnOrAfter(
    prisma: Prisma.TransactionClient,
    scope: PositionScope,
    tradeTime: Date,
    excludeTransactionId?: string,
  ) {
    const transaction = await prisma.transaction.findFirst({
      where: {
        accountId: scope.accountId,
        assetId: scope.assetId,
        type: { in: ['buy', 'sell'] },
        isDeleted: false,
        tradeTime: { gte: tradeTime },
        ...(excludeTransactionId
          ? {
              id: { not: excludeTransactionId },
            }
          : {}),
      },
      select: { id: true },
    })

    return Boolean(transaction)
  }

  private async hasActiveSellTransactionsOnOrAfter(
    prisma: Prisma.TransactionClient,
    scope: PositionScope,
    tradeTime: Date,
    excludeTransactionId?: string,
  ) {
    const transaction = await prisma.transaction.findFirst({
      where: {
        accountId: scope.accountId,
        assetId: scope.assetId,
        type: 'sell',
        isDeleted: false,
        tradeTime: { gte: tradeTime },
        ...(excludeTransactionId
          ? {
              id: { not: excludeTransactionId },
            }
          : {}),
      },
      select: { id: true },
    })

    return Boolean(transaction)
  }

  private async rebuildPositionScope(
    prisma: Prisma.TransactionClient,
    scope: PositionScope,
  ): Promise<RebuildTransaction[]> {
    const scopedTransactions = await prisma.transaction.findMany({
      where: {
        accountId: scope.accountId,
        assetId: scope.assetId,
        type: { in: ['buy', 'sell'] },
      },
      orderBy: [{ tradeTime: 'asc' }, { id: 'asc' }],
      include: {
        account: { select: { id: true, name: true, currency: true, userId: true } },
        asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
      },
    }) as RebuildTransaction[]

    const sellTransactionIds = await this.positionReplayService.rebuildScope(prisma, scope)
    const sellTransactionIdSet = new Set(sellTransactionIds)

    return scopedTransactions.filter((transaction) =>
      sellTransactionIdSet.has(transaction.id),
    )
  }

  private async rebuildAndRepostSellScopes(
    prisma: Prisma.TransactionClient,
    scopes: PositionScope[],
  ) {
    const sellTransactionsToRepost: RebuildTransaction[] = []

    for (const scope of scopes) {
      const rebuiltSellTransactions = await this.rebuildPositionScope(prisma, scope)
      sellTransactionsToRepost.push(...rebuiltSellTransactions)
    }

    for (const sellTransaction of sellTransactionsToRepost) {
      await this.postingService.postTransaction({
        userId: sellTransaction.account.userId,
        transaction: sellTransaction,
        db: prisma,
      })
    }
  }
}
