import { Module } from '@nestjs/common'
import { CorpActionController } from './corp-action.controller'
import { CorpActionScheduler } from './corp-action.scheduler'
import { CorpActionService } from './corp-action.service'
import {
  TW_SPLIT_EVENT_PROVIDER,
  US_SPLIT_EVENT_PROVIDER,
} from './corp-action.types'
import { FinmindTwSplitProvider } from './providers/finmind-tw-split.provider'
import { UsSplitInferProvider } from './providers/us-split-infer.provider'
import { SplitLedgerService } from './split-ledger.service'

@Module({
  controllers: [CorpActionController],
  providers: [
    CorpActionService,
    CorpActionScheduler,
    SplitLedgerService,
    FinmindTwSplitProvider,
    UsSplitInferProvider,
    {
      provide: TW_SPLIT_EVENT_PROVIDER,
      useExisting: FinmindTwSplitProvider,
    },
    {
      provide: US_SPLIT_EVENT_PROVIDER,
      useExisting: UsSplitInferProvider,
    },
  ],
  exports: [CorpActionService, SplitLedgerService],
})
export class CorporateActionsModule {}
