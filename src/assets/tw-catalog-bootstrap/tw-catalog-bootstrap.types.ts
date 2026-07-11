import type { AssetClass, AssetType } from '@prisma/client'

export const TW_CATALOG_SOURCE_IDS = [
  'twse_listed_stock',
  'tpex_otc_stock',
  'twse_listed_etf',
] as const

export type TwCatalogSourceId = (typeof TW_CATALOG_SOURCE_IDS)[number]

export type TwCatalogSourceConfig = {
  id: TwCatalogSourceId
  label: string
  url: string
}

export type TwCatalogRawRecord = {
  source: TwCatalogSourceId
  symbol: string
  shortName: string
  fullName?: string
  fundType?: string
}

export type TwAssetBootstrapRecord = {
  symbol: string
  name: string
  type: Extract<AssetType, 'equity' | 'etf'>
  assetClass: Extract<AssetClass, 'equity' | 'bond'>
  baseCurrency: 'TWD'
  source: TwCatalogSourceId
  globalAliases: string[]
}

export type TwCatalogSkipExample = {
  source: TwCatalogSourceId
  reason: string
  symbol?: string
}

export type TwCatalogSourceSummary = {
  fetched: number
  valid: number
  filtered: number
}

export type TwCatalogDryRunSummary = {
  dryRun: boolean
  startedAt: string
  durationMs: number
  sources: Record<TwCatalogSourceId, TwCatalogSourceSummary>
  records: {
    totalValid: number
    uniqueSymbols: number
    duplicateSymbols: number
    byType: Record<'equity' | 'etf', number>
    byAssetClass: Record<'equity' | 'bond', number>
  }
  wouldCreateAssets: number
  wouldCreateAliases: number
  sampleRecords: TwAssetBootstrapRecord[]
  skippedExamples: TwCatalogSkipExample[]
  symbolConflicts: Array<{
    symbol: string
    firstSource: TwCatalogSourceId
    conflictingSource: TwCatalogSourceId
  }>
}
