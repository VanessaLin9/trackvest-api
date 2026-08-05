export const TAIWAN_MARKET_TIME_ZONE = 'Asia/Taipei'
export const US_MARKET_TIME_ZONE = 'America/New_York'

/** Recent trading days to re-fetch on daily sync (covers missed cron runs). */
export const TW_DAILY_LOOKBACK_DAYS = 2
export const US_DAILY_LOOKBACK_DAYS = 2

/**
 * Inclusive calendar-day window for manual POST /prices/refresh only.
 * Covers typical weekends/holidays; does not change cron daily lookback.
 */
export const MANUAL_REFRESH_LOOKBACK_DAYS = 14

/** Max assets processed per backfill cron run (FinMind rate limit). */
export const DEFAULT_BACKFILL_MAX_ASSETS_PER_RUN = 10
