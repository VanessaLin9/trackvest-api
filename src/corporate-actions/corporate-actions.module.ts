import { Module } from '@nestjs/common'
import { CashInLieuService } from './cash-in-lieu.service'
import { CashInLieuController } from './cash-in-lieu.controller'
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
import { AlphaVantageUsSplitProvider } from './providers/alpha-vantage-us-split.provider'

@Module({
  imports: [GlModule],
  controllers: [CorpActionController, CashInLieuController],
  providers: [
    CashInLieuService,
    CorpActionService,
    CorpActionScheduler,
    PositionReplayService,
    FinmindTwSplitProvider,
    AlphaVantageUsSplitProvider,
    {
      provide: TW_SPLIT_EVENT_PROVIDER,
      useExisting: FinmindTwSplitProvider,
    },
    {
      provide: US_SPLIT_EVENT_PROVIDER,
      useExisting: AlphaVantageUsSplitProvider,
    },
  ],
  exports: [CorpActionService, PositionReplayService],
})
export class CorporateActionsModule {}
