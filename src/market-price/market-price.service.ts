import { Inject, Injectable, Logger } from '@nestjs/common'
import { Prisma, TxType } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import {
  DEFAULT_BACKFILL_MAX_ASSETS_PER_RUN,
  TAIWAN_MARKET_TIME_ZONE,
  TW_DAILY_LOOKBACK_DAYS,
} from './market-price.constants'
import {
  TAIWAN_STOCK_PRICE_PROVIDER,
  TaiwanStockDailyPrice,
  TaiwanStockPriceProvider,
} from './market-price.types'
import {
  shiftIsoDate,
  toTradeDateUtc,
  toTimeZoneIsoDate,
  tradeTimeToIsoDate,
} from './utils/market-price-date.util'

export type TaiwanPriceSyncMode = 'daily' | 'backfill'

export type SyncTaiwanPricesInput = {
  mode?: TaiwanPriceSyncMode
  startDate?: string
  endDate?: string
  assetIds?: string[]
  maxAssetsPerRun?: number
}

export type SyncTaiwanPricesResult = {
  market: 'tw'
  mode: TaiwanPriceSyncMode
  startDate: string
  endDate: string
  assetsRequested: number
  assetsProcessed: number
  assetsSkipped: number
  rowsUpserted: number
  perAsset: Array<{
    assetId: string
    symbol: string
    rows: number
    skipped?: boolean
    reason?: string
  }>
}

type TaiwanEverHeldAsset = {
  id: string
  symbol: string
}

