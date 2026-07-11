import type { SeedDbClient } from '../../../prisma/seed/seed-db-client'
import type { TwAssetBootstrapRecord } from './tw-catalog-bootstrap.types'

export const TW_GLOBAL_ALIAS_BROKER = ''

export type TwCatalogAliasConflictExample = {
  alias: string
  existingAssetId: string
  expectedSymbol: string
}

export type TwCatalogUpsertCounts = {
  assets: {
    created: number
    skippedExisting: number
  }
  aliases: {
    created: number
    skippedExisting: number
    conflicts: number
    conflictExamples: TwCatalogAliasConflictExample[]
  }
}

async function resolveAssetId(
  db: SeedDbClient,
  record: TwAssetBootstrapRecord,
  createdAssetIds: Map<string, string>,
): Promise<{ assetId: string; assetCreated: boolean; assetSkipped: boolean }> {
  const pendingId = createdAssetIds.get(record.symbol)
  if (pendingId) {
    return { assetId: pendingId, assetCreated: false, assetSkipped: true }
  }

  const existing = await db.asset.findUnique({
    where: { symbol: record.symbol },
    select: { id: true },
  })
  if (existing) {
    return { assetId: existing.id, assetCreated: false, assetSkipped: true }
  }

  const created = await db.asset.create({
    data: {
      symbol: record.symbol,
      name: record.name,
      type: record.type,
      assetClass: record.assetClass,
      baseCurrency: record.baseCurrency,
    },
    select: { id: true },
  })
  createdAssetIds.set(record.symbol, created.id)
  return { assetId: created.id, assetCreated: true, assetSkipped: false }
}

async function upsertGlobalAliasesForRecord(
  db: SeedDbClient,
  record: TwAssetBootstrapRecord,
  assetId: string,
  counts: TwCatalogUpsertCounts,
): Promise<void> {
  const uniqueAliases = [...new Set(record.globalAliases)]

  for (const alias of uniqueAliases) {
    const existing = await db.assetAlias.findUnique({
      where: {
        alias_broker: {
          alias,
          broker: TW_GLOBAL_ALIAS_BROKER,
        },
      },
      select: { assetId: true },
    })

    if (!existing) {
      await db.assetAlias.create({
        data: {
          assetId,
          alias,
          broker: TW_GLOBAL_ALIAS_BROKER,
        },
      })
      counts.aliases.created += 1
      continue
    }

    if (existing.assetId === assetId) {
      counts.aliases.skippedExisting += 1
      continue
    }

    counts.aliases.conflicts += 1
    if (counts.aliases.conflictExamples.length < 5) {
      counts.aliases.conflictExamples.push({
        alias,
        existingAssetId: existing.assetId,
        expectedSymbol: record.symbol,
      })
    }
  }
}

export async function planTwCatalogUpserts(
  db: SeedDbClient,
  records: TwAssetBootstrapRecord[],
): Promise<TwCatalogUpsertCounts> {
  const counts = createEmptyUpsertCounts()
  const resolvedAssetIds = new Map<string, string>()

  for (const record of records) {
    const existing = await db.asset.findUnique({
      where: { symbol: record.symbol },
      select: { id: true },
    })

    let assetId: string
    if (existing) {
      assetId = existing.id
      counts.assets.skippedExisting += 1
      resolvedAssetIds.set(record.symbol, assetId)
    } else if (resolvedAssetIds.has(record.symbol)) {
      assetId = resolvedAssetIds.get(record.symbol)!
      counts.assets.skippedExisting += 1
    } else {
      counts.assets.created += 1
      assetId = `planned-${record.symbol}`
      resolvedAssetIds.set(record.symbol, assetId)
    }

    for (const alias of [...new Set(record.globalAliases)]) {
      const existingAlias = await db.assetAlias.findUnique({
        where: {
          alias_broker: {
            alias,
            broker: TW_GLOBAL_ALIAS_BROKER,
          },
        },
        select: { assetId: true },
      })

      if (!existingAlias) {
        counts.aliases.created += 1
        continue
      }

      if (existingAlias.assetId === assetId || existingAlias.assetId === existing?.id) {
        counts.aliases.skippedExisting += 1
        continue
      }

      counts.aliases.conflicts += 1
      if (counts.aliases.conflictExamples.length < 5) {
        counts.aliases.conflictExamples.push({
          alias,
          existingAssetId: existingAlias.assetId,
          expectedSymbol: record.symbol,
        })
      }
    }
  }

  return counts
}

function createEmptyUpsertCounts(): TwCatalogUpsertCounts {
  return {
    assets: { created: 0, skippedExisting: 0 },
    aliases: { created: 0, skippedExisting: 0, conflicts: 0, conflictExamples: [] },
  }
}

export async function applyTwCatalogUpserts(
  db: SeedDbClient,
  records: TwAssetBootstrapRecord[],
): Promise<TwCatalogUpsertCounts> {
  const counts = createEmptyUpsertCounts()
  const createdAssetIds = new Map<string, string>()

  for (const record of records) {
    const { assetId, assetCreated, assetSkipped } = await resolveAssetId(
      db,
      record,
      createdAssetIds,
    )

    if (assetCreated) {
      counts.assets.created += 1
    } else if (assetSkipped) {
      counts.assets.skippedExisting += 1
    }

    await upsertGlobalAliasesForRecord(db, record, assetId, counts)
  }

  return counts
}

export async function runTwCatalogUpsertTransaction(
  db: SeedDbClient,
  records: TwAssetBootstrapRecord[],
): Promise<TwCatalogUpsertCounts> {
  if (!('$transaction' in db) || typeof db.$transaction !== 'function') {
    return applyTwCatalogUpserts(db, records)
  }

  return db.$transaction(async (tx) => applyTwCatalogUpserts(tx, records))
}
