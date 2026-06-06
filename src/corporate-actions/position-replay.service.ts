import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CorpActionMarket } from './corp-action.types'
import { toNumber } from '../common/utils/number.util'
import {
  replayScopeLedger,
  ReplayCorporateAction,
  ReplayTransaction,
} from './position-replay.engine'

export type PositionReplayScope = {
  accountId: string
  assetId: string
}

type ActiveReplayTransaction = {
  id: string
  type: 'buy' | 'sell'
  tradeTime: Date
  quantity: number | null
  amount: number
  isDeleted: boolean
}

@Injectable()
export class PositionReplayService {
  async rebuildScope(
    prisma: Prisma.TransactionClient,
    scope: PositionReplayScope,
  ): Promise<string[]> {
    const scopedTransactions = await prisma.transaction.findMany({
      where: {
        accountId: scope.accountId,
        assetId: scope.assetId,
        type: { in: ['buy', 'sell'] },
      },
      orderBy: [{ tradeTime: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        type: true,
        tradeTime: true,
        quantity: true,
        amount: true,
        isDeleted: true,
      },
    })

    const scopedTransactionIds = scopedTransactions.map((transaction) => transaction.id)
    if (scopedTransactionIds.length > 0) {
      await prisma.sellLotMatch.deleteMany({
        where: {
          sellTransactionId: {
            in: scopedTransactionIds,
          },
        },
      })
    }

    await prisma.positionLot.deleteMany({
      where: {
        accountId: scope.accountId,
        assetId: scope.assetId,
      },
    })
    await prisma.position.deleteMany({
      where: {
        accountId: scope.accountId,
        assetId: scope.assetId,
      },
    })

    return this.replayAndPersistScope(
      prisma,
      scope,
      scopedTransactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type as 'buy' | 'sell',
        tradeTime: transaction.tradeTime,
        quantity: toNumber(transaction.quantity),
        amount: toNumber(transaction.amount),
        isDeleted: transaction.isDeleted,
      })),
    )
  }

  async replayAndPersistScope(
    prisma: Prisma.TransactionClient,
    scope: PositionReplayScope,
    transactions: ActiveReplayTransaction[],
  ): Promise<string[]> {
    const corporateActions = await this.loadCorporateActions(prisma, scope.assetId)
    const activeTransactions = transactions.filter((transaction) => !transaction.isDeleted)
    const ledger = replayScopeLedger({
      transactions: this.toReplayTransactions(activeTransactions),
      corporateActions,
    })

    const lotIdByKey = new Map<string, string>()

    for (const lot of ledger.lots) {
      const createdLot = await prisma.positionLot.create({
        data: {
          accountId: scope.accountId,
          assetId: scope.assetId,
          sourceTransactionId: lot.sourceTransactionId,
          originalQuantity: lot.originalQuantity,
          remainingQuantity: lot.remainingQuantity,
          unitCost: lot.unitCost,
          openedAt: lot.openedAt,
          closedAt: lot.closedAt,
        },
      })
      lotIdByKey.set(lot.key, createdLot.id)
    }

    if (ledger.sellMatches.length > 0) {
      await prisma.sellLotMatch.createMany({
        data: ledger.sellMatches.map((match) => ({
          sellTransactionId: match.sellTransactionId,
          buyLotId: lotIdByKey.get(match.buyLotKey)!,
          quantity: match.quantity,
          unitCost: match.unitCost,
        })),
      })
    }

    if (ledger.position) {
      await prisma.position.create({
        data: {
          accountId: scope.accountId,
          assetId: scope.assetId,
          quantity: ledger.position.quantity,
          avgCost: ledger.position.avgCost,
          openedAt: ledger.position.openedAt,
          closedAt: ledger.position.closedAt,
        },
      })
    }

    return ledger.sellTransactionIds
  }

  private async loadCorporateActions(
    prisma: Prisma.TransactionClient,
    assetId: string,
  ): Promise<ReplayCorporateAction[]> {
    const actions = await prisma.corporateAction.findMany({
      where: { assetId },
      orderBy: [{ exDate: 'asc' }, { id: 'asc' }],
    })

    return actions.map((action) => ({
      exDate: action.exDate,
      ratio: toNumber(action.ratio),
      market: action.market as CorpActionMarket,
    }))
  }

  private toReplayTransactions(transactions: ActiveReplayTransaction[]): ReplayTransaction[] {
    return transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      tradeTime: transaction.tradeTime,
      quantity: toNumber(transaction.quantity),
      amount: toNumber(transaction.amount),
    }))
  }
}
