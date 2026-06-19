import { PrismaClient } from '@prisma/client'
import { withEnv } from './testing/with-env'
import { SeedGuardError } from './seed-guards'
import { runDevSeed } from '../../prisma/seed/dev-seed-runner'
import { runProductionDemoSeed } from '../../prisma/seed/prod-demo-seed-runner'

function createMockPrisma() {
  const prisma = {
    glLine: { deleteMany: jest.fn(), upsert: jest.fn() },
    glEntry: { deleteMany: jest.fn(), upsert: jest.fn() },
    corporateActionApplication: { deleteMany: jest.fn() },
    corporateAction: { deleteMany: jest.fn() },
    sellLotMatch: { deleteMany: jest.fn(), upsert: jest.fn() },
    positionLot: { deleteMany: jest.fn(), upsert: jest.fn() },
    position: { deleteMany: jest.fn(), upsert: jest.fn() },
    txTag: { deleteMany: jest.fn() },
    tag: { deleteMany: jest.fn() },
    transaction: { deleteMany: jest.fn(), upsert: jest.fn() },
    price: { deleteMany: jest.fn() },
    fxRate: { deleteMany: jest.fn() },
    assetAlias: { deleteMany: jest.fn() },
    glAccount: { deleteMany: jest.fn(), upsert: jest.fn() },
    account: { deleteMany: jest.fn(), upsert: jest.fn() },
    asset: { deleteMany: jest.fn(), findMany: jest.fn() },
    user: { deleteMany: jest.fn(), create: jest.fn(), upsert: jest.fn() },
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
    ;(prisma.asset.findMany as jest.Mock).mockResolvedValue([])

    await withEnv({ ALLOW_PRODUCTION_DEMO_SEED: undefined }, async () => {
      await expect(runProductionDemoSeed(prisma)).rejects.toThrow(SeedGuardError)
      expect(prisma.asset.findMany).not.toHaveBeenCalled()
      expect(prisma.user.upsert).not.toHaveBeenCalled()
    })
  })
})
