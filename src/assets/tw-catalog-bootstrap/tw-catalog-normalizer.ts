import {
  ASSET_NAME_REGEX,
  ASSET_SYMBOL_REGEX,
  normalizeAssetNameInput,
  normalizeAssetSymbolInput,
} from '../../common/utils/asset-input.util'
import { classifyTwCatalogRecord } from './tw-catalog-classifier'
import type {
  TwAssetBootstrapRecord,
  TwCatalogRawRecord,
  TwCatalogSkipExample,
} from './tw-catalog-bootstrap.types'

function buildGlobalAliases(record: TwCatalogRawRecord): string[] {
  const aliases = new Set<string>([
    normalizeAssetNameInput(record.shortName),
    normalizeAssetSymbolInput(record.symbol),
  ])

  if (record.fullName) {
    aliases.add(normalizeAssetNameInput(record.fullName))
  }

  return [...aliases].filter((alias) => alias.length > 0)
}

export function normalizeTwCatalogRecord(
  record: TwCatalogRawRecord,
): { record: TwAssetBootstrapRecord } | { skip: TwCatalogSkipExample } {
  const classification = classifyTwCatalogRecord(record)
  if (classification.accepted === false) {
    return {
      skip: {
        source: record.source,
        reason: classification.reason,
        symbol: record.symbol,
      },
    }
  }

  const symbol = normalizeAssetSymbolInput(record.symbol)
  const name = normalizeAssetNameInput(record.shortName)

  if (!ASSET_SYMBOL_REGEX.test(symbol)) {
    return {
      skip: {
        source: record.source,
        reason: 'symbol failed Trackvest validation',
        symbol: record.symbol,
      },
    }
  }

  if (!ASSET_NAME_REGEX.test(name)) {
    return {
      skip: {
        source: record.source,
        reason: 'name failed Trackvest validation',
        symbol: record.symbol,
      },
    }
  }

  return {
    record: {
      symbol,
      name,
      type: classification.type,
      assetClass: classification.assetClass,
      baseCurrency: 'TWD',
      source: record.source,
      globalAliases: buildGlobalAliases(record),
    },
  }
}

export function normalizeTwCatalogRecords(records: TwCatalogRawRecord[]): {
  valid: TwAssetBootstrapRecord[]
  skippedExamples: TwCatalogSkipExample[]
  filtered: number
} {
  const valid: TwAssetBootstrapRecord[] = []
  const skippedExamples: TwCatalogSkipExample[] = []
  let filtered = 0

  for (const record of records) {
    const result = normalizeTwCatalogRecord(record)
    if ('skip' in result) {
      filtered += 1
      if (skippedExamples.length < 5) {
        skippedExamples.push(result.skip)
      }
      continue
    }
    valid.push(result.record)
  }

  return { valid, skippedExamples, filtered }
}
