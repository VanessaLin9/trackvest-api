import { withEnv } from './testing/with-env'
import { isScheduledJobsEnabled } from './scheduled-jobs.config'

describe('scheduled jobs config', () => {
  it('is disabled when ENABLE_SCHEDULED_JOBS is unset', async () => {
    await withEnv({ ENABLE_SCHEDULED_JOBS: undefined }, () => {
      expect(isScheduledJobsEnabled()).toBe(false)
    })
  })

  it('is disabled when ENABLE_SCHEDULED_JOBS is not exactly true', async () => {
    await withEnv({ ENABLE_SCHEDULED_JOBS: 'false' }, () => {
      expect(isScheduledJobsEnabled()).toBe(false)
    })

    await withEnv({ ENABLE_SCHEDULED_JOBS: 'yes' }, () => {
      expect(isScheduledJobsEnabled()).toBe(false)
    })
  })

  it('is enabled only when ENABLE_SCHEDULED_JOBS=true', async () => {
    await withEnv({ ENABLE_SCHEDULED_JOBS: 'true' }, () => {
      expect(isScheduledJobsEnabled()).toBe(true)
    })
  })
})
