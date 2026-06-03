/**
 * CLI: sync Taiwan daily prices from FinMind into Price table.
 *
 * Usage:
 *   pnpm prices:sync-tw
 *   pnpm prices:sync-tw -- --start-date=2026-05-01 --end-date=2026-06-03
 */

import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { MarketPriceService } from '../src/market-price/market-price.service'

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const matched = process.argv.find((arg) => arg.startsWith(prefix))
  return matched?.slice(prefix.length)
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  })

  try {
    const service = app.get(MarketPriceService)
    const startDate = readArg('start-date')
    const endDate = readArg('end-date')
    const lookbackDaysRaw = readArg('lookback-days')
    const lookbackDays = lookbackDaysRaw ? Number(lookbackDaysRaw) : undefined

    const result = await service.syncTaiwanPrices({
      startDate,
      endDate,
      lookbackDays: Number.isFinite(lookbackDays) ? lookbackDays : undefined,
    })

    console.log('Taiwan price sync complete:')
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error('Taiwan price sync failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
