import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import {
  TAIWAN_STOCK_PRICE_PROVIDER,
  TaiwanStockDailyPrice,
  TaiwanStockPriceProvider,
} from './market-price.types'

const TAIWAN_MARKET_TIME_ZONE = 'Asia/Taipei'
const DEFAULT_LOOKBACK_DAYS = 7

export type SyncTaiwanPricesInput = {
  startDate?: string
  endDate?: string
  lookbackDays?: number
  assetIds?: string[]
}

export type SyncTaiwanPricesResult = {
  market: 'tw'
  startDate: string
  endDate: string
  assetsRequested: number
  rowsUpserted: number
  perAsset: Array<{
    assetId: string
    symbol: string
    rows: number
  }>
}

@Injectable()
export class MarketPriceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TAIWAN_STOCK_PRICE_PROVIDER)
    private readonly taiwanPriceProvider: TaiwanStockPriceProvider,
  ) {}

  async syncTaiwanPrices(input: SyncTaiwanPricesInput = {}): Promise<SyncTaiwanPricesResult> {
    const endDate = input.endDate ?? this.toTimeZoneIsoDate(new Date(), TAIWAN_MARKET_TIME_ZONE)
    const lookbackDays = input.lookbackDays ?? DEFAULT_LOOKBACK_DAYS
    const startDate =
      input.startDate ??
      this.shiftIsoDate(endDate, -(Math.max(lookbackDays, 1) - 1))

    const assets = await this.resolveTaiwanAssets(input.assetIds)
    const perAsset: SyncTaiwanPricesResult['perAsset'] = []
    let rowsUpserted = 0

    for (const asset of assets) {
      const rows = await this.taiwanPriceProvider.getDailyPrices({
        stockId: asset.symbol,
        startDate,
        endDate,
      })

      for (const row of rows) {
        await this.upsertTaiwanDailyPrice(asset.id, row)
        rowsUpserted += 1
      }

      perAsset.push({
        assetId: asset.id,
        symbol: asset.symbol,
        rows: rows.length,
      })
    }

    return {
      market: 'tw',
      startDate,
      endDate,
      assetsRequested: assets.length,
      rowsUpserted,
      perAsset,
    }
  }

  private async resolveTaiwanAssets(assetIds?: string[]) {
    return this.prisma.asset.findMany({
      where: {
        baseCurrency: 'TWD',
        ...(assetIds && assetIds.length > 0 ? { id: { in: assetIds } } : {}),
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

  private async upsertTaiwanDailyPrice(assetId: string, row: TaiwanStockDailyPrice) {
    const asOf = this.toTradeDateUtc(row.date)
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

  private toPriceWriteInput(row: TaiwanStockDailyPrice): Omit<Prisma.PriceCreateInput, 'asset' | 'assetId' | 'asOf' | 'source'> {
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

  private toTradeDateUtc(isoDate: string): Date {
    return new Date(`${isoDate}T00:00:00.000Z`)
  }

  private toTimeZoneIsoDate(value: Date, timeZone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = formatter.formatToParts(value)
    const year = parts.find((part) => part.type === 'year')?.value
    const month = parts.find((part) => part.type === 'month')?.value
    const day = parts.find((part) => part.type === 'day')?.value

    if (!year || !month || !day) {
      throw new Error(`Failed to format date in timezone ${timeZone}`)
    }

    return `${year}-${month}-${day}`
  }

  private shiftIsoDate(isoDate: string, dayOffset: number): string {
    const date = new Date(`${isoDate}T00:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + dayOffset)
    return date.toISOString().slice(0, 10)
  }
}
