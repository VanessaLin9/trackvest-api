import { Inject, Injectable } from '@nestjs/common'
import { CorporateAction, Prisma, Transaction } from '@prisma/client'
import { PostingService } from '../gl/posting.service'
import { PrismaService } from '../prisma.service'
import { toTradeDateUtc } from '../market-price/utils/market-price-date.util'
import { toAffectedScopes } from './corp-action-affected-scope.util'
import {
  PositionReplayScope,
  PositionReplayService,
} from './position-replay.service'
import {
  CorpActionMarket,
  SplitEvent,
  SplitEventProvider,
  SyncSplitsResult,
  TW_SPLIT_EVENT_PROVIDER,
  US_SPLIT_EVENT_PROVIDER,
} from './corp-action.types'

@Injectable()
export class CorpActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly positionReplayService: PositionReplayService,
    private readonly postingService: PostingService,
    @Inject(TW_SPLIT_EVENT_PROVIDER)
    private readonly twSplitProvider: SplitEventProvider,
    @Inject(US_SPLIT_EVENT_PROVIDER)
    private readonly usSplitProvider: SplitEventProvider,
  ) {}

  async syncSplits(input: {
    market?: CorpActionMarket | 'all'
    startDate?: string
    endDate?: string
    assetIds?: string[]
  } = {}): Promise<SyncSplitsResult> {
    const market = input.market ?? 'all'
    const endDate = input.endDate ?? new Date().toISOString().slice(0, 10)
    const startDate = input.startDate ?? this.defaultLookbackStart(endDate)

    let assetsProcessed = 0
    let eventsUpserted = 0
    const upsertedActionsByAsset = new Map<string, string[]>()

    const providers: SplitEventProvider[] = []
    if (market === 'all' || market === 'tw') {
      providers.push(this.twSplitProvider)
    }
    if (market === 'all' || market === 'us') {
      providers.push(this.usSplitProvider)
    }

    for (const provider of providers) {
      const assets = await this.resolveAssetsForMarket(provider.market, input.assetIds)
      assetsProcessed += assets.length

      for (const asset of assets) {
        const events = await provider.fetchSplitEvents({
          stockId: asset.symbol,
          startDate,
          endDate,
        })

        for (const event of events) {
          const corporateAction = await this.upsertCorporateAction(asset.id, provider, event)
          eventsUpserted += 1

          const actionIds = upsertedActionsByAsset.get(asset.id) ?? []
          actionIds.push(corporateAction.id)
          upsertedActionsByAsset.set(asset.id, actionIds)
        }
      }
    }

    const scopesReplayed = await this.replayAffectedScopes(upsertedActionsByAsset)

    return {
      market,
      assetsProcessed,
      eventsUpserted,
      scopesReplayed,
      replayPending: eventsUpserted > 0 && scopesReplayed === 0,
    }
  }

  private async replayAffectedScopes(
    upsertedActionsByAsset: Map<string, string[]>,
  ): Promise<number> {
    const assetIds = [...upsertedActionsByAsset.keys()]
    if (assetIds.length === 0) {
      return 0
    }

    const scopes = await this.resolveAffectedScopes(assetIds)
    let scopesReplayed = 0

    for (const scope of scopes) {
      const corporateActionIds = upsertedActionsByAsset.get(scope.assetId) ?? []
      await this.prisma.$transaction(async (tx) => {
        const sellTransactionIds = await this.positionReplayService.rebuildScope(tx, scope)
        await this.recordSplitApplications(tx, scope.accountId, corporateActionIds)
        await this.repostSellTransactions(tx, sellTransactionIds)
      })
      scopesReplayed += 1
    }

    return scopesReplayed
  }

  private async resolveAffectedScopes(assetIds: string[]): Promise<PositionReplayScope[]> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        assetId: { in: assetIds },
        type: { in: ['buy', 'sell'] },
        isDeleted: false,
      },
      distinct: ['accountId', 'assetId'],
      select: {
        accountId: true,
        assetId: true,
      },
    })

    return toAffectedScopes(rows)
  }

  private async repostSellTransactions(
    prisma: Prisma.TransactionClient,
    sellTransactionIds: string[],
  ): Promise<void> {
    if (sellTransactionIds.length === 0) {
      return
    }

    const sellTransactions = await prisma.transaction.findMany({
      where: {
        id: { in: sellTransactionIds },
        type: 'sell',
        isDeleted: false,
      },
      include: {
        account: {
          select: { userId: true },
        },
      },
    })

    const transactionsById = new Map(
      sellTransactions.map((transaction) => [transaction.id, transaction]),
    )

    for (const sellTransactionId of sellTransactionIds) {
      const sellTransaction = transactionsById.get(sellTransactionId)
      if (!sellTransaction) {
        continue
      }

      await this.postingService.postTransaction({
        userId: sellTransaction.account.userId,
        transaction: sellTransaction as Transaction,
        db: prisma,
      })
    }
  }

  private async recordSplitApplications(
    prisma: Prisma.TransactionClient,
    accountId: string,
    corporateActionIds: string[],
  ): Promise<void> {
    for (const corporateActionId of corporateActionIds) {
      await prisma.corporateActionApplication.upsert({
        where: {
          corporateActionId_accountId: {
            corporateActionId,
            accountId,
          },
        },
        create: {
          corporateActionId,
          accountId,
        },
        update: {
          appliedAt: new Date(),
        },
      })
    }
  }

  private async resolveAssetsForMarket(
    market: CorpActionMarket,
    assetIds?: string[],
  ): Promise<Array<{ id: string; symbol: string }>> {
    const baseCurrency = market === 'tw' ? 'TWD' : 'USD'

    return this.prisma.asset.findMany({
      where: {
        baseCurrency,
        type: { in: ['equity', 'etf'] },
        ...(assetIds?.length ? { id: { in: assetIds } } : {}),
        OR: [
          { positionLots: { some: {} } },
          { txs: { some: { type: { in: ['buy', 'sell'] }, isDeleted: false } } },
        ],
      },
      select: { id: true, symbol: true },
      orderBy: { symbol: 'asc' },
    })
  }

  private async upsertCorporateAction(
    assetId: string,
    provider: SplitEventProvider,
    event: SplitEvent,
  ): Promise<CorporateAction> {
    return this.prisma.corporateAction.upsert({
      where: {
        assetId_exDate_type_source: {
          assetId,
          exDate: toTradeDateUtc(event.exDate),
          type: event.direction,
          source: provider.providerKey,
        },
      },
      create: {
        assetId,
        market: provider.market,
        type: event.direction,
        exDate: toTradeDateUtc(event.exDate),
        ratio: event.ratio,
        source: provider.providerKey,
        sourceKey: event.sourceKey,
        beforePrice: event.beforePrice,
        afterPrice: event.afterPrice,
      },
      update: {
        ratio: event.ratio,
        sourceKey: event.sourceKey,
        beforePrice: event.beforePrice,
        afterPrice: event.afterPrice,
      },
    })
  }

  private defaultLookbackStart(endDate: string): string {
    const date = new Date(`${endDate}T00:00:00.000Z`)
    date.setUTCFullYear(date.getUTCFullYear() - 5)
    return date.toISOString().slice(0, 10)
  }
}
