import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { MarketPriceController } from './market-price.controller'
import { MarketPriceScheduler } from './market-price.scheduler'
import { MarketPriceService } from './market-price.service'
import { TAIWAN_STOCK_PRICE_PROVIDER } from './market-price.types'
import { FinmindTaiwanPriceProvider } from './providers/finmind-taiwan-price.provider'

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [MarketPriceController],
  providers: [
    MarketPriceService,
    MarketPriceScheduler,
    FinmindTaiwanPriceProvider,
    {
      provide: TAIWAN_STOCK_PRICE_PROVIDER,
      useExisting: FinmindTaiwanPriceProvider,
    },
  ],
  exports: [MarketPriceService],
})
export class MarketPriceModule {}
