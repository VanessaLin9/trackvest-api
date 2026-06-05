import { Injectable } from '@nestjs/common'
import {
  assertFinMindStockId,
  fetchFinMindDataset,
  requireFinMindNumber,
  requireFinMindString,
} from '../../market-price/providers/finmind-api.util'
import type { FinMindRow } from '../../market-price/providers/finmind-api.util'
import {
  CorpActionMarket,
  SplitDirection,
  SplitEvent,
  SplitEventProvider,
} from '../corp-action.types'

@Injectable()
export class FinmindTwSplitProvider implements SplitEventProvider {
  readonly market: CorpActionMarket = 'tw'
  readonly providerKey = 'finmind'

  async fetchSplitEvents(input: {
    stockId: string
    startDate: string
    endDate: string
  }): Promise<SplitEvent[]> {
    const rows = await fetchFinMindDataset({
      dataset: 'TaiwanStockSplitPrice',
      dataId: input.stockId,
      startDate: input.startDate,
      endDate: input.endDate,
    })

    return rows.map((row) => this.toSplitEvent(input.stockId, row))
  }

  private toSplitEvent(expectedStockId: string, row: FinMindRow): SplitEvent {
    assertFinMindStockId(row, expectedStockId)

    const rawType = requireFinMindString(row, 'type')
    const direction = this.toDirection(rawType)
    const beforePrice = requireFinMindNumber(row, 'before_price')
    const afterPrice = requireFinMindNumber(row, 'after_price')
    const exDate = requireFinMindString(row, 'date')

    if (afterPrice <= 0) {
      throw new Error(`FinMind split after_price must be positive for ${expectedStockId} on ${exDate}`)
    }

    const ratio = beforePrice / afterPrice
    const sourceKey = `${expectedStockId}:${exDate}:${rawType}`

    return {
      stockId: expectedStockId,
      exDate,
      direction,
      ratio,
      beforePrice,
      afterPrice,
      sourceKey,
    }
  }

  private toDirection(rawType: string): SplitDirection {
    if (rawType === '分割') {
      return 'split'
    }
    if (rawType === '反分割') {
      return 'reverse_split'
    }
    throw new Error(`Unsupported FinMind TaiwanStockSplitPrice type: ${rawType}`)
  }
}