@Injectable()
export class MarketPriceService {
  private readonly logger = new Logger(MarketPriceService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TAIWAN_STOCK_PRICE_PROVIDER)
    private readonly taiwanPriceProvider: TaiwanStockPriceProvider,
  ) {}

  async syncTaiwanPrices(input: SyncTaiwanPricesInput = {}): Promise<SyncTaiwanPricesResult> {
    const mode = input.mode ?? 'daily'
    if (mode === 'backfill') {
      return this.syncTwBackfill(input)
    }
    return this.syncTwDaily(input)
  }

  async syncTwDaily(input: SyncTaiwanPricesInput = {}): Promise<SyncTaiwanPricesResult> {
    const endDate = input.endDate ?? this.todayInTaiwan()
    const startDate =
      input.startDate ??
      shiftIsoDate(endDate, -(Math.max(TW_DAILY_LOOKBACK_DAYS, 1) - 1))

    const assets = await this.resolveTaiwanEverHeldAssets(input.assetIds)
    this.logger.log(
      `TW daily sync ${startDate}→${endDate} for ${assets.length} ever-held asset(s)`,
    )

    return this.syncAssetsInRange(assets, {
      mode: 'daily',
      startDate,
      endDate,
      assetsRequested: assets.length,
    })
  }

  async syncTwBackfill(input: SyncTaiwanPricesInput = {}): Promise<SyncTaiwanPricesResult> {
    const endDate = input.endDate ?? this.todayInTaiwan()
    const maxAssetsPerRun = input.maxAssetsPerRun ?? this.getBackfillMaxAssetsPerRun()
    const assets = await this.resolveTaiwanEverHeldAssets(input.assetIds)
    const firstBuyByAssetId = await this.loadFirstBuyDates(assets.map((asset) => asset.id))

    const candidates: Array<{
      asset: TaiwanEverHeldAsset
      startDate: string
      reason: string
    }> = []

    for (const asset of assets) {
      const firstBuyDate = firstBuyByAssetId.get(asset.id)
      if (!firstBuyDate) {
        continue
      }

      const backfillAssessment = await this.assessBackfillNeed(asset.id, firstBuyDate, endDate)
      if (!backfillAssessment.needsBackfill) {
        continue
      }

      candidates.push({
        asset,
        startDate: input.startDate ?? firstBuyDate,
        reason: backfillAssessment.reason,
      })
    }

    const selected = candidates.slice(0, maxAssetsPerRun)
    const skippedCount = assets.length - selected.length

    this.logger.log(
      `TW backfill ${endDate}: ${selected.length} asset(s) to process, ${skippedCount} skipped (complete or over limit ${maxAssetsPerRun})`,
    )

    let rowsUpserted = 0
    const perAsset: SyncTaiwanPricesResult['perAsset'] = []

    for (const { asset, startDate, reason } of selected) {
      const rows = await this.fetchAndUpsertRange(asset, startDate, endDate)
      rowsUpserted += rows
      perAsset.push({
        assetId: asset.id,
        symbol: asset.symbol,
        rows,
        reason,
      })
      this.logger.log(`TW backfill ${asset.symbol}: upserted ${rows} row(s) (${reason})`)
    }

    for (const asset of assets) {
      if (perAsset.some((entry) => entry.assetId === asset.id)) {
        continue
      }
      const firstBuyDate = firstBuyByAssetId.get(asset.id)
      if (!firstBuyDate) {
        perAsset.push({
          assetId: asset.id,
          symbol: asset.symbol,
          rows: 0,
          skipped: true,
          reason: 'no_buy_transaction',
        })
        continue
      }

      const assessment = await this.assessBackfillNeed(asset.id, firstBuyDate, endDate)
      perAsset.push({
        assetId: asset.id,
        symbol: asset.symbol,
        rows: 0,
        skipped: true,
        reason: assessment.needsBackfill ? 'backfill_limit' : 'already_complete',
      })
    }

    perAsset.sort((left, right) => left.symbol.localeCompare(right.symbol))

    return {
      market: 'tw',
      mode: 'backfill',
      startDate: selected[0]?.startDate ?? endDate,
      endDate,
      assetsRequested: assets.length,
      assetsProcessed: selected.length,
      assetsSkipped: skippedCount,
      rowsUpserted,
      perAsset,
    }
  }

  private async syncAssetsInRange(
    assets: TaiwanEverHeldAsset[],
    input: {
      mode: TaiwanPriceSyncMode
      startDate: string
      endDate: string
      assetsRequested: number
    },
  ): Promise<SyncTaiwanPricesResult> {
    let rowsUpserted = 0
    const perAsset: SyncTaiwanPricesResult['perAsset'] = []

    for (const asset of assets) {
      const rows = await this.fetchAndUpsertRange(asset, input.startDate, input.endDate)
      rowsUpserted += rows
      perAsset.push({
        assetId: asset.id,
        symbol: asset.symbol,
        rows,
      })
    }

    return {
      market: 'tw',
      mode: input.mode,
      startDate: input.startDate,
      endDate: input.endDate,
      assetsRequested: input.assetsRequested,
      assetsProcessed: assets.length,
      assetsSkipped: 0,
      rowsUpserted,
      perAsset,
    }
  }

  private async fetchAndUpsertRange(
    asset: TaiwanEverHeldAsset,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const rows = await this.taiwanPriceProvider.getDailyPrices({
      stockId: asset.symbol,
      startDate,
      endDate,
    })

    for (const row of rows) {
      await this.upsertTaiwanDailyPrice(asset.id, row)
    }

    return rows.length
  }

  /** TWD assets that appear in any non-deleted buy/sell transaction (ever held). */
  async resolveTaiwanEverHeldAssets(assetIds?: string[]): Promise<TaiwanEverHeldAsset[]> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['assetId'],
      where: {
        isDeleted: false,
        type: { in: [TxType.buy, TxType.sell] },
        assetId: { not: null },
        ...(assetIds && assetIds.length > 0 ? { assetId: { in: assetIds } } : {}),
        asset: {
          baseCurrency: 'TWD',
        },
      },
    })

    const resolvedAssetIds = grouped
      .map((row) => row.assetId)
      .filter((id): id is string => id != null)

    if (resolvedAssetIds.length === 0) {
      return []
    }

    return this.prisma.asset.findMany({
      where: {
        id: { in: resolvedAssetIds },
        baseCurrency: 'TWD',
      },
      select: {
        id: true,
        symbol: true,
      },
      orderBy: {
        symbol: 'asc',
      },
    })
  }

  private async loadFirstBuyDates(assetIds: string[]): Promise<Map<string, string>> {
    if (assetIds.length === 0) {
      return new Map()
    }

    const grouped = await this.prisma.transaction.groupBy({
      by: ['assetId'],
      where: {
        isDeleted: false,
        type: TxType.buy,
        assetId: { in: assetIds },
      },
      _min: {
        tradeTime: true,
      },
    })

    const result = new Map<string, string>()
    for (const row of grouped) {
      if (!row.assetId || !row._min.tradeTime) {
        continue
      }
      result.set(row.assetId, tradeTimeToIsoDate(row._min.tradeTime, TAIWAN_MARKET_TIME_ZONE))
    }

    return result
  }

  private async assessBackfillNeed(assetId: string, firstBuyDate: string, endDate: string) {
    const bounds = await this.prisma.price.aggregate({
      where: { assetId },
      _min: { asOf: true },
      _max: { asOf: true },
    })

    if (!bounds._min.asOf || !bounds._max.asOf) {
      return {
        needsBackfill: true,
        reason: 'no_price_rows',
      }
    }

    const minDate = bounds._min.asOf.toISOString().slice(0, 10)
    const maxDate = bounds._max.asOf.toISOString().slice(0, 10)
    const latestTarget = shiftIsoDate(endDate, -1)

    if (minDate > firstBuyDate) {
      return {
        needsBackfill: true,
        reason: 'missing_prefix_history',
      }
    }

    if (maxDate < latestTarget) {
      return {
        needsBackfill: true,
        reason: 'missing_recent_history',
      }
    }

    return {
      needsBackfill: false,
      reason: 'already_complete',
    }
  }

  private async upsertTaiwanDailyPrice(assetId: string, row: TaiwanStockDailyPrice) {
    const asOf = toTradeDateUtc(row.date)
    const data = this.toPriceWriteInput(row)

    await this.prisma.price.upsert({
      where: {
        assetId_asOf: {
          assetId,
          asOf,
        },
      },
      create: {
        assetId,
        asOf,
        source: row.provider,
        ...data,
      },
      update: {
        source: row.provider,
        ...data,
      },
    })
  }

  private toPriceWriteInput(
    row: TaiwanStockDailyPrice,
  ): Omit<Prisma.PriceCreateInput, 'asset' | 'assetId' | 'asOf' | 'source'> {
    return {
      price: row.close,
      open: row.open,
      high: row.high,
      low: row.low,
      volume: row.volume,
      turnoverAmount: row.turnoverAmount,
      changeRate: row.changeRate,
      tradeCount: row.tradeCount,
    }
  }

  private todayInTaiwan(): string {
    return toTimeZoneIsoDate(new Date(), TAIWAN_MARKET_TIME_ZONE)
  }

  private getBackfillMaxAssetsPerRun(): number {
    const raw = process.env.BACKFILL_MAX_ASSETS_PER_RUN
    if (!raw) {
      return DEFAULT_BACKFILL_MAX_ASSETS_PER_RUN
    }
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : DEFAULT_BACKFILL_MAX_ASSETS_PER_RUN
  }
}
