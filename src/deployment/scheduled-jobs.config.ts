import { isEnvFlagTrue } from './env-flags'

/**
 * Cron 是否真正執行的閘門（PR #27）。
 * Scheduler DI 仍會註冊（PR #24）；只有 `ENABLE_SCHEDULED_JOBS=true` 才跑 handler。
 */
export function isScheduledJobsEnabled(): boolean {
  return isEnvFlagTrue('ENABLE_SCHEDULED_JOBS')
}
