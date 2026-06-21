import { PrismaClient } from '@prisma/client'
import { seedProductionCatalogBootstrap } from './catalog-bootstrap'

/** Idempotent production bootstrap for shared system catalog defaults. */
export async function runProductionBootstrap(prisma: PrismaClient) {
  await seedProductionCatalogBootstrap(prisma)
  console.log('Production bootstrap completed: catalog assets and aliases upserted.')
}
