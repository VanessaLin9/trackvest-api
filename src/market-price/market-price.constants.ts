export const TAIWAN_MARKET_TIME_ZONE = 'Asia/Taipei'
export const US_MARKET_TIME_ZONE = 'America/New_York'

/** Recent trading days to re-fetch on daily sync (covers missed cron runs). */
export const TW_DAILY_LOOKBACK_DAYS = 2
export const US_DAILY_LOOKBACK_DAYS = 2

/**
 * Manual refresh 專用含首尾 14 個日曆日 window（PR #43）。
 * 涵蓋一般週末／休市；刻意不改 cron daily lookback（仍為 2 天）。
 */
export const MANUAL_REFRESH_LOOKBACK_DAYS = 14

/** Max assets processed per backfill cron run (FinMind rate limit). */
export const DEFAULT_BACKFILL_MAX_ASSETS_PER_RUN = 10
