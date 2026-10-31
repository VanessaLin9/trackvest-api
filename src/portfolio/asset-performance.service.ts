import { ForbiddenException, Injectable } from '@nestjs/common'
import { Prisma, TxType } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import {
  AssetPerformanceSource,
  AssetPerformanceTransaction,
  buildAssetPerformance,
} from './asset-performance.calculator'
import { GetPortfolioAssetPerformanceDto } from './dto/get-portfolio-asset-performance.dto'
import { PortfolioAssetPerformanceResponseDto } from './dto/portfolio-asset-performance.response.dto'

const TRADE_TYPES = [TxType.buy, TxType.sell, TxType.dividend] as const

/**
 * 各標的歷史成果讀取（PR #48）。
 * 同一 Repeatable Read snapshot 批次讀取，GET 不 replay、不寫入、不呼叫行情或 FX。
 * accountId 即使是 admin 也只能讀自己的帳戶，不沿用 OwnershipService 的 admin 全域放行。
 */
@Injectable()
export class AssetPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getAssetPerformance(
    userId: string,
    query: GetPortfolioAssetPerformanceDto,
  ): Promise<PortfolioAssetPerformanceResponseDto> {
    const generatedAt = new Date()
    const source = await this.prisma.$transaction(
      tx => this.loadSource(tx, userId, query.accountId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
    return buildAssetPerformance(source, generatedAt)
  }

  private async loadSource(
    tx: Prisma.TransactionClient,
    userId: string,
    accountId?: string,
  ): Promise<AssetPerformanceSource> {
    const accounts = await tx.account.findMany({
      where: {
        userId,
        ...(accountId ? { id: accountId } : {}),
      },
      select: { id: true, currency: true },
    })

    if (accountId && accounts.length === 0) {
      throw new ForbiddenException('You do not have access to this account')
    }

    const empty: AssetPerformanceSource = {
      accounts,
      transactions: [],
      lots: [],
      positions: [],
      matches: [],
      assets: [],
      quotes: [],
    }
    if (accounts.length === 0) return empty

    const accountIds = accounts.map(account => account.id)
    const transactions = await tx.transaction.findMany({
      where: {
        accountId: { in: accountIds },
        isDeleted: false,
        assetId: { not: null },
        type: { in: [...TRADE_TYPES] },
      },
      select: {
        id: true,
        accountId: true,
        assetId: true,
        type: true,
        amount: true,
        quantity: true,
        tradeTime: true,
      },
    })
    const activeTransactions = transactions.flatMap(transaction => {
      if (transaction.assetId == null) return []
      if (transaction.type !== TxType.buy && transaction.type !== TxType.sell && transaction.type !== TxType.dividend) {
        return []
      }
      const mapped: AssetPerformanceTransaction = {
        id: transaction.id,
        accountId: transaction.accountId,
        assetId: transaction.assetId,
        type: transaction.type,
        amount: transaction.amount,
        quantity: transaction.quantity,
        tradeTime: transaction.tradeTime,
      }
      return [mapped]
    })
    const assetIds = [...new Set(
      activeTransactions
        .filter(transaction => transaction.type === 'buy' || transaction.type === 'sell')
        .map(transaction => transaction.assetId),
    )]
    if (assetIds.length === 0) return { ...empty, transactions: activeTransactions }

    const sellIds = activeTransactions.filter(transaction => transaction.type === 'sell').map(transaction => transaction.id)
    const [lots, positions, matches, assets, quotes] = await Promise.all([
      tx.positionLot.findMany({
        where: {
          accountId: { in: accountIds },
          assetId: { in: assetIds },
          sourceTransaction: { isDeleted: false },
        },
        select: {
          accountId: true,
          assetId: true,
          remainingQuantity: true,
          unitCost: true,
        },
      }),
      tx.position.findMany({
        where: {
          accountId: { in: accountIds },
          assetId: { in: assetIds },
        },
        select: {
          accountId: true,
          assetId: true,
          quantity: true,
        },
      }),
      sellIds.length === 0
        ? Promise.resolve([])
        : tx.sellLotMatch.findMany({
            where: { sellTransactionId: { in: sellIds } },
            select: {
              sellTransactionId: true,
              quantity: true,
              unitCost: true,
            },
          }),
      tx.asset.findMany({
        where: { id: { in: assetIds } },
        select: {
          id: true,
          symbol: true,
          name: true,
          baseCurrency: true,
        },
      }),
      this.loadLatestQuotes(tx, assetIds),
    ])

    return {
      accounts,
      transactions: activeTransactions,
      lots,
      positions,
      matches,
      assets,
      quotes,
    }
  }

  private async loadLatestQuotes(tx: Prisma.TransactionClient, assetIds: string[]) {
    const latest = await tx.price.groupBy({
      by: ['assetId'],
      where: {
        assetId: { in: assetIds },
        source: { not: 'seed' },
      },
      _max: { asOf: true },
    })
    const keys = latest.flatMap(row => (row._max.asOf ? [{ assetId: row.assetId, asOf: row._max.asOf }] : []))
    if (keys.length === 0) return []

    return tx.price.findMany({
      where: { OR: keys },
      select: {
        assetId: true,
        asOf: true,
        source: true,
        price: true,
      },
    })
  }
}
