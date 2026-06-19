import { PrismaClient } from '@prisma/client'
import { withEnv } from './testing/with-env'
import { SeedGuardError } from './seed-guards'
import { assertDemoOwnershipGraphSafeForUpsert } from '../../prisma/seed/assert-demo-ownership-safe'
import { runProductionBootstrap } from '../../prisma/seed/bootstrap-runner'
import {
  DEMO_CATALOG_ASSET_IDS,
  DEMO_USER_EMAIL,
  DEMO_USER_ID,
  resolveProductionDemoUserPassword,
} from '../../prisma/seed/demo-identity'
import { runDevSeed } from '../../prisma/seed/dev-seed-runner'
import { runProductionDemoSeed } from '../../prisma/seed/prod-demo-seed-runner'

function createMockPrisma() {
  const prisma = {
    glLine: { deleteMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    glEntry: { deleteMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    corporateActionApplication: { deleteMany: jest.fn() },
    corporateAction: { deleteMany: jest.fn() },
    sellLotMatch: { deleteMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    positionLot: { deleteMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    position: { deleteMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    txTag: { deleteMany: jest.fn() },
    tag: { deleteMany: jest.fn() },
    transaction: { deleteMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    price: { deleteMany: jest.fn(), createMany: jest.fn() },
    fxRate: { deleteMany: jest.fn(), createMany: jest.fn() },
    assetAlias: { deleteMany: jest.fn(), createMany: jest.fn(), upsert: jest.fn() },
    glAccount: { deleteMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), createMany: jest.fn() },
    account: { deleteMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), createMany: jest.fn() },
    asset: { deleteMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), createMany: jest.fn(), upsert: jest.fn() },
    user: { deleteMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
  }

  for (const model of Object.values(prisma)) {
    if ('findUnique' in model) {
      ;(model.findUnique as jest.Mock).mockResolvedValue(null)
    }
  }

  return prisma as unknown as PrismaClient
}

describe('seed entry points', () => {
  it('refuses dev seed in production before any Prisma write', async () => {
    const prisma = createMockPrisma()

    await withEnv({ NODE_ENV: 'production' }, async () => {
      await expect(runDevSeed(prisma)).rejects.toThrow(SeedGuardError)
      expect(prisma.user.deleteMany).not.toHaveBeenCalled()
      expect(prisma.user.create).not.toHaveBeenCalled()
      expect(prisma.asset.deleteMany).not.toHaveBeenCalled()
    })
  })

  it('refuses production demo seed without ALLOW_PRODUCTION_DEMO_SEED=true', async () => {
    const prisma = createMockPrisma()

    await withEnv({ ALLOW_PRODUCTION_DEMO_SEED: undefined, DEMO_USER_PASSWORD: 'prod-secret' }, async () => {
      await expect(runProductionDemoSeed(prisma)).rejects.toThrow(SeedGuardError)
      expect(prisma.asset.findMany).not.toHaveBeenCalled()
      expect(prisma.user.upsert).not.toHaveBeenCalled()
    })
  })

  it('refuses production demo seed without DEMO_USER_PASSWORD', async () => {
    const prisma = createMockPrisma()

    await withEnv(
      { ALLOW_PRODUCTION_DEMO_SEED: 'true', DEMO_USER_PASSWORD: undefined },
      async () => {
        await expect(runProductionDemoSeed(prisma)).rejects.toThrow(SeedGuardError)
        expect(prisma.asset.findMany).not.toHaveBeenCalled()
        expect(prisma.user.upsert).not.toHaveBeenCalled()
      },
    )
  })

  it('runs production demo seed when guards pass and catalog assets exist', async () => {
    const prisma = createMockPrisma()
    ;(prisma.asset.findMany as jest.Mock).mockResolvedValue(
      DEMO_CATALOG_ASSET_IDS.map((id) => ({ id })),
    )

    await withEnv(
      { ALLOW_PRODUCTION_DEMO_SEED: 'true', DEMO_USER_PASSWORD: 'prod-secret' },
      async () => {
        await runProductionDemoSeed(prisma)
      },
    )

    expect(prisma.user.upsert).toHaveBeenCalled()
    expect(prisma.account.upsert).toHaveBeenCalled()
    expect(prisma.transaction.upsert).toHaveBeenCalled()
  })

  it('refuses production demo upsert when demo user id belongs to another email', async () => {
    const prisma = createMockPrisma()
    ;(prisma.user.findUnique as jest.Mock).mockImplementation(({ where }) => {
      if ('id' in where && where.id === DEMO_USER_ID) {
        return Promise.resolve({
          id: DEMO_USER_ID,
          email: 'real-user@example.com',
          role: 'user',
        })
      }
      return Promise.resolve(null)
    })

    await expect(assertDemoOwnershipGraphSafeForUpsert(prisma)).rejects.toThrow(
      /Will not overwrite a real user/,
    )
    expect(prisma.user.upsert).not.toHaveBeenCalled()
  })

  it('refuses production demo upsert when demo email belongs to another user id', async () => {
    const prisma = createMockPrisma()
    ;(prisma.user.findUnique as jest.Mock).mockImplementation(({ where }) => {
      if ('email' in where && where.email === DEMO_USER_EMAIL) {
        return Promise.resolve({
          id: '00000000-0000-4000-8000-000000000099',
          email: DEMO_USER_EMAIL,
          role: 'user',
        })
      }
      return Promise.resolve(null)
    })

    await expect(assertDemoOwnershipGraphSafeForUpsert(prisma)).rejects.toThrow(
      /email demo@trackvest.local belongs to user/,
    )
  })

  it('bootstrap upserts shared catalog assets and aliases', async () => {
    const prisma = createMockPrisma()

    await runProductionBootstrap(prisma)

    expect(prisma.asset.upsert).toHaveBeenCalled()
    expect(prisma.assetAlias.upsert).toHaveBeenCalled()
    expect(prisma.user.upsert).not.toHaveBeenCalled()
  })
})

describe('resolveProductionDemoUserPassword', () => {
  it('requires a non-empty DEMO_USER_PASSWORD', async () => {
    await withEnv({ DEMO_USER_PASSWORD: undefined }, () => {
      expect(() => resolveProductionDemoUserPassword()).toThrow(SeedGuardError)
    })

    await withEnv({ DEMO_USER_PASSWORD: '   ' }, () => {
      expect(() => resolveProductionDemoUserPassword()).toThrow(SeedGuardError)
    })
  })

  it('returns trimmed DEMO_USER_PASSWORD when set', async () => {
    await withEnv({ DEMO_USER_PASSWORD: '  prod-secret  ' }, () => {
      expect(resolveProductionDemoUserPassword()).toBe('prod-secret')
    })
  })
})
