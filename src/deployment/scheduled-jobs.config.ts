import { isEnvFlagTrue } from './seed-guards'

/** Cron handlers run only when ENABLE_SCHEDULED_JOBS=true. Default is disabled. */
export function isScheduledJobsEnabled(): boolean {
  return isEnvFlagTrue('ENABLE_SCHEDULED_JOBS')
}
