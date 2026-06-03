import { BadGatewayException, Injectable } from '@nestjs/common'
import {
  TaiwanStockDailyPrice,
  TaiwanStockPriceProvider,
  TaiwanStockPriceQuery,
} from '../market-price.types'

type FinMindRow = Record<string, unknown>

type FinMindResponse = {
  msg?: string
  status?: number
  data?: FinMindRow[]
}

@Injectable()
export class FinmindTaiwanPriceProvider implements TaiwanStockPriceProvider {
  readonly providerKey = 'finmind'

  private readonly apiBaseUrl =
    process.env.FINMIND_API_BASE_URL ?? 'https://api.finmindtrade.com/api/v4/data'

  async getDailyPrices(query: TaiwanStockPriceQuery): Promise<TaiwanStockDailyPrice[]> {
    const token = process.env.FIN_MIND_TOKEN?.trim()
    if (!token) {
      throw new BadGatewayException('FIN_MIND_TOKEN is not configured')
    }

    const url = new URL(this.apiBaseUrl)
    url.searchParams.set('dataset', 'TaiwanStockPrice')
    url.searchParams.set('data_id', query.stockId)
    url.searchParams.set('start_date', query.startDate)
    url.searchParams.set('end_date', query.endDate)

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
    })

    const payload = (await response.json()) as FinMindResponse

    if (!response.ok) {
      throw new BadGatewayException(
        `FinMind TaiwanStockPrice/${query.stockId} HTTP ${response.status}: ${payload.msg ?? 'unknown error'}`,
      )
    }

    if (payload.status != null && payload.status !== 200) {
      throw new BadGatewayException(
        `FinMind TaiwanStockPrice/${query.stockId} status ${payload.status}: ${payload.msg ?? 'unknown error'}`,
      )
    }

    return (payload.data ?? []).map((row) => this.toDailyPrice(query.stockId, row))
  }

  private toDailyPrice(expectedStockId: string, row: FinMindRow): TaiwanStockDailyPrice {
    const date = this.requireString(row, 'date')
    const stockId = this.requireString(row, 'stock_id')
    if (stockId !== expectedStockId) {
      throw new BadGatewayException(
        `FinMind row stock_id mismatch: expected ${expectedStockId}, got ${stockId}`,
      )
    }

    return {
      date,
      stockId,
      open: this.requireNumber(row, 'open'),
      high: this.requireNumber(row, 'max'),
      low: this.requireNumber(row, 'min'),
      close: this.requireNumber(row, 'close'),
      volume: this.requireNumber(row, 'Trading_Volume'),
      turnoverAmount: this.requireNumber(row, 'Trading_money'),
      changeRate: this.requireNumber(row, 'spread'),
      tradeCount: this.requireNumber(row, 'Trading_turnover'),
      provider: this.providerKey,
    }
  }

  private requireString(row: FinMindRow, key: string): string {
    const value = row[key]
    if (typeof value !== 'string' || value.length === 0) {
      throw new BadGatewayException(`FinMind row missing string field ${key}`)
    }
    return value
  }

  private requireNumber(row: FinMindRow, key: string): number {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
    throw new BadGatewayException(`FinMind row missing numeric field ${key}`)
  }
}
