import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { MarketPriceService } from './market-price.service'

@Injectable()
export class MarketPriceScheduler {
  private readonly logger = new Logger(MarketPriceScheduler.name)

  constructor(private readonly marketPriceService: MarketPriceService) {}

  /** Mon–Fri after Taiwan cash market close (~17:30 data refresh). */
  @Cron('45 17 * * 1-5', { timeZone: 'Asia/Taipei' })
  async syncTwDailyCron() {
    this.logger.log('Starting scheduled TW daily price sync')
    try {
      const result = await this.marketPriceService.syncTwDaily()
      this.logger.log(
        `TW daily cron done: ${result.rowsUpserted} row(s) across ${result.assetsProcessed} asset(s)`,
      )
    } catch (error) {
      this.logger.error(
        'TW daily cron failed',
        error instanceof Error ? error.stack : String(error),
      )
    }
  }

  /** Nightly backfill for ever-held TWD assets (rate-limited per run). */
  @Cron('0 2 * * *', { timeZone: 'Asia/Taipei' })
  async syncTwBackfillCron() {
    this.logger.log('Starting scheduled TW backfill price sync')
    try {
      const result = await this.marketPriceService.syncTwBackfill()
      this.logger.log(
        `TW backfill cron done: ${result.rowsUpserted} row(s), processed ${result.assetsProcessed}, skipped ${result.assetsSkipped}`,
      )
    } catch (error) {
      this.logger.error(
        'TW backfill cron failed',
        error instanceof Error ? error.stack : String(error),
      )
    }
  }
}
