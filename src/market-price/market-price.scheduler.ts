import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { isScheduledJobsEnabled } from '../deployment/scheduled-jobs.config'
import { MarketPriceService } from './market-price.service'

@Injectable()
export class MarketPriceScheduler {
  private readonly logger = new Logger(MarketPriceScheduler.name)

  constructor(private readonly marketPriceService: MarketPriceService) {}

  /** Mon–Fri after Taiwan cash market close (~17:30 data refresh). */
  @Cron('45 17 * * 1-5', { timeZone: 'Asia/Taipei' })
  async syncTwDailyCron() {
    if (!isScheduledJobsEnabled()) {
      return
    }
    this.logger.log('Starting scheduled TW daily price sync')
    try {
      const result = await this.marketPriceService.syncTaiwanPrices()
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

  /** Mon–Fri after US cash market close (NYSE 16:00 ET). */
  @Cron('15 17 * * 1-5', { timeZone: 'America/New_York' })
  async syncUsDailyCron() {
    if (!isScheduledJobsEnabled()) {
      return
    }
    this.logger.log('Starting scheduled US daily price sync')
    try {
      const result = await this.marketPriceService.syncUsPrices()
      this.logger.log(
        `US daily cron done: ${result.rowsUpserted} row(s) across ${result.assetsProcessed} asset(s)`,
      )
    } catch (error) {
      this.logger.error(
        'US daily cron failed',
        error instanceof Error ? error.stack : String(error),
      )
    }
  }

  /** Nightly backfill for ever-held TWD assets (rate-limited per run). */
  @Cron('0 2 * * *', { timeZone: 'Asia/Taipei' })
  async syncTwBackfillCron() {
    if (!isScheduledJobsEnabled()) {
      return
    }
    this.logger.log('Starting scheduled TW backfill price sync')
    try {
      const result = await this.marketPriceService.syncTaiwanPrices({ mode: 'backfill' })
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

  /** Nightly backfill for ever-held USD assets (rate-limited per run). */
  @Cron('30 2 * * *', { timeZone: 'America/New_York' })
  async syncUsBackfillCron() {
    if (!isScheduledJobsEnabled()) {
      return
    }
    this.logger.log('Starting scheduled US backfill price sync')
    try {
      const result = await this.marketPriceService.syncUsPrices({ mode: 'backfill' })
      this.logger.log(
        `US backfill cron done: ${result.rowsUpserted} row(s), processed ${result.assetsProcessed}, skipped ${result.assetsSkipped}`,
      )
    } catch (error) {
      this.logger.error(
        'US backfill cron failed',
        error instanceof Error ? error.stack : String(error),
      )
    }
  }
}
