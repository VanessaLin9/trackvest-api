import { withEnv } from '../deployment/testing/with-env'
import { expectCronSchedule } from '../deployment/testing/cron-metadata'
import { CorpActionScheduler } from './corp-action.scheduler'
import { CorpActionService } from './corp-action.service'

describe('CorpActionScheduler', () => {
  const prototype = CorpActionScheduler.prototype

  function createHarness() {
    const corpActionService = {
      syncSplits: jest.fn().mockResolvedValue({
        eventsUpserted: 1,
        scopesReplayed: 1,
        replayPending: 0,
      }),
    }

    const scheduler = new CorpActionScheduler(corpActionService as unknown as CorpActionService)

    return { scheduler, corpActionService }
  }

  describe('cron schedule metadata', () => {
    it('locks TW split expression and timezone', () => {
      expectCronSchedule(prototype, 'syncTwSplitsCron', {
        cronTime: '0 18 * * 1-5',
        timeZone: 'Asia/Taipei',
      })
    })

    it('locks US split expression and timezone', () => {
      expectCronSchedule(prototype, 'syncUsSplitsCron', {
        cronTime: '30 18 * * 1-5',
        timeZone: 'America/New_York',
      })
    })
  })

  describe('when ENABLE_SCHEDULED_JOBS=true', () => {
    it('syncTwSplitsCron delegates to syncSplits for tw market', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'true' }, async () => {
        const { scheduler, corpActionService } = createHarness()

        await scheduler.syncTwSplitsCron()

        expect(corpActionService.syncSplits).toHaveBeenCalledTimes(1)
        expect(corpActionService.syncSplits).toHaveBeenCalledWith({ market: 'tw' })
      })
    })

    it('syncUsSplitsCron delegates to syncSplits for us market', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'true' }, async () => {
        const { scheduler, corpActionService } = createHarness()

        await scheduler.syncUsSplitsCron()

        expect(corpActionService.syncSplits).toHaveBeenCalledTimes(1)
        expect(corpActionService.syncSplits).toHaveBeenCalledWith({ market: 'us' })
      })
    })
  })

  describe('ENABLE_SCHEDULED_JOBS guard', () => {
    it('skips all handlers when ENABLE_SCHEDULED_JOBS=false', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'false' }, async () => {
        const { scheduler, corpActionService } = createHarness()

        await scheduler.syncTwSplitsCron()
        await scheduler.syncUsSplitsCron()

        expect(corpActionService.syncSplits).not.toHaveBeenCalled()
      })
    })

    it('skips all handlers when ENABLE_SCHEDULED_JOBS is unset', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: undefined }, async () => {
        const { scheduler, corpActionService } = createHarness()

        await scheduler.syncTwSplitsCron()
        await scheduler.syncUsSplitsCron()

        expect(corpActionService.syncSplits).not.toHaveBeenCalled()
      })
    })
  })
})
