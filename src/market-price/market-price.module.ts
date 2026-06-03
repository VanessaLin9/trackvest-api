import { Module } from '@nestjs/common'
import { MarketPriceController } from './market-price.controller'
import { MarketPriceService } from './market-price.service'
import { TAIWAN_STOCK_PRICE_PROVIDER } from './market-price.types'
import { FinmindTaiwanPriceProvider } from './providers/finmind-taiwan-price.provider'

@Module({
  controllers: [MarketPriceController],
  providers: [
    MarketPriceService,
    FinmindTaiwanPriceProvider,
    {
      provide: TAIWAN_STOCK_PRICE_PROVIDER,
      useExisting: FinmindTaiwanPriceProvider,
    },
  ],
  exports: [MarketPriceService],
})
export class MarketPriceModule {}
