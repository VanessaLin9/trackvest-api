import { Injectable } from '@nestjs/common'
import { Prisma, Transaction } from '@prisma/client'

export type PositionScope = {
  accountId: string
  assetId: string
}

export type CreateMutationDecision = {
  scope: PositionScope | null
  needsFullScopeReplay: boolean
  canUseIncrementalSellPlan: boolean
  shouldPostCurrentTransaction: boolean
}

export type UpdateMutationDecision = {
  affectedScopes: PositionScope[]
  needsFullScopeReplay: boolean
  shouldPostCurrentTransaction: boolean
}

export type DeleteMutationDecision = {
  affectedScopes: PositionScope[]
  needsFullScopeReplay: boolean
}

type ScopedTransactionCandidate = Pick<
  Transaction,
  'accountId' | 'assetId' | 'type' | 'tradeTime'
>

/**
 * 決定 create/update/delete 是否要整 scope 重放（PR #22）。
 * - buy 若後面已有 sell → full replay（補回歷史買進會改 FIFO；PR #20）
 * - sell 若同日或之後還有 buy/sell → full replay，不可只做增量扣 lot
 * 政策與執行分離：實際 rebuild 在 `TransactionPositionOrchestratorService`。
 */
@Injectable()
export class TransactionRebuildPolicyService {
  getTransactionScope(
    transaction: Pick<Transaction, 'accountId' | 'assetId' | 'type'>,
  ): PositionScope | null {
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

  getDistinctScopes(...scopes: Array<PositionScope | null>): PositionScope[] {
    const uniqueScopes = new Map<string, PositionScope>()

    for (const scope of scopes) {
      if (!scope) {
        continue
      }

      uniqueScopes.set(`${scope.accountId}:${scope.assetId}`, scope)
    }

    return [...uniqueScopes.values()]
  }

  async resolveCreateMutation(
    prisma: Prisma.TransactionClient,
    candidate: ScopedTransactionCandidate,
  ): Promise<CreateMutationDecision> {
    const scope = this.getTransactionScope(candidate)

    if (!scope) {
      return {
        scope: null,
        needsFullScopeReplay: false,
        canUseIncrementalSellPlan: false,
        shouldPostCurrentTransaction: true,
      }
    }

    const needsFullScopeReplay = await this.needsFullScopeReplayOnCreate(
      prisma,
      candidate,
      scope,
    )
    const canUseIncrementalSellPlan =
      candidate.type === 'sell' && !needsFullScopeReplay

    return {
      scope,
      needsFullScopeReplay,
      canUseIncrementalSellPlan,
      shouldPostCurrentTransaction: !(candidate.type === 'sell' && needsFullScopeReplay),
    }
  }

  resolveUpdateMutation(
    existing: Transaction,
    updated: Transaction,
  ): UpdateMutationDecision {
    const affectedScopes = this.getDistinctScopes(
      this.getTransactionScope(existing),
      this.getTransactionScope(updated),
    )
    const needsFullScopeReplay = affectedScopes.length > 0

    return {
      affectedScopes,
      needsFullScopeReplay,
      shouldPostCurrentTransaction:
        !needsFullScopeReplay || !this.isScopedSellTransaction(updated),
    }
  }

  resolveDeleteMutation(
    transaction: Pick<Transaction, 'accountId' | 'assetId' | 'type'>,
  ): DeleteMutationDecision {
    const scope = this.getTransactionScope(transaction)

    if (!scope || !this.isScopedPositionMutation(transaction)) {
      return {
        affectedScopes: [],
        needsFullScopeReplay: false,
      }
    }

    return {
      affectedScopes: this.getDistinctScopes(scope),
      needsFullScopeReplay: true,
    }
  }

  private isScopedPositionMutation(
    transaction: Pick<Transaction, 'type' | 'assetId'>,
  ) {
    return this.isScopedBuyTransaction(transaction) || this.isScopedSellTransaction(transaction)
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

  /**
   * Create 路徑是否需要 full-scope replay（PR #20 / #22）。
   * sell：之後還有同 scope 活動 → 不可增量 FIFO。
   * buy：之後已有 sell → 必須重放，否則既有 SellLotMatch 成本會錯。
   */
  private async needsFullScopeReplayOnCreate(
    prisma: Prisma.TransactionClient,
    candidate: ScopedTransactionCandidate,
    scope: PositionScope,
  ) {
    if (candidate.type === 'sell') {
      return this.hasLaterScopedActivityInScope(prisma, scope, candidate.tradeTime)
    }

    if (candidate.type === 'buy') {
      return this.hasFutureSellInScope(prisma, scope, candidate.tradeTime)
    }

    return false
  }

  private async hasLaterScopedActivityInScope(
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

  private async hasFutureSellInScope(
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
}
