export type StockDailyPrice = {
  date: string
  stockId: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
  turnoverAmount?: number
  changeRate?: number
  tradeCount?: number
  adjClose?: number
  provider: string
}

export type StockPriceQuery = {
  stockId: string
  startDate: string
  endDate: string
}

export interface StockPriceProvider {
  readonly providerKey: string
  getDailyPrices(query: StockPriceQuery): Promise<StockDailyPrice[]>
}

export const TAIWAN_STOCK_PRICE_PROVIDER = 'TAIWAN_STOCK_PRICE_PROVIDER'
export const US_STOCK_PRICE_PROVIDER = 'US_STOCK_PRICE_PROVIDER'

/** @deprecated Use StockDailyPrice */
export type TaiwanStockDailyPrice = StockDailyPrice

/** @deprecated Use StockPriceQuery */
export type TaiwanStockPriceQuery = StockPriceQuery

/** @deprecated Use StockPriceProvider */
export type TaiwanStockPriceProvider = StockPriceProvider
