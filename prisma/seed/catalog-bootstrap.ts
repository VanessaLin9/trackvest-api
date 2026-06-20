import { PrismaClient } from '@prisma/client'
import { SeedGuardError } from '../../src/deployment/seed-guards'
import { getCatalogAssetAliasesData, getCatalogAssetsData } from './demo-fixture-data'
import type { SeedDbClient } from './seed-db-client'

function refuse(message: string): never {
  throw new SeedGuardError(message)
}

/** Preflight only — no writes. Refuses catalog collisions before bootstrap upserts. */
export async function assertCatalogBootstrapSafeForUpsert(db: SeedDbClient) {
  for (const catalogAsset of getCatalogAssetsData()) {
    const byId = await db.asset.findUnique({
      where: { id: catalogAsset.id },
      select: { id: true, symbol: true },
    })
    if (byId && byId.symbol !== catalogAsset.symbol) {
      refuse(
        `Production bootstrap refused: asset id ${catalogAsset.id} exists with symbol ${byId.symbol}, ` +
          `expected ${catalogAsset.symbol}. Will not overwrite catalog.`,
      )
    }

    const bySymbol = await db.asset.findUnique({
      where: { symbol: catalogAsset.symbol },
      select: { id: true, symbol: true },
    })
    if (bySymbol && bySymbol.id !== catalogAsset.id) {
      refuse(
        `Production bootstrap refused: symbol ${catalogAsset.symbol} belongs to asset ${bySymbol.id}, ` +
          `expected ${catalogAsset.id}. Will not overwrite catalog.`,
      )
    }
  }

  for (const catalogAlias of getCatalogAssetAliasesData()) {
    const existing = await db.assetAlias.findUnique({
      where: {
        alias_broker: {
          alias: catalogAlias.alias,
          broker: catalogAlias.broker,
        },
      },
      select: { assetId: true, alias: true, broker: true },
    })
    if (existing && existing.assetId !== catalogAlias.assetId) {
      refuse(
        `Production bootstrap refused: alias "${catalogAlias.alias}" (broker=${catalogAlias.broker || "''"}) ` +
          `points to asset ${existing.assetId}, expected ${catalogAlias.assetId}. Will not overwrite catalog.`,
      )
    }
  }
}

async function upsertCatalogBootstrapWrites(db: SeedDbClient) {
  for (const asset of getCatalogAssetsData()) {
    const { id, ...fields } = asset
    await db.asset.upsert({
      where: { id },
      create: asset,
      update: fields,
    })
  }

  for (const alias of getCatalogAssetAliasesData()) {
    await db.assetAlias.upsert({
      where: {
        alias_broker: {
          alias: alias.alias,
          broker: alias.broker,
        },
      },
      create: alias,
      update: { assetId: alias.assetId },
    })
  }
}

/**
 * Idempotent production bootstrap for shared catalog fixtures.
 * Preflight + upserts run in one interactive transaction.
 */
export async function seedProductionCatalogBootstrap(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    await assertCatalogBootstrapSafeForUpsert(tx)
    await upsertCatalogBootstrapWrites(tx)
  })
}
