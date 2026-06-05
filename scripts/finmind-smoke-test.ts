/**
 * Smoke test FinMind TaiwanStockPrice and USStockPrice APIs.
 *
 * Usage:
 *   pnpm finmind:smoke
 *
 * Requires FIN_MIND_TOKEN in .env or environment.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

const FINMIND_DATA_URL =
  process.env.FINMIND_API_BASE_URL ?? 'https://api.finmindtrade.com/api/v4/data'

type FinMindRow = Record<string, unknown>

type FinMindResponse = {
  msg?: string
  status?: number
  data?: FinMindRow[]
}

function loadFinMindTokenFromDotEnv(): string | undefined {
  if (process.env.FIN_MIND_TOKEN) {
    return process.env.FIN_MIND_TOKEN
  }

  try {
    const envPath = resolve(__dirname, '../.env')
    const content = readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      const eq = trimmed.indexOf('=')
      if (eq <= 0) {
        continue
      }
      const key = trimmed.slice(0, eq).trim()
      if (key !== 'FIN_MIND_TOKEN') {
        continue
      }
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      return value
    }
  } catch {
    return undefined
  }

  return undefined
}

async function fetchFinMindDataset(input: {
  token: string
  dataset: string
  dataId: string
  startDate: string
  endDate: string
}): Promise<FinMindResponse> {
  const url = new URL(FINMIND_DATA_URL)
  url.searchParams.set('dataset', input.dataset)
  url.searchParams.set('data_id', input.dataId)
  url.searchParams.set('start_date', input.startDate)
  url.searchParams.set('end_date', input.endDate)

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${input.token}`,
      accept: 'application/json',
    },
  })

  const payload = (await response.json()) as FinMindResponse

  if (!response.ok) {
    throw new Error(
      `FinMind ${input.dataset}/${input.dataId} HTTP ${response.status}: ${payload.msg ?? 'unknown error'}`,
    )
  }

  if (payload.status != null && payload.status !== 200) {
    throw new Error(
      `FinMind ${input.dataset}/${input.dataId} status ${payload.status}: ${payload.msg ?? 'unknown error'}`,
    )
  }

  return payload
}

function printSampleRow(row: FinMindRow, fields: readonly string[]) {
  for (const field of fields) {
    console.log(`    ${field}: ${row[field] ?? '(n/a)'}`)
  }
}

async function main() {
  const token = loadFinMindTokenFromDotEnv()
  if (!token) {
    console.error('Missing FIN_MIND_TOKEN. Add it to .env or export it in the shell.')
    process.exit(1)
  }

  const endDate = new Date()
  const start = new Date(endDate)
  start.setDate(start.getDate() - 10)
  const startDate = start.toISOString().slice(0, 10)
  const endDateStr = endDate.toISOString().slice(0, 10)

  console.log(`FinMind smoke test (${startDate} → ${endDateStr})`)
  console.log(`API: ${FINMIND_DATA_URL}\n`)

  const twPayload = await fetchFinMindDataset({
    token,
    dataset: 'TaiwanStockPrice',
    dataId: '2330',
    startDate,
    endDate: endDateStr,
  })
  const twRows = twPayload.data ?? []
  console.log(`TW 2330 rows: ${twRows.length}`)
  if (twRows.length > 0) {
    console.log('  latest row:')
    printSampleRow(twRows[twRows.length - 1]!, [
      'date',
      'stock_id',
      'open',
      'max',
      'min',
      'close',
      'spread',
      'Trading_Volume',
      'Trading_money',
      'Trading_turnover',
    ])
  }

  const usPayload = await fetchFinMindDataset({
    token,
    dataset: 'USStockPrice',
    dataId: 'AAPL',
    startDate,
    endDate: endDateStr,
  })
  const usRows = usPayload.data ?? []
  console.log(`\nUS AAPL rows: ${usRows.length}`)
  if (usRows.length > 0) {
    console.log('  latest row:')
    printSampleRow(usRows[usRows.length - 1]!, [
      'date',
      'stock_id',
      'Open',
      'High',
      'Low',
      'Close',
      'Adj_Close',
      'Volume',
    ])
  }

  console.log('\nOK — FinMind Taiwan + US price fetch succeeded.')
}

main().catch((error) => {
  console.error('FinMind smoke test failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
