export type CorpActionMarket = 'tw' | 'us'

export type SplitDirection = 'split' | 'reverse_split'

export type SplitEvent = {
  stockId: string
  exDate: string
  direction: SplitDirection
  ratio: number
  beforePrice?: number
  afterPrice?: number
  sourceKey: string
}

export interface SplitEventProvider {
  readonly market: CorpActionMarket
  readonly providerKey: string
  fetchSplitEvents(input: {
    stockId: string
    startDate: string
    endDate: string
  }): Promise<SplitEvent[]>
}

export const TW_SPLIT_EVENT_PROVIDER = Symbol('TW_SPLIT_EVENT_PROVIDER')
export const US_SPLIT_EVENT_PROVIDER = Symbol('US_SPLIT_EVENT_PROVIDER')

export type SyncSplitsResult = {
  market: CorpActionMarket | 'all'
  assetsProcessed: number
  eventsUpserted: number
  replayPending: boolean
}
