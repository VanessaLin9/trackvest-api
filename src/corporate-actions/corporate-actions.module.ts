import { Module } from '@nestjs/common'
import { GlModule } from '../gl/gl.module'
import { CorpActionController } from './corp-action.controller'
import { CorpActionScheduler } from './corp-action.scheduler'
import { CorpActionService } from './corp-action.service'
import { PositionReplayService } from './position-replay.service'
import {
  TW_SPLIT_EVENT_PROVIDER,
  US_SPLIT_EVENT_PROVIDER,
} from './corp-action.types'
import { FinmindTwSplitProvider } from './providers/finmind-tw-split.provider'
import { UsSplitInferProvider } from './providers/us-split-infer.provider'

@Module({
  imports: [GlModule],
  controllers: [CorpActionController],
  providers: [
    CorpActionService,
    CorpActionScheduler,
    PositionReplayService,
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
  exports: [CorpActionService, PositionReplayService],
})
export class CorporateActionsModule {}
