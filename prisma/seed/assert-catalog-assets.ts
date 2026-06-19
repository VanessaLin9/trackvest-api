import { PrismaClient } from '@prisma/client'
import { SeedGuardError } from '../../src/deployment/seed-guards'
import { ASSET_IDS, DEMO_CATALOG_ASSET_IDS } from './demo-identity'

/** Production demo seed assumes catalog assets already exist — it does not seed globals. */
export async function assertDemoCatalogAssetsExist(prisma: PrismaClient) {
  const found = await prisma.asset.findMany({
    where: { id: { in: DEMO_CATALOG_ASSET_IDS } },
    select: { id: true },
  })

  const foundIds = new Set(found.map((row) => row.id))
  const missing = DEMO_CATALOG_ASSET_IDS.filter((id) => !foundIds.has(id))

  if (missing.length > 0) {
    throw new SeedGuardError(
      `Production demo seed requires catalog assets to exist: ${missing.join(', ')}. ` +
        'Global fixtures are not seeded by db:seed:prod-demo. ' +
        'Load catalog via bootstrap or another approved path before prod-demo seed.',
    )
  }

  return ASSET_IDS
}
