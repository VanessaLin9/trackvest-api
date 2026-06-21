import { withEnv } from '../deployment/testing/with-env'
import { CorpActionController } from './corp-action.controller'
import { CorpActionService } from './corp-action.service'

describe('CorpActionController (CP0 characterization)', () => {
  /*
   * Baseline: admin manual sync endpoint delegates directly to CorpActionService.
   * CP3 cron flag must not affect this endpoint.
   */

  function createHarness() {
    const corpActionService = {
      syncSplits: jest.fn(),
    }

    const controller = new CorpActionController(corpActionService as unknown as CorpActionService)

    return { controller, corpActionService }
  }

  it('syncSplits delegates to corpActionService.syncSplits', async () => {
    const { controller, corpActionService } = createHarness()
    corpActionService.syncSplits.mockResolvedValue({
      eventsUpserted: 2,
      scopesReplayed: 1,
      replayPending: 0,
    })

    const body = {
      market: 'tw' as const,
      startDate: '2025-06-01',
      endDate: '2025-07-31',
      assetIds: ['asset-0050'],
    }

    const result = await controller.syncSplits(body)

    expect(corpActionService.syncSplits).toHaveBeenCalledWith({
      market: 'tw',
      startDate: '2025-06-01',
      endDate: '2025-07-31',
      assetIds: ['asset-0050'],
    })
    expect(result).toEqual({
      eventsUpserted: 2,
      scopesReplayed: 1,
      replayPending: 0,
    })
  })

  describe('when ENABLE_SCHEDULED_JOBS=false', () => {
    it('syncSplits still delegates to corpActionService', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'false' }, async () => {
        const { controller, corpActionService } = createHarness()
        corpActionService.syncSplits.mockResolvedValue({
          eventsUpserted: 1,
          scopesReplayed: 0,
          replayPending: 0,
        })

        await controller.syncSplits({ market: 'tw' })

        expect(corpActionService.syncSplits).toHaveBeenCalledWith({ market: 'tw' })
      })
    })
  })
})
