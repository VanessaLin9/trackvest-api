import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { assertDevSeedAllowed } from '../../src/deployment/seed-guards'
import {
  BCRYPT_ROUNDS,
  DEMO_USER_EMAIL,
  DEMO_USER_ID,
  resolveDemoUserPassword,
} from './demo-identity'
import {
  getCatalogAssetAliasesData,
  getCatalogAssetsData,
  getCatalogFxRatesData,
  getCatalogPricesData,
  getDemoAccountsData,
  getDemoGlAccountsData,
  getDemoGlEntriesData,
  getDemoGlLinesData,
  getDemoPositionLotsData,
  getDemoPositionsData,
  getDemoSellLotMatchesData,
  getDemoTransactionsData,
} from './demo-fixture-data'

export async function wipeAllData(prisma: PrismaClient) {
  await prisma.glLine.deleteMany()
  await prisma.glEntry.deleteMany()
  await prisma.corporateActionApplication.deleteMany()
  await prisma.corporateAction.deleteMany()
  await prisma.sellLotMatch.deleteMany()
  await prisma.positionLot.deleteMany()
  await prisma.position.deleteMany()
  await prisma.txTag.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.price.deleteMany()
  await prisma.fxRate.deleteMany()
  await prisma.assetAlias.deleteMany()
  await prisma.glAccount.deleteMany()
  await prisma.account.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.user.deleteMany()
}

/** Dev-only global catalog: Asset, AssetAlias, Price, FxRate. */
export async function seedGlobalCatalog(prisma: PrismaClient) {
  await prisma.asset.createMany({ data: getCatalogAssetsData() })
  await prisma.assetAlias.createMany({ data: getCatalogAssetAliasesData() })
  await prisma.price.createMany({ data: getCatalogPricesData() })
  await prisma.fxRate.createMany({ data: getCatalogFxRatesData() })
}

async function seedDemoUserGraphCreate(prisma: PrismaClient) {
  const demoPassword = resolveDemoUserPassword()
  const demoPasswordHash = await bcrypt.hash(demoPassword, BCRYPT_ROUNDS)

  await prisma.user.create({
    data: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      passwordHash: demoPasswordHash,
    },
  })

  console.log(`Seeded demo user ${DEMO_USER_EMAIL} (password: ${demoPassword})`)

  await prisma.account.createMany({ data: getDemoAccountsData(DEMO_USER_ID) })
  await prisma.glAccount.createMany({ data: getDemoGlAccountsData(DEMO_USER_ID) })
  await prisma.transaction.createMany({ data: getDemoTransactionsData() })
  await prisma.position.createMany({ data: getDemoPositionsData() })
  await prisma.positionLot.createMany({ data: getDemoPositionLotsData() })
  await prisma.sellLotMatch.createMany({ data: getDemoSellLotMatchesData() })
  await prisma.glEntry.createMany({ data: getDemoGlEntriesData(DEMO_USER_ID) })
  await prisma.glLine.createMany({ data: getDemoGlLinesData() })
}

export async function runDevSeed(prisma: PrismaClient) {
  assertDevSeedAllowed()
  await wipeAllData(prisma)
  await seedGlobalCatalog(prisma)
  await seedDemoUserGraphCreate(prisma)

  console.log('Seed completed successfully for demo user:', DEMO_USER_EMAIL)
  console.log(
    '0050 fixture: user-entered txs 100/50/80/40/20; seeded ledger is pre-split-sync baseline (50 open shares).',
  )
  console.log(
    'Run `pnpm corp-actions:sync-splits tw` then `pnpm corp-actions:verify-0050` for 260-share acceptance.',
  )
  console.log(
    'Demo TW holdings use share quantity (股), not 張. Re-run seed after FinMind sync if demo prices drift.',
  )
}
