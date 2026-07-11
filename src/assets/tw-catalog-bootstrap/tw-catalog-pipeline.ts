import type { SeedDbClient } from '../../../prisma/seed/seed-db-client'
import { collectTwCatalogRecords } from './tw-catalog-collect'
import type { TwCatalogFetchOptions } from './tw-catalog-fetch'
import type { TwCatalogBootstrapSummary } from './tw-catalog-bootstrap.types'
import { applyTwCatalogUpserts, planTwCatalogUpserts, runTwCatalogUpsertTransaction } from './tw-catalog-upsert'

export type TwCatalogPipelineInput = {
  dryRun: boolean
  fetchOptions?: TwCatalogFetchOptions
  db?: SeedDbClient
}

function countWouldCreateAliases(records: { globalAliases: string[] }[]): number {
  const aliases = new Set<string>()
  for (const record of records) {
    for (const alias of record.globalAliases) {
      aliases.add(alias)
    }
  }
  return aliases.size
}

export async function runTwCatalogBootstrapPipeline(
  input: TwCatalogPipelineInput,
): Promise<TwCatalogBootstrapSummary> {
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  const collected = await collectTwCatalogRecords(input.fetchOptions)

  const summary: TwCatalogBootstrapSummary = {
    dryRun: input.dryRun,
    startedAt,
    durationMs: 0,
    sources: collected.sources,
    records: collected.records,
    wouldCreateAssets: collected.uniqueRecords.length,
    wouldCreateAliases: countWouldCreateAliases(collected.uniqueRecords),
    sampleRecords: collected.uniqueRecords.slice(0, 5),
    skippedExamples: collected.skippedExamples,
    symbolConflicts: collected.symbolConflicts,
  }

  if (!input.db) {
    summary.durationMs = Date.now() - startedMs
    return summary
  }

  if (input.dryRun) {
    summary.upsert = await planTwCatalogUpserts(input.db, collected.uniqueRecords)
    summary.durationMs = Date.now() - startedMs
    return summary
  }

  summary.upsert = await runTwCatalogUpsertTransaction(input.db, collected.uniqueRecords)
  summary.durationMs = Date.now() - startedMs
  return summary
}

/** @deprecated Use runTwCatalogBootstrapPipeline */
export async function runTwCatalogDryRunPipeline(
  input: Pick<TwCatalogPipelineInput, 'dryRun' | 'fetchOptions'>,
): Promise<TwCatalogBootstrapSummary> {
  return runTwCatalogBootstrapPipeline(input)
}
