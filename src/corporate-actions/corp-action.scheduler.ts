import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { CorpActionService } from './corp-action.service'

@Injectable()
export class CorpActionScheduler {
  private readonly logger = new Logger(CorpActionScheduler.name)

  constructor(private readonly corpActionService: CorpActionService) {}

  /** Daily TW split sync after market data refresh. */
  @Cron('0 18 * * 1-5', { timeZone: 'Asia/Taipei' })
  async syncTwSplitsCron() {
    this.logger.log('Starting scheduled TW split sync')
    try {
      const result = await this.corpActionService.syncSplits({ market: 'tw' })
      this.logger.log(
        `TW split cron done: ${result.eventsUpserted} event(s) upserted, replayPending=${result.replayPending}`,
      )
    } catch (error) {
      this.logger.error(
        'TW split cron failed',
        error instanceof Error ? error.stack : String(error),
      )
    }
  }

  /** Daily US split sync placeholder (v1 provider returns no events). */
  @Cron('30 18 * * 1-5', { timeZone: 'America/New_York' })
  async syncUsSplitsCron() {
    this.logger.log('Starting scheduled US split sync')
    try {
      const result = await this.corpActionService.syncSplits({ market: 'us' })
      this.logger.log(
        `US split cron done: ${result.eventsUpserted} event(s) upserted, replayPending=${result.replayPending}`,
      )
    } catch (error) {
      this.logger.error(
        'US split cron failed',
        error instanceof Error ? error.stack : String(error),
      )
    }
  }
}
