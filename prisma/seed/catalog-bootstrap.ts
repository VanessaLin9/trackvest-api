import { PrismaClient } from '@prisma/client'
import { getCatalogAssetAliasesData, getCatalogAssetsData } from './demo-fixture-data'

/**
 * Idempotent production bootstrap for shared catalog fixtures.
 * Seeds Asset + AssetAlias only — not Price, FxRate, or demo-user data.
 */
export async function seedProductionCatalogBootstrap(prisma: PrismaClient) {
  for (const asset of getCatalogAssetsData()) {
    const { id, ...fields } = asset
    await prisma.asset.upsert({
      where: { id },
      create: asset,
      update: fields,
    })
  }

  for (const alias of getCatalogAssetAliasesData()) {
    await prisma.assetAlias.upsert({
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
