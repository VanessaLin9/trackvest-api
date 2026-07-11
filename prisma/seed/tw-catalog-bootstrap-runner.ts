import { PrismaClient } from '@prisma/client'
import { TwCatalogBootstrapError } from '../../src/assets/tw-catalog-bootstrap/tw-catalog-bootstrap.error'
import type { TwCatalogFetchOptions } from '../../src/assets/tw-catalog-bootstrap/tw-catalog-fetch'
import { runTwCatalogBootstrapPipeline } from '../../src/assets/tw-catalog-bootstrap/tw-catalog-pipeline'
import type { TwCatalogBootstrapSummary } from '../../src/assets/tw-catalog-bootstrap/tw-catalog-bootstrap.types'

export type TwCatalogBootstrapSeedOptions = {
  dryRun?: boolean
  fetchOptions?: TwCatalogFetchOptions
}

export async function runTwCatalogBootstrapSeed(
  prisma: PrismaClient,
  options: TwCatalogBootstrapSeedOptions = {},
): Promise<TwCatalogBootstrapSummary> {
  try {
    const summary = await runTwCatalogBootstrapPipeline({
      dryRun: options.dryRun ?? false,
      fetchOptions: options.fetchOptions,
      db: prisma,
    })

    const upsert = summary.upsert
    console.log(
      `TW catalog bootstrap: assets created=${upsert?.assets.created ?? 0}, ` +
        `assets skipped=${upsert?.assets.skippedExisting ?? 0}, ` +
        `aliases created=${upsert?.aliases.created ?? 0}, ` +
        `alias conflicts=${upsert?.aliases.conflicts ?? 0}`,
    )

    return summary
  } catch (error) {
    if (error instanceof TwCatalogBootstrapError) {
      throw new Error(`${error.message} Run standalone retry: pnpm assets:bootstrap:tw`)
    }
    throw error
  }
}
