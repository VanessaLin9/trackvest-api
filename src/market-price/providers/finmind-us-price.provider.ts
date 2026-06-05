import { Injectable } from '@nestjs/common'
import { StockDailyPrice, StockPriceProvider, StockPriceQuery } from '../market-price.types'
import {
  assertFinMindStockId,
  fetchFinMindDataset,
  optionalFinMindNumber,
  requireFinMindNumber,
  requireFinMindString,
} from './finmind-api.util'
import type { FinMindRow } from './finmind-api.util'

@Injectable()
export class FinmindUsPriceProvider implements StockPriceProvider {
  readonly providerKey = 'finmind'

  async getDailyPrices(query: StockPriceQuery): Promise<StockDailyPrice[]> {
    const rows = await fetchFinMindDataset({
      dataset: 'USStockPrice',
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
