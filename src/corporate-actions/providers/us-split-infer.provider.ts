import { Injectable } from '@nestjs/common'
import { CorpActionMarket, SplitEvent, SplitEventProvider } from '../corp-action.types'

/**
 * v1 stub — US split discovery from Close vs Adj_Close is deferred to a follow-up PR.
 * The shared SplitLedgerService is ready; wire inference here when adding US support.
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
