import { TwCatalogBootstrapError } from './tw-catalog-bootstrap.error'
import { getTwCatalogSourceById } from './tw-catalog-sources'
import type { TwCatalogSourceId } from './tw-catalog-bootstrap.types'

const DEFAULT_TIMEOUT_MS = 30_000

export type TwCatalogFetchOptions = {
  fetchFn?: typeof fetch
  timeoutMs?: number
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'object' && entry !== null)
}

export async function fetchTwCatalogSource(
  sourceId: TwCatalogSourceId,
  options: TwCatalogFetchOptions = {},
): Promise<Record<string, unknown>[]> {
  const source = getTwCatalogSourceById(sourceId)
  const fetchFn = options.fetchFn ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchFn(source.url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new TwCatalogBootstrapError(
        `TW catalog source ${source.id} failed with HTTP ${response.status}. ` +
          `Re-run with: pnpm assets:bootstrap:tw -- --dry-run`,
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new TwCatalogBootstrapError(
        `TW catalog source ${source.id} returned invalid JSON. ` +
          `Re-run with: pnpm assets:bootstrap:tw -- --dry-run`,
      )
    }

    if (!isRecordArray(payload)) {
      throw new TwCatalogBootstrapError(
        `TW catalog source ${source.id} returned an unexpected payload shape. ` +
          `Re-run with: pnpm assets:bootstrap:tw -- --dry-run`,
      )
    }

    if (payload.length === 0) {
      throw new TwCatalogBootstrapError(
        `TW catalog source ${source.id} returned zero records. ` +
          `Re-run with: pnpm assets:bootstrap:tw -- --dry-run`,
      )
    }

    return payload
  } catch (error) {
    if (error instanceof TwCatalogBootstrapError) {
      throw error
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new TwCatalogBootstrapError(
        `TW catalog source ${source.id} timed out after ${timeoutMs}ms. ` +
          `Re-run with: pnpm assets:bootstrap:tw -- --dry-run`,
      )
    }

    const message = error instanceof Error ? error.message : String(error)
    throw new TwCatalogBootstrapError(
      `TW catalog source ${source.id} fetch failed: ${message}. ` +
        `Re-run with: pnpm assets:bootstrap:tw -- --dry-run`,
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchAllTwCatalogSources(
  options: TwCatalogFetchOptions = {},
): Promise<Record<TwCatalogSourceId, Record<string, unknown>[]>> {
  const sourceIds: TwCatalogSourceId[] = ['twse_listed_stock', 'tpex_otc_stock', 'twse_listed_etf']
  const results = await Promise.all(
    sourceIds.map(async (sourceId) => [sourceId, await fetchTwCatalogSource(sourceId, options)] as const),
  )

  return Object.fromEntries(results) as Record<TwCatalogSourceId, Record<string, unknown>[]>
}
