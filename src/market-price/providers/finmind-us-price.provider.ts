import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AlphaVantageUsSplitProvider } from '../../corporate-actions/providers/alpha-vantage-us-split.provider'
import { StockDailyPrice, StockPriceProvider, StockPriceQuery } from '../market-price.types'
import {
  assertFinMindStockId,
  fetchFinMindDataset,
  optionalFinMindNumber,
  requireFinMindNumber,
  requireFinMindString,
} from './finmind-api.util'
import type { FinMindRow } from './finmind-api.util'

/** FinMind `USStockPrice`；與 TW 共用 `fetchFinMindDataset`（PR #18）。 */
@Injectable()
export class FinmindUsPriceProvider implements StockPriceProvider {
  readonly providerKey = 'finmind-us-unadjusted'

  constructor(private readonly splits: AlphaVantageUsSplitProvider = new AlphaVantageUsSplitProvider()) {}

  async getDailyPrices(query: StockPriceQuery): Promise<StockDailyPrice[]> {
    const rows = await fetchFinMindDataset({
      dataset: 'USStockPrice',
      dataId: query.stockId,
      startDate: query.startDate,
      endDate: query.endDate,
    })

    if (rows.length === 0) return []
    // FinMind US OHLC is split-adjusted, including splits after query.endDate.
    const events = await this.splits.fetchSplitEvents({
      stockId: query.stockId,
      startDate: query.startDate,
      endDate: new Date().toISOString().slice(0, 10),
    })
    return rows.map((row) => {
      const price = this.toDailyPrice(query.stockId, row)
      const factor = events.filter((event) => event.exDate > price.date)
        .reduce((value, event) => value.mul(event.ratio), new Prisma.Decimal(1))
      return { ...price,
        open: new Prisma.Decimal(price.open).mul(factor).toNumber(),
        high: new Prisma.Decimal(price.high).mul(factor).toNumber(),
        low: new Prisma.Decimal(price.low).mul(factor).toNumber(),
        close: new Prisma.Decimal(price.close).mul(factor).toNumber(),
      }
    })
  }

  private toDailyPrice(expectedStockId: string, row: FinMindRow): StockDailyPrice {
    assertFinMindStockId(row, expectedStockId)

    return {
      date: requireFinMindString(row, 'date'),
      stockId: expectedStockId,
      open: requireFinMindNumber(row, 'Open'),
      high: requireFinMindNumber(row, 'High'),
      low: requireFinMindNumber(row, 'Low'),
      close: requireFinMindNumber(row, 'Close'),
      volume: optionalFinMindNumber(row, 'Volume'),
      adjClose: optionalFinMindNumber(row, 'Adj_Close'),
      provider: this.providerKey,
    }
  }
}
