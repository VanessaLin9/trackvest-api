import { withEnv } from '../deployment/testing/with-env'
import { expectCronSchedule } from '../deployment/testing/cron-metadata'
import { MarketPriceScheduler } from './market-price.scheduler'
import { MarketPriceService } from './market-price.service'

describe('MarketPriceScheduler', () => {
  const prototype = MarketPriceScheduler.prototype

  function createHarness() {
    const marketPriceService = {
      syncTaiwanPrices: jest.fn().mockResolvedValue({
        rowsUpserted: 2,
        assetsProcessed: 1,
        assetsSkipped: 0,
      }),
      syncUsPrices: jest.fn().mockResolvedValue({
        rowsUpserted: 3,
        assetsProcessed: 2,
        assetsSkipped: 0,
      }),
    }

    const scheduler = new MarketPriceScheduler(marketPriceService as unknown as MarketPriceService)

    return { scheduler, marketPriceService }
  }

  describe('cron schedule metadata', () => {
    it('locks TW daily expression and timezone', () => {
      expectCronSchedule(prototype, 'syncTwDailyCron', {
        cronTime: '45 17 * * 1-5',
        timeZone: 'Asia/Taipei',
      })
    })

    it('locks US daily expression and timezone', () => {
      expectCronSchedule(prototype, 'syncUsDailyCron', {
        cronTime: '15 17 * * 1-5',
        timeZone: 'America/New_York',
      })
    })

    it('locks TW backfill expression and timezone', () => {
      expectCronSchedule(prototype, 'syncTwBackfillCron', {
        cronTime: '0 2 * * *',
        timeZone: 'Asia/Taipei',
      })
    })

    it('locks US backfill expression and timezone', () => {
      expectCronSchedule(prototype, 'syncUsBackfillCron', {
        cronTime: '30 2 * * *',
        timeZone: 'America/New_York',
      })
    })
  })

  describe('when ENABLE_SCHEDULED_JOBS=true', () => {
    it('syncTwDailyCron delegates to syncTaiwanPrices with default mode', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'true' }, async () => {
        const { scheduler, marketPriceService } = createHarness()

        await scheduler.syncTwDailyCron()

        expect(marketPriceService.syncTaiwanPrices).toHaveBeenCalledTimes(1)
        expect(marketPriceService.syncTaiwanPrices).toHaveBeenCalledWith()
      })
    })

    it('syncUsDailyCron delegates to syncUsPrices with default mode', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'true' }, async () => {
        const { scheduler, marketPriceService } = createHarness()

        await scheduler.syncUsDailyCron()

        expect(marketPriceService.syncUsPrices).toHaveBeenCalledTimes(1)
        expect(marketPriceService.syncUsPrices).toHaveBeenCalledWith()
      })
    })

    it('syncTwBackfillCron delegates to syncTaiwanPrices in backfill mode', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'true' }, async () => {
        const { scheduler, marketPriceService } = createHarness()

        await scheduler.syncTwBackfillCron()

        expect(marketPriceService.syncTaiwanPrices).toHaveBeenCalledWith({ mode: 'backfill' })
      })
    })

    it('syncUsBackfillCron delegates to syncUsPrices in backfill mode', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'true' }, async () => {
        const { scheduler, marketPriceService } = createHarness()

        await scheduler.syncUsBackfillCron()

        expect(marketPriceService.syncUsPrices).toHaveBeenCalledWith({ mode: 'backfill' })
      })
    })
  })

  describe('ENABLE_SCHEDULED_JOBS guard', () => {
    it('skips all handlers when ENABLE_SCHEDULED_JOBS=false', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'false' }, async () => {
        const { scheduler, marketPriceService } = createHarness()

        await scheduler.syncTwDailyCron()
        await scheduler.syncUsDailyCron()
        await scheduler.syncTwBackfillCron()
        await scheduler.syncUsBackfillCron()

        expect(marketPriceService.syncTaiwanPrices).not.toHaveBeenCalled()
        expect(marketPriceService.syncUsPrices).not.toHaveBeenCalled()
      })
    })

    it('skips all handlers when ENABLE_SCHEDULED_JOBS is unset', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: undefined }, async () => {
        const { scheduler, marketPriceService } = createHarness()

        await scheduler.syncTwDailyCron()
        await scheduler.syncUsDailyCron()
        await scheduler.syncTwBackfillCron()
        await scheduler.syncUsBackfillCron()

        expect(marketPriceService.syncTaiwanPrices).not.toHaveBeenCalled()
        expect(marketPriceService.syncUsPrices).not.toHaveBeenCalled()
      })
    })
  })
})
