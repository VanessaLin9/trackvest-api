import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { CorpActionService } from '../src/corporate-actions/corp-action.service'
import { CorpActionMarket } from '../src/corporate-actions/corp-action.types'

function parseMarket(value: string | undefined): CorpActionMarket | 'all' {
  if (!value || value === 'all') {
    return 'all'
  }
  if (value === 'tw' || value === 'us') {
    return value
  }
  throw new Error(`Unsupported market: ${value}. Use tw, us, or all.`)
}

async function main() {
  const market = parseMarket(process.argv[2])
  const startDate = process.argv[3]
  const endDate = process.argv[4]

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  })

  try {
    const corpActionService = app.get(CorpActionService)
    const result = await corpActionService.syncSplits({ market, startDate, endDate })
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
