import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'
import { withEnv } from './testing/with-env'
import { SeedGuardError } from './seed-guards'
import { assertCatalogBootstrapSafeForUpsert } from '../../prisma/seed/catalog-bootstrap'
import { assertDemoOwnershipGraphSafeForUpsert } from '../../prisma/seed/assert-demo-ownership-safe'
import { runProductionBootstrap } from '../../prisma/seed/bootstrap-runner'
import { getCatalogAssetsData } from '../../prisma/seed/demo-fixture-data'
import {
  ASSET_IDS,
  BANK_ACCOUNT_ID,
  BROKER_ACCOUNT_ID,
  DEMO_CATALOG_ASSET_IDS,
  DEMO_USER_EMAIL,
  DEMO_USER_ID,
  GL_ACCOUNT_IDS,
  resolveProductionDemoUserPassword,
} from '../../prisma/seed/demo-identity'
import { resolveDemoUserPasswordHash } from '../../prisma/seed/demo-user-password'
import { seedDemoUserGraphUpsert } from '../../prisma/seed/demo-user-graph-upsert'
import {
  GL_ENTRY_IDS,
  POSITION_IDS,
  TRANSACTION_IDS,
} from '../../prisma/seed/demo-fixture-data'
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
    assetAlias: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    glAccount: { deleteMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), createMany: jest.fn() },
    account: { deleteMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), createMany: jest.fn() },
    asset: { deleteMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), createMany: jest.fn(), upsert: jest.fn() },
    user: { deleteMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  }

  for (const model of Object.values(prisma)) {
    if (typeof model === 'object' && model !== null && 'findUnique' in model) {
      ;(model.findUnique as jest.Mock).mockResolvedValue(null)
    }
  }

  ;(prisma.$transaction as jest.Mock).mockImplementation(
    async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma),
  )

  return prisma as unknown as PrismaClient
}

