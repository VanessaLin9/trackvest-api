import { withEnv } from '../../src/deployment/testing/with-env'
import { SeedGuardError } from '../../src/deployment/seed-guards'
import { DEMO_USER_EMAIL, DEMO_USER_ID } from '../../prisma/seed/demo-identity'
import {
  getCatalogAssetAliasesData,
  getCatalogAssetsData,
  getDemoAccountsData,
  getDemoGlAccountsData,
  getDemoGlEntriesData,
  getDemoGlLinesData,
  getDemoPositionLotsData,
  getDemoPositionsData,
  getDemoSellLotMatchesData,
  getDemoTransactionsData,
} from '../../prisma/seed/demo-fixture-data'
import { runProductionBootstrap } from '../../prisma/seed/bootstrap-runner'
import { runProductionDemoSeed } from '../../prisma/seed/prod-demo-seed-runner'
import { runDevSeed } from '../../prisma/seed/dev-seed-runner'
import {
  createEphemeralRehearsalConfig,
  createPrismaClient,
  deployMigrations,
  dropRehearsalSchema,
  migrateStatusExitCode,
  type RehearsalDatabaseConfig,
} from '../helpers/rehearsal-db'

const REHEARSAL_PASSWORD = 'rehearsal-test-secret'
const REAL_USER_ID = '00000000-0000-4000-8000-000000000099'
const REAL_USER_EMAIL = 'real-user@example.com'

async function snapshotDemoGraphCounts(databaseUrl: string) {
  const prisma = createPrismaClient(databaseUrl)

  try {
    return {
      users: await prisma.user.count(),
      accounts: await prisma.account.count(),
      glAccounts: await prisma.glAccount.count(),
      transactions: await prisma.transaction.count(),
      positions: await prisma.position.count(),
      positionLots: await prisma.positionLot.count(),
      sellLotMatches: await prisma.sellLotMatch.count(),
      glEntries: await prisma.glEntry.count(),
      glLines: await prisma.glLine.count(),
      assets: await prisma.asset.count(),
      assetAliases: await prisma.assetAlias.count(),
      prices: await prisma.price.count(),
      fxRates: await prisma.fxRate.count(),
    }
  } finally {
    await prisma.$disconnect()
  }
}

describe('Production-like rehearsal', () => {
  let config: RehearsalDatabaseConfig

  beforeAll(() => {
    config = createEphemeralRehearsalConfig()
    deployMigrations(config.rehearsalUrl)
  })

  afterAll(async () => {
    await dropRehearsalSchema(config.adminUrl, config.schema)
  })

  it('deploys migrations and reports migrate status exit 0', () => {
    expect(migrateStatusExitCode(config.rehearsalUrl)).toBe(0)
  })

  it('refuses dev seed under NODE_ENV=production before any write', async () => {
    const prisma = createPrismaClient(config.rehearsalUrl)

    try {
      await withEnv(
        {
          NODE_ENV: 'production',
          DATABASE_URL: config.rehearsalUrl,
        },
        async () => {
          await expect(runDevSeed(prisma)).rejects.toThrow(SeedGuardError)
          expect(await prisma.user.count()).toBe(0)
        },
      )
    } finally {
      await prisma.$disconnect()
    }
  })

  it('bootstraps catalog idempotently with migrate deploy only', async () => {
    const prisma = createPrismaClient(config.rehearsalUrl)

    try {
      await withEnv({ NODE_ENV: 'production', DATABASE_URL: config.rehearsalUrl }, async () => {
        await runProductionBootstrap(prisma)
        const afterFirst = {
          assets: await prisma.asset.count(),
          assetAliases: await prisma.assetAlias.count(),
        }

        await runProductionBootstrap(prisma)
        const afterSecond = {
          assets: await prisma.asset.count(),
          assetAliases: await prisma.assetAlias.count(),
        }

        expect(afterFirst).toEqual({
          assets: getCatalogAssetsData().length,
          assetAliases: getCatalogAssetAliasesData().length,
        })
        expect(afterSecond).toEqual(afterFirst)
        expect(await prisma.price.count()).toBe(0)
        expect(await prisma.fxRate.count()).toBe(0)
      })
    } finally {
      await prisma.$disconnect()
    }
  })

  it('seeds demo graph idempotently and leaves non-demo users untouched', async () => {
    const prisma = createPrismaClient(config.rehearsalUrl)

    try {
      await withEnv(
        {
          NODE_ENV: 'production',
          DATABASE_URL: config.rehearsalUrl,
          ALLOW_PRODUCTION_DEMO_SEED: 'true',
          DEMO_USER_PASSWORD: REHEARSAL_PASSWORD,
        },
        async () => {
          await runProductionBootstrap(prisma)
          await prisma.user.create({
            data: {
              id: REAL_USER_ID,
              email: REAL_USER_EMAIL,
              passwordHash: 'existing-hash',
              role: 'user',
            },
          })

          await runProductionDemoSeed(prisma)
          const afterFirst = await snapshotDemoGraphCounts(config.rehearsalUrl)

          await runProductionDemoSeed(prisma)
          const afterSecond = await snapshotDemoGraphCounts(config.rehearsalUrl)

          expect(afterFirst).toEqual({
            users: 2,
            accounts: getDemoAccountsData(DEMO_USER_ID).length,
            glAccounts: getDemoGlAccountsData(DEMO_USER_ID).length,
            transactions: getDemoTransactionsData().length,
            positions: getDemoPositionsData().length,
            positionLots: getDemoPositionLotsData().length,
            sellLotMatches: getDemoSellLotMatchesData().length,
            glEntries: getDemoGlEntriesData(DEMO_USER_ID).length,
            glLines: getDemoGlLinesData().length,
            assets: getCatalogAssetsData().length,
            assetAliases: getCatalogAssetAliasesData().length,
            prices: 0,
            fxRates: 0,
          })
          expect(afterSecond).toEqual(afterFirst)

          const demoUser = await prisma.user.findUnique({ where: { id: DEMO_USER_ID } })
          const realUser = await prisma.user.findUnique({ where: { id: REAL_USER_ID } })

          expect(demoUser?.email).toBe(DEMO_USER_EMAIL)
          expect(realUser?.email).toBe(REAL_USER_EMAIL)
          expect(realUser?.passwordHash).toBe('existing-hash')
        },
      )
    } finally {
      await prisma.$disconnect()
    }
  })
})
