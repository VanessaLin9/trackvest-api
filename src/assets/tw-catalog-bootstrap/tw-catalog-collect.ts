import { fetchAllTwCatalogSources, type TwCatalogFetchOptions } from './tw-catalog-fetch'
import { normalizeTwCatalogRecords } from './tw-catalog-normalizer'
import { parseTwCatalogSourceRows } from './tw-catalog-parser'
import type {
  TwAssetBootstrapRecord,
  TwCatalogSkipExample,
  TwCatalogSourceId,
  TwCatalogSourceSummary,
} from './tw-catalog-bootstrap.types'

const SOURCE_ORDER: TwCatalogSourceId[] = ['twse_listed_stock', 'tpex_otc_stock', 'twse_listed_etf']

export type TwCatalogCollectedRecords = {
  sources: Record<TwCatalogSourceId, TwCatalogSourceSummary>
  uniqueRecords: TwAssetBootstrapRecord[]
  skippedExamples: TwCatalogSkipExample[]
  symbolConflicts: Array<{
    symbol: string
    firstSource: TwCatalogSourceId
    conflictingSource: TwCatalogSourceId
  }>
  records: {
    totalValid: number
    uniqueSymbols: number
    duplicateSymbols: number
    byType: Record<'equity' | 'etf', number>
    byAssetClass: Record<'equity' | 'bond', number>
  }
}

function createEmptySourceSummary(): TwCatalogSourceSummary {
  return { fetched: 0, valid: 0, filtered: 0 }
}

function dedupeRecordsBySymbol(records: TwAssetBootstrapRecord[]): {
  uniqueRecords: TwAssetBootstrapRecord[]
  duplicateSymbols: number
  symbolConflicts: TwCatalogCollectedRecords['symbolConflicts']
} {
  const bySymbol = new Map<string, TwAssetBootstrapRecord>()
  const symbolConflicts: TwCatalogCollectedRecords['symbolConflicts'] = []
  let duplicateSymbols = 0

  for (const record of records) {
    const existing = bySymbol.get(record.symbol)
    if (!existing) {
      bySymbol.set(record.symbol, record)
      continue
    }

    duplicateSymbols += 1
    if (symbolConflicts.length < 5) {
      symbolConflicts.push({
        symbol: record.symbol,
        firstSource: existing.source,
        conflictingSource: record.source,
      })
    }
  }

  return {
    uniqueRecords: [...bySymbol.values()],
    duplicateSymbols,
    symbolConflicts,
  }
}

export async function collectTwCatalogRecords(
  fetchOptions?: TwCatalogFetchOptions,
): Promise<TwCatalogCollectedRecords> {
  const fetchedBySource = await fetchAllTwCatalogSources(fetchOptions)
  const sources = Object.fromEntries(
    SOURCE_ORDER.map((sourceId) => [sourceId, createEmptySourceSummary()]),
  ) as Record<TwCatalogSourceId, TwCatalogSourceSummary>

  const allValidRecords: TwAssetBootstrapRecord[] = []
  const skippedExamples: TwCatalogSkipExample[] = []

  for (const sourceId of SOURCE_ORDER) {
    const rows = fetchedBySource[sourceId]
    sources[sourceId].fetched = rows.length

    const { parsed, filtered: parseFiltered } = parseTwCatalogSourceRows(sourceId, rows)
    const { valid, skippedExamples: sourceSkipped, filtered: normalizeFiltered } =
      normalizeTwCatalogRecords(parsed)

    sources[sourceId].valid = valid.length
    sources[sourceId].filtered = parseFiltered + normalizeFiltered
    allValidRecords.push(...valid)

    for (const example of sourceSkipped) {
      if (skippedExamples.length < 10) {
        skippedExamples.push(example)
      }
    }
  }

  const { uniqueRecords, duplicateSymbols, symbolConflicts } = dedupeRecordsBySymbol(allValidRecords)
  const byType = { equity: 0, etf: 0 }
  const byAssetClass = { equity: 0, bond: 0 }

  for (const record of uniqueRecords) {
    byType[record.type] += 1
    byAssetClass[record.assetClass] += 1
  }

  return {
    sources,
    uniqueRecords,
    skippedExamples,
    symbolConflicts,
    records: {
      totalValid: allValidRecords.length,
      uniqueSymbols: uniqueRecords.length,
      duplicateSymbols,
      byType,
      byAssetClass,
    },
  }
}
