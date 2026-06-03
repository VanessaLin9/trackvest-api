export type TaiwanStockDailyPrice = {
  date: string
  stockId: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  turnoverAmount: number
  changeRate: number
  tradeCount: number
  provider: string
}

export type TaiwanStockPriceQuery = {
  stockId: string
  startDate: string
  endDate: string
}

export interface TaiwanStockPriceProvider {
  readonly providerKey: string
  getDailyPrices(query: TaiwanStockPriceQuery): Promise<TaiwanStockDailyPrice[]>
}

export const TAIWAN_STOCK_PRICE_PROVIDER = 'TAIWAN_STOCK_PRICE_PROVIDER'
