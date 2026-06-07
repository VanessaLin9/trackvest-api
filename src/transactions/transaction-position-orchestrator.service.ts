import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Currency, Prisma, Transaction } from '@prisma/client'
import { PositionReplayService } from '../corporate-actions/position-replay.service'
import { PostingService } from '../gl/posting.service'
import { toNumber } from '../common/utils/number.util'
import {
  CreateMutationDecision,
  PositionScope,
  TransactionRebuildPolicyService,
} from './transaction-rebuild-policy.service'

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
  decision: CreateMutationDecision
  sellPlan: SellLotConsumptionPlan | null
}

@Injectable()
export class TransactionPositionOrchestratorService {
  constructor(
    private readonly positionReplayService: PositionReplayService,
    private readonly postingService: PostingService,
    private readonly rebuildPolicy: TransactionRebuildPolicyService,
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
    const decision = await this.rebuildPolicy.resolveCreateMutation(prisma, {
      accountId: candidate.accountId,
      assetId: candidate.assetId ?? null,
      type: candidate.type,
      tradeTime: candidate.tradeTime,
    })
    const sellPlan =
      decision.canUseIncrementalSellPlan && candidate.assetId
        ? await this.buildSellLotConsumptionPlan(prisma, {
            accountId: candidate.accountId,
            assetId: candidate.assetId,
            quantity: Number(candidate.quantity),
            tradeTime: candidate.tradeTime,
          })
        : null

    return {
      decision,
      sellPlan,
    }
  }

  async applyCreateSideEffects(
    prisma: Prisma.TransactionClient,
    created: Transaction,
    plan: CreateSideEffectPlan,
  ): Promise<TransactionSideEffectResult> {
    const { decision, sellPlan } = plan

    if (created.type === 'buy') {
      if (decision.needsFullScopeReplay && decision.scope) {
        await this.rebuildAndRepostSellScopes(prisma, [decision.scope])
      } else {
        await this.syncPositionOnCreate(prisma, created)
        await this.createBuyLotOnCreate(prisma, created)
      }
    }

    if (created.type === 'sell' && sellPlan) {
      await this.applySellLotConsumptionPlan(prisma, created, sellPlan)
    } else if (created.type === 'sell' && decision.needsFullScopeReplay && decision.scope) {
      await this.rebuildAndRepostSellScopes(prisma, [decision.scope])
    }

    return {
      skipPrimaryGlPost: !decision.shouldPostCurrentTransaction,
    }
  }

  async applyUpdateSideEffects(
    prisma: Prisma.TransactionClient,
    existing: Transaction,
    updated: Transaction,
  ): Promise<TransactionSideEffectResult> {
    const decision = this.rebuildPolicy.resolveUpdateMutation(existing, updated)

    if (decision.needsFullScopeReplay) {
      await this.rebuildAndRepostSellScopes(prisma, decision.affectedScopes)
    }

    return {
      skipPrimaryGlPost: !decision.shouldPostCurrentTransaction,
    }
  }

  async applyRemoveSideEffects(
    prisma: Prisma.TransactionClient,
    transaction: Transaction,
  ): Promise<void> {
    const decision = this.rebuildPolicy.resolveDeleteMutation(transaction)

    if (decision.needsFullScopeReplay) {
      await this.rebuildAndRepostSellScopes(prisma, decision.affectedScopes)
    }
  }

  async applyHardDeleteSideEffects(
    prisma: Prisma.TransactionClient,
    deleted: Pick<Transaction, 'accountId' | 'assetId' | 'type'>,
  ): Promise<void> {
    const decision = this.rebuildPolicy.resolveDeleteMutation(deleted)

    if (decision.needsFullScopeReplay) {
      await this.rebuildAndRepostSellScopes(prisma, decision.affectedScopes)
    }
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
