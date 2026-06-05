import { BadGatewayException } from '@nestjs/common'

export type FinMindRow = Record<string, unknown>

export type FinMindResponse = {
  msg?: string
  status?: number
  data?: FinMindRow[]
}

export async function fetchFinMindDataset(input: {
  dataset: string
  dataId: string
  startDate: string
  endDate: string
  apiBaseUrl?: string
}): Promise<FinMindRow[]> {
  const token = process.env.FIN_MIND_TOKEN?.trim()
  if (!token) {
    throw new BadGatewayException('FIN_MIND_TOKEN is not configured')
  }

  const apiBaseUrl =
    input.apiBaseUrl ?? process.env.FINMIND_API_BASE_URL ?? 'https://api.finmindtrade.com/api/v4/data'

  const url = new URL(apiBaseUrl)
  url.searchParams.set('dataset', input.dataset)
  url.searchParams.set('data_id', input.dataId)
  url.searchParams.set('start_date', input.startDate)
  url.searchParams.set('end_date', input.endDate)

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  })

  const payload = (await response.json()) as FinMindResponse

  if (!response.ok) {
    throw new BadGatewayException(
      `FinMind ${input.dataset}/${input.dataId} HTTP ${response.status}: ${payload.msg ?? 'unknown error'}`,
    )
  }

  if (payload.status != null && payload.status !== 200) {
    throw new BadGatewayException(
      `FinMind ${input.dataset}/${input.dataId} status ${payload.status}: ${payload.msg ?? 'unknown error'}`,
    )
  }

  return payload.data ?? []
}

export function requireFinMindString(row: FinMindRow, key: string): string {
  const value = row[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadGatewayException(`FinMind row missing string field ${key}`)
  }
  return value
}

export function requireFinMindNumber(row: FinMindRow, key: string): number {
  const value = row[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  throw new BadGatewayException(`FinMind row missing numeric field ${key}`)
}

export function optionalFinMindNumber(row: FinMindRow, key: string): number | undefined {
  const value = row[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

export function assertFinMindStockId(row: FinMindRow, expectedStockId: string) {
  const stockId = requireFinMindString(row, 'stock_id')
  if (stockId !== expectedStockId) {
    throw new BadGatewayException(
      `FinMind row stock_id mismatch: expected ${expectedStockId}, got ${stockId}`,
    )
  }
}
