/**
 * CLI: sync US daily prices from FinMind into Price table.
 *
 * Usage:
 *   pnpm prices:sync-us
 *   pnpm prices:sync-us -- --mode=daily
 *   pnpm prices:sync-us -- --mode=backfill
 *   pnpm prices:sync-us -- --mode=backfill --max-assets=5
 */

import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { MarketPriceService, MarketPriceSyncMode } from '../src/market-price/market-price.service'

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const matched = process.argv.find((arg) => arg.startsWith(prefix))
  return matched?.slice(prefix.length)
}

function parseMode(value: string | undefined): MarketPriceSyncMode {
  if (value === 'backfill') {
    return 'backfill'
  }
  return 'daily'
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  })

  try {
    const service = app.get(MarketPriceService)
    const mode = parseMode(readArg('mode'))
    const startDate = readArg('start-date')
    const endDate = readArg('end-date')
    const maxAssetsRaw = readArg('max-assets')
    const maxAssetsPerRun = maxAssetsRaw ? Number(maxAssetsRaw) : undefined

    const result = await service.syncUsPrices({
      mode,
      startDate,
      endDate,
      maxAssetsPerRun: Number.isFinite(maxAssetsPerRun) ? maxAssetsPerRun : undefined,
    })

    console.log('US price sync complete:')
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error('US price sync failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
