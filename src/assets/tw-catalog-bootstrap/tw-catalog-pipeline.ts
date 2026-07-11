import { fetchAllTwCatalogSources, type TwCatalogFetchOptions } from './tw-catalog-fetch'
import { normalizeTwCatalogRecords } from './tw-catalog-normalizer'
import { parseTwCatalogSourceRows } from './tw-catalog-parser'
import type {
  TwAssetBootstrapRecord,
  TwCatalogDryRunSummary,
  TwCatalogSkipExample,
  TwCatalogSourceId,
  TwCatalogSourceSummary,
} from './tw-catalog-bootstrap.types'

const SOURCE_ORDER: TwCatalogSourceId[] = ['twse_listed_stock', 'tpex_otc_stock', 'twse_listed_etf']

export type TwCatalogPipelineInput = {
  dryRun: boolean
  fetchOptions?: TwCatalogFetchOptions
}

function createEmptySourceSummary(): TwCatalogSourceSummary {
  return { fetched: 0, valid: 0, filtered: 0 }
}

function dedupeRecordsBySymbol(records: TwAssetBootstrapRecord[]): {
  uniqueRecords: TwAssetBootstrapRecord[]
  duplicateSymbols: number
  symbolConflicts: TwCatalogDryRunSummary['symbolConflicts']
} {
  const bySymbol = new Map<string, TwAssetBootstrapRecord>()
  const symbolConflicts: TwCatalogDryRunSummary['symbolConflicts'] = []
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

function countAliases(records: TwAssetBootstrapRecord[]): number {
  const aliases = new Set<string>()
  for (const record of records) {
    for (const alias of record.globalAliases) {
      aliases.add(`${alias}::`)
    }
  }
  return aliases.size
}

export async function runTwCatalogDryRunPipeline(
  input: TwCatalogPipelineInput,
): Promise<TwCatalogDryRunSummary> {
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  const fetchedBySource = await fetchAllTwCatalogSources(input.fetchOptions)

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
    dryRun: input.dryRun,
    startedAt,
    durationMs: Date.now() - startedMs,
    sources,
    records: {
      totalValid: allValidRecords.length,
      uniqueSymbols: uniqueRecords.length,
      duplicateSymbols,
      byType,
      byAssetClass,
    },
    wouldCreateAssets: uniqueRecords.length,
    wouldCreateAliases: countAliases(uniqueRecords),
    sampleRecords: uniqueRecords.slice(0, 5),
    skippedExamples,
    symbolConflicts,
  }
}
