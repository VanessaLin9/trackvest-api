import { Injectable } from '@nestjs/common'
import { StockDailyPrice, StockPriceProvider, StockPriceQuery } from '../market-price.types'
import {
  assertFinMindStockId,
  fetchFinMindDataset,
  requireFinMindNumber,
  requireFinMindString,
} from './finmind-api.util'
import type { FinMindRow } from './finmind-api.util'

/** FinMind `TaiwanStockPrice`（PR #17）。 */
@Injectable()
export class FinmindTaiwanPriceProvider implements StockPriceProvider {
  readonly providerKey = 'finmind'

  async getDailyPrices(query: StockPriceQuery): Promise<StockDailyPrice[]> {
    const rows = await fetchFinMindDataset({
      dataset: 'TaiwanStockPrice',
      dataId: query.stockId,
      startDate: query.startDate,
      endDate: query.endDate,
    })

    return rows.map((row) => this.toDailyPrice(query.stockId, row))
  }

  private toDailyPrice(expectedStockId: string, row: FinMindRow): StockDailyPrice {
    assertFinMindStockId(row, expectedStockId)

    return {
      date: requireFinMindString(row, 'date'),
      stockId: expectedStockId,
      open: requireFinMindNumber(row, 'open'),
      high: requireFinMindNumber(row, 'max'),
      low: requireFinMindNumber(row, 'min'),
      close: requireFinMindNumber(row, 'close'),
      volume: requireFinMindNumber(row, 'Trading_Volume'),
      turnoverAmount: requireFinMindNumber(row, 'Trading_money'),
      changeRate: requireFinMindNumber(row, 'spread'),
      tradeCount: requireFinMindNumber(row, 'Trading_turnover'),
      provider: this.providerKey,
    }
  }
}