describe('seed entry points', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('refuses dev seed in production before any Prisma write', async () => {
    const prisma = createMockPrisma()

    await withEnv(
      {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://trackvest:trackvest@localhost:5433/trackvest?schema=public',
      },
      async () => {
        await expect(runDevSeed(prisma)).rejects.toThrow(SeedGuardError)
        expect(prisma.user.deleteMany).not.toHaveBeenCalled()
        expect(prisma.user.create).not.toHaveBeenCalled()
        expect(prisma.asset.deleteMany).not.toHaveBeenCalled()
      },
    )
  })

  it('refuses dev seed against remote DATABASE_URL before any Prisma write', async () => {
    const prisma = createMockPrisma()

    await withEnv(
      {
        NODE_ENV: undefined,
        DATABASE_URL: 'postgresql://trackvest:trackvest@db.example.com:5432/trackvest?schema=public',
      },
      async () => {
        await expect(runDevSeed(prisma)).rejects.toThrow(SeedGuardError)
        expect(prisma.user.deleteMany).not.toHaveBeenCalled()
        expect(prisma.user.create).not.toHaveBeenCalled()
        expect(prisma.asset.deleteMany).not.toHaveBeenCalled()
      },
    )
  })

  it('refuses production demo seed without ALLOW_PRODUCTION_DEMO_SEED=true', async () => {
    const prisma = createMockPrisma()

    await withEnv({ ALLOW_PRODUCTION_DEMO_SEED: undefined, DEMO_USER_PASSWORD: 'prod-secret' }, async () => {
      await expect(runProductionDemoSeed(prisma)).rejects.toThrow(SeedGuardError)
      expect(prisma.asset.findMany).not.toHaveBeenCalled()
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  it('refuses production demo seed without DEMO_USER_PASSWORD', async () => {
    const prisma = createMockPrisma()

    await withEnv(
      { ALLOW_PRODUCTION_DEMO_SEED: 'true', DEMO_USER_PASSWORD: undefined },
      async () => {
        await expect(runProductionDemoSeed(prisma)).rejects.toThrow(SeedGuardError)
        expect(prisma.asset.findMany).not.toHaveBeenCalled()
        expect(prisma.$transaction).not.toHaveBeenCalled()
      },
    )
  })

  it('runs production demo seed inside one transaction when guards pass', async () => {
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

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.user.upsert).toHaveBeenCalled()
    expect(prisma.account.upsert).toHaveBeenCalled()
  })

  it('writes zero demo rows when account ownership collision is detected', async () => {
    const prisma = createMockPrisma()
    ;(prisma.account.findUnique as jest.Mock).mockResolvedValue({
      id: BANK_ACCOUNT_ID,
      userId: '00000000-0000-4000-8000-000000000099',
    })

    await withEnv({ DEMO_USER_PASSWORD: 'prod-secret' }, async () => {
      await expect(seedDemoUserGraphUpsert(prisma)).rejects.toThrow(/account .* belongs to user/)
    })

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.user.upsert).not.toHaveBeenCalled()
  })

  it('writes zero demo rows when transaction ownership collision is detected', async () => {
    const prisma = createMockPrisma()
    ;(prisma.transaction.findUnique as jest.Mock).mockResolvedValue({
      id: TRANSACTION_IDS.depositBroker,
      account: { userId: '00000000-0000-4000-8000-000000000099' },
    })

    await withEnv({ DEMO_USER_PASSWORD: 'prod-secret' }, async () => {
      await expect(seedDemoUserGraphUpsert(prisma)).rejects.toThrow(/transaction/)
    })

    expect(prisma.user.upsert).not.toHaveBeenCalled()
  })

  it('writes zero demo rows when position ownership collision is detected', async () => {
    const prisma = createMockPrisma()
    ;(prisma.position.findUnique as jest.Mock).mockResolvedValue({
      id: POSITION_IDS.tsmc,
      account: { userId: '00000000-0000-4000-8000-000000000099' },
    })

    await withEnv({ DEMO_USER_PASSWORD: 'prod-secret' }, async () => {
      await expect(seedDemoUserGraphUpsert(prisma)).rejects.toThrow(/position/)
    })

    expect(prisma.user.upsert).not.toHaveBeenCalled()
  })

  it('writes zero demo rows when GL entry ownership collision is detected', async () => {
    const prisma = createMockPrisma()
    ;(prisma.glEntry.findUnique as jest.Mock).mockResolvedValue({
      id: GL_ENTRY_IDS.depositBroker,
      userId: '00000000-0000-4000-8000-000000000099',
    })

    await withEnv({ DEMO_USER_PASSWORD: 'prod-secret' }, async () => {
      await expect(seedDemoUserGraphUpsert(prisma)).rejects.toThrow(/GL entry/)
    })

    expect(prisma.user.upsert).not.toHaveBeenCalled()
  })

  it('writes zero demo rows when GL account ownership collision is detected', async () => {
    const prisma = createMockPrisma()
    ;(prisma.glAccount.findUnique as jest.Mock).mockResolvedValue({
      id: GL_ACCOUNT_IDS.bankCash,
      userId: '00000000-0000-4000-8000-000000000099',
    })

    await withEnv({ DEMO_USER_PASSWORD: 'prod-secret' }, async () => {
      await expect(seedDemoUserGraphUpsert(prisma)).rejects.toThrow(/GL account/)
    })

    expect(prisma.user.upsert).not.toHaveBeenCalled()
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

  it('refuses catalog bootstrap when asset id exists with a different symbol', async () => {
    const prisma = createMockPrisma()
    const catalogAsset = getCatalogAssetsData()[0]
    ;(prisma.asset.findUnique as jest.Mock).mockImplementation(({ where }) => {
      if ('id' in where && where.id === catalogAsset.id) {
        return Promise.resolve({ id: catalogAsset.id, symbol: 'WRONG' })
      }
      return Promise.resolve(null)
    })

    await expect(assertCatalogBootstrapSafeForUpsert(prisma)).rejects.toThrow(/asset id/)
    expect(prisma.asset.upsert).not.toHaveBeenCalled()
    expect(prisma.assetAlias.upsert).not.toHaveBeenCalled()
  })

  it('refuses catalog bootstrap when symbol exists with a different asset id', async () => {
    const prisma = createMockPrisma()
    const catalogAsset = getCatalogAssetsData()[0]
    ;(prisma.asset.findUnique as jest.Mock).mockImplementation(({ where }) => {
      if ('symbol' in where && where.symbol === catalogAsset.symbol) {
        return Promise.resolve({ id: '00000000-0000-4000-8000-000000000099', symbol: catalogAsset.symbol })
      }
      return Promise.resolve(null)
    })

    await expect(assertCatalogBootstrapSafeForUpsert(prisma)).rejects.toThrow(/symbol/)
    expect(prisma.asset.upsert).not.toHaveBeenCalled()
  })

  it('refuses catalog bootstrap when alias points to a different asset', async () => {
    const prisma = createMockPrisma()
    ;(prisma.assetAlias.findUnique as jest.Mock).mockResolvedValue({
      assetId: '00000000-0000-4000-8000-000000000099',
      alias: '台積電',
      broker: '',
    })

    await expect(assertCatalogBootstrapSafeForUpsert(prisma)).rejects.toThrow(/alias/)
    expect(prisma.asset.upsert).not.toHaveBeenCalled()
    expect(prisma.assetAlias.upsert).not.toHaveBeenCalled()
  })

  it('runs bootstrap catalog preflight and upserts inside one transaction', async () => {
    const prisma = createMockPrisma()

    await runProductionBootstrap(prisma)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.asset.upsert).toHaveBeenCalled()
    expect(prisma.assetAlias.upsert).toHaveBeenCalled()
  })

  it('does not write demo graph rows when upsert fails inside the transaction', async () => {
    const prisma = createMockPrisma()
    ;(prisma.account.upsert as jest.Mock).mockRejectedValue(new Error('write failed'))

    await withEnv({ DEMO_USER_PASSWORD: 'prod-secret' }, async () => {
      await expect(seedDemoUserGraphUpsert(prisma)).rejects.toThrow('write failed')
    })

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.user.upsert).toHaveBeenCalled()
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

  it('rejects known dev-only default passwords', async () => {
    await withEnv({ DEMO_USER_PASSWORD: 'demo-password' }, () => {
      expect(() => resolveProductionDemoUserPassword()).toThrow(/dev-only default/)
    })
  })

  it('returns trimmed DEMO_USER_PASSWORD when set', async () => {
    await withEnv({ DEMO_USER_PASSWORD: '  prod-secret  ' }, () => {
      expect(resolveProductionDemoUserPassword()).toBe('prod-secret')
    })
  })
})

describe('resolveDemoUserPasswordHash', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('reuses existing hash when the secret is unchanged', async () => {
    const db = createMockPrisma()
    const existingHash = '$2b$10$existinghashvalue'
    ;(db.user.findUnique as jest.Mock).mockResolvedValue({ passwordHash: existingHash })

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)
    const hashSpy = jest.spyOn(bcrypt, 'hash')

    const result = await resolveDemoUserPasswordHash(db, 'prod-secret')

    expect(result).toBe(existingHash)
    expect(hashSpy).not.toHaveBeenCalled()
  })

  it('hashes a new secret when the existing hash does not match', async () => {
    const db = createMockPrisma()
    ;(db.user.findUnique as jest.Mock).mockResolvedValue({
      passwordHash: '$2b$10$oldhashvalue',
    })

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2b$10$newhashvalue' as never)

    const result = await resolveDemoUserPasswordHash(db, 'rotated-secret')

    expect(result).toBe('$2b$10$newhashvalue')
    expect(bcrypt.hash).toHaveBeenCalledWith('rotated-secret', expect.any(Number))
  })

  it('keeps the same hash on two prod-demo runs with the same secret', async () => {
    const prisma = createMockPrisma()
    ;(prisma.asset.findMany as jest.Mock).mockResolvedValue(
      DEMO_CATALOG_ASSET_IDS.map((id) => ({ id })),
    )

    const existingHash = '$2b$10$stablehashvalue'
    ;(prisma.user.findUnique as jest.Mock).mockImplementation(({ where, select }) => {
      if ('id' in where && where.id === DEMO_USER_ID) {
        if (select?.passwordHash) {
          return Promise.resolve({ passwordHash: existingHash })
        }
        return Promise.resolve({
          id: DEMO_USER_ID,
          email: DEMO_USER_EMAIL,
          role: 'user',
        })
      }
      if ('email' in where && where.email === DEMO_USER_EMAIL) {
        return Promise.resolve(null)
      }
      return Promise.resolve(null)
    })

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)
    const hashSpy = jest.spyOn(bcrypt, 'hash')
    hashSpy.mockClear()

    await withEnv(
      { ALLOW_PRODUCTION_DEMO_SEED: 'true', DEMO_USER_PASSWORD: 'prod-secret' },
      async () => {
        await seedDemoUserGraphUpsert(prisma)
        await seedDemoUserGraphUpsert(prisma)
      },
    )

    expect(hashSpy).not.toHaveBeenCalled()
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ passwordHash: existingHash }),
      }),
    )
  })
})
