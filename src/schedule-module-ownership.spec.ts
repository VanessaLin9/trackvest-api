import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { ScheduleModule } from '@nestjs/schedule'
import { AppModule } from './app.module'
import { CommonModule } from './common/common.module'
import { CorpActionScheduler } from './corporate-actions/corp-action.scheduler'
import { CorporateActionsModule } from './corporate-actions/corporate-actions.module'
import { MarketPriceScheduler } from './market-price/market-price.scheduler'
import { MarketPriceModule } from './market-price/market-price.module'
import { PrismaModule } from './prisma.module'

describe('Schedule module ownership (P5)', () => {
  /*
   * P5 schedule module ownership inventory:
   * - No dedicated scheduler/module tests existed before this task.
   * - e2e specs compile AppModule but do not assert scheduler registration.
   * - These tests lock scheduler DI registration and the root ScheduleModule pattern.
   */

  it('registers MarketPriceScheduler and CorpActionScheduler when AppModule compiles', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    expect(moduleRef.get(MarketPriceScheduler)).toBeInstanceOf(MarketPriceScheduler)
    expect(moduleRef.get(CorpActionScheduler)).toBeInstanceOf(CorpActionScheduler)

    await moduleRef.close()
  })

  it('registers CorpActionScheduler when ScheduleModule.forRoot is mounted at root without MarketPriceModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        CommonModule,
        ScheduleModule.forRoot(),
        CorporateActionsModule,
      ],
    }).compile()

    expect(moduleRef.get(CorpActionScheduler)).toBeInstanceOf(CorpActionScheduler)

    await moduleRef.close()
  })

  it('registers MarketPriceScheduler when ScheduleModule.forRoot is mounted at root without CorporateActionsModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        ScheduleModule.forRoot(),
        MarketPriceModule,
      ],
    }).compile()

    expect(moduleRef.get(MarketPriceScheduler)).toBeInstanceOf(MarketPriceScheduler)

    await moduleRef.close()
  })
})
