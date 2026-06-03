export const TAIWAN_MARKET_TIME_ZONE = 'Asia/Taipei'

/** Recent trading days to re-fetch on daily sync (covers missed cron runs). */
export const TW_DAILY_LOOKBACK_DAYS = 2

/** Max assets processed per backfill cron run (FinMind rate limit). */
export const DEFAULT_BACKFILL_MAX_ASSETS_PER_RUN = 10
