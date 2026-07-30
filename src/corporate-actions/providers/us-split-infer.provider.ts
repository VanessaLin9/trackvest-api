import { Injectable } from '@nestjs/common'
import { CorpActionMarket, SplitEvent, SplitEventProvider } from '../corp-action.types'

/**
 * US 拆股推斷（Close vs Adj_Close）尚未實作；v1 回空陣列（PR #19）。
 * Chronological replay 已就緒；補 US 支援時在此接上 inference。
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
