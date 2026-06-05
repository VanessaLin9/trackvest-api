import { Inject, Injectable } from '@nestjs/common'
import { CorporateAction, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { toTradeDateUtc } from '../market-price/utils/market-price-date.util'
import {
  CorpActionMarket,
  SplitEvent,
  SplitEventProvider,
  SyncSplitsResult,
  TW_SPLIT_EVENT_PROVIDER,
  US_SPLIT_EVENT_PROVIDER,
} from './corp-action.types'
import { SplitLedgerService } from './split-ledger.service'

type PositionScope = {
  accountId: string
  assetId: string
}

@Injectable()
export class CorpActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly splitLedgerService: SplitLedgerService,
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
    let applicationsCreated = 0
    let applicationsSkipped = 0

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

          const applyStats = await this.applyCorporateActionToAccounts(corporateAction)
          applicationsCreated += applyStats.created
          applicationsSkipped += applyStats.skipped
        }
      }
    }

    return {
      market,
      assetsProcessed,
      eventsUpserted,
      applicationsCreated,
      applicationsSkipped,
    }
  }

  async reapplySplitsForScope(
    prisma: Prisma.TransactionClient,
    scope: PositionScope,
  ): Promise<void> {
    const actions = await prisma.corporateAction.findMany({
      where: { assetId: scope.assetId },
      orderBy: [{ exDate: 'asc' }, { id: 'asc' }],
    })

    for (const action of actions) {
      const adjusted = await this.splitLedgerService.applyCorporateAction(
        prisma,
        action,
        scope.accountId,
      )

      if (adjusted) {
        await this.splitLedgerService.markApplied(prisma, action.id, scope.accountId)
      }
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

  private async applyCorporateActionToAccounts(
    action: CorporateAction,
  ): Promise<{ created: number; skipped: number }> {
    let created = 0
    let skipped = 0

    const accountIds = await this.prisma.positionLot.findMany({
      where: {
        assetId: action.assetId,
        openedAt: { lt: action.exDate },
        remainingQuantity: { gt: 0 },
      },
      select: { accountId: true },
      distinct: ['accountId'],
    })

    for (const { accountId } of accountIds) {
      const alreadyApplied = await this.splitLedgerService.isAlreadyApplied(
        this.prisma,
        action.id,
        accountId,
      )
      if (alreadyApplied) {
        skipped += 1
        continue
      }

      const adjusted = await this.prisma.$transaction(async (tx) => {
        const didAdjust = await this.splitLedgerService.applyCorporateAction(tx, action, accountId)
        if (didAdjust) {
          await this.splitLedgerService.markApplied(tx, action.id, accountId)
        }
        return didAdjust
      })

      if (adjusted) {
        created += 1
      } else {
        skipped += 1
      }
    }

    return { created, skipped }
  }

  private defaultLookbackStart(endDate: string): string {
    const date = new Date(`${endDate}T00:00:00.000Z`)
    date.setUTCFullYear(date.getUTCFullYear() - 5)
    return date.toISOString().slice(0, 10)
  }
}
