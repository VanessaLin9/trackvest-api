import { PrismaClient } from '@prisma/client'
import { assertProductionDemoSeedAllowed } from '../../src/deployment/seed-guards'
import { assertDemoCatalogAssetsExist } from './assert-catalog-assets'
import { DEMO_USER_EMAIL, resolveProductionDemoUserPassword } from './demo-identity'
import { seedDemoUserGraphUpsert } from './demo-user-graph-upsert'

export async function runProductionDemoSeed(prisma: PrismaClient) {
  assertProductionDemoSeedAllowed()
  resolveProductionDemoUserPassword()
  await assertDemoCatalogAssetsExist(prisma)
  await seedDemoUserGraphUpsert(prisma)

  console.log('Production demo seed completed for:', DEMO_USER_EMAIL)
}
