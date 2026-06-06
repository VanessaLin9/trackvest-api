import { Injectable } from '@nestjs/common'
import { CorpActionMarket, SplitEvent, SplitEventProvider } from '../corp-action.types'

/**
 * US split discovery from Close vs Adj_Close is deferred to a follow-up PR.
 * Chronological replay lands in CP1; wire inference here when adding US support.
 */
@Injectable()
export class UsSplitInferProvider implements SplitEventProvider {
  readonly market: CorpActionMarket = 'us'
  readonly providerKey = 'price-infer'

  async fetchSplitEvents(_input: {
    stockId: string
    startDate: string
    endDate: string
  }): Promise<SplitEvent[]> {
    return []
  }
}
