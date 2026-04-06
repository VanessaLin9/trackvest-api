export type FxRatePoint = {
  base: string
  quote: string
  rate: number
  date: string
  provider: string
}

export type FxRateQuery = {
  base: string
  quotes: string[]
  date?: string
  from?: string
  to?: string
}

export interface FxRateProvider {
  readonly providerKey: string
  getDailyReferenceRates(query: FxRateQuery): Promise<FxRatePoint[]>
}

export const FX_RATE_PROVIDER = 'FX_RATE_PROVIDER'
