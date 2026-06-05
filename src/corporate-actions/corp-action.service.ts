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
@Injectable()
export class CorpActionService {
  constructor(
    private readonly prisma: PrismaService,
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
          await this.upsertCorporateAction(asset.id, provider, event)
          eventsUpserted += 1
        }
      }
    }

    return {
      market,
      assetsProcessed,
      eventsUpserted,
      replayPending: eventsUpserted > 0,
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
