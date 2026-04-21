import { Module } from '@nestjs/common'
import { FxRateController } from './fx-rate.controller'
import { FxRateService } from './fx-rate.service'
import { FX_RATE_PROVIDER } from './fx-rate.types'
import { FrankfurterFxRateProvider } from './providers/frankfurter-fx-rate.provider'

@Module({
  controllers: [FxRateController],
  providers: [
    FxRateService,
    FrankfurterFxRateProvider,
    {
      provide: FX_RATE_PROVIDER,
      useExisting: FrankfurterFxRateProvider,
    },
  ],
  exports: [FxRateService],
})
export class FxModule {}
