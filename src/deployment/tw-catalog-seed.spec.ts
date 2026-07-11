import { PrismaClient } from '@prisma/client'
import { createTwCatalogFetchMock } from '../assets/tw-catalog-bootstrap/tw-catalog-bootstrap.fixtures'
import { TwCatalogBootstrapError } from '../assets/tw-catalog-bootstrap/tw-catalog-bootstrap.error'
import { runTwCatalogBootstrapSeed } from '../../prisma/seed/tw-catalog-bootstrap-runner'
import { runProductionBootstrap } from '../../prisma/seed/bootstrap-runner'
import { seedProductionCatalogBootstrap } from '../../prisma/seed/catalog-bootstrap'

jest.mock('../../prisma/seed/catalog-bootstrap', () => ({
  seedProductionCatalogBootstrap: jest.fn().mockResolvedValue(undefined),
}))

function createMockPrisma() {
  const assets = new Map<string, { id: string; symbol: string }>()
  const aliases = new Map<string, { assetId: string; alias: string; broker: string }>()
  let nextAssetId = 1
  let nextAliasId = 1

  const prisma = {
    asset: {
      findUnique: jest.fn(async ({ where }: { where: { symbol?: string; id?: string } }) => {
        for (const asset of assets.values()) {
          if (where.symbol && asset.symbol === where.symbol) {
            return { id: asset.id }
          }
          if (where.id && asset.id === where.id) {
            return { id: asset.id, symbol: asset.symbol }
          }
        }
        return null
      }),
      findMany: jest.fn(async () => [...assets.values()]),
      create: jest.fn(async ({ data }: { data: { symbol: string } }) => {
        const id = `asset-${nextAssetId++}`
        assets.set(id, { id, symbol: data.symbol })
        return { id }
      }),
      upsert: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    assetAlias: {
      findUnique: jest.fn(async ({ where }: { where: { alias_broker: { alias: string; broker: string } } }) => {
        for (const alias of aliases.values()) {
          if (
            alias.alias === where.alias_broker.alias
            && alias.broker === where.alias_broker.broker
          ) {
            return { assetId: alias.assetId }
          }
        }
        return null
      }),
      create: jest.fn(async ({ data }: { data: { assetId: string; alias: string; broker: string } }) => {
        const id = `alias-${nextAliasId++}`
        aliases.set(id, data)
        return { id, ...data }
      }),
      upsert: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  }

  return prisma as unknown as PrismaClient
}

describe('tw-catalog seed orchestration', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('runs TW bootstrap through the shared seed runner with mocked sources', async () => {
    const fetchMock = createTwCatalogFetchMock()
    const prisma = createMockPrisma()

    const summary = await runTwCatalogBootstrapSeed(prisma, {
      fetchOptions: { fetchFn: fetchMock as unknown as typeof fetch },
    })

    expect(summary.upsert?.assets.created).toBeGreaterThan(0)
    expect(prisma.asset.create).toHaveBeenCalled()
    fetchMock.mockRestore()
  })

  it('fails clearly when TW sources are unavailable before writes', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => [],
    } as Response)
    const prisma = createMockPrisma()

    await expect(runTwCatalogBootstrapSeed(prisma)).rejects.toThrow(
      /Run standalone retry: pnpm assets:bootstrap:tw/,
    )
    expect(prisma.asset.create).not.toHaveBeenCalled()

    fetchMock.mockRestore()
  })

  it('is safe to rerun TW bootstrap seed on the same database state', async () => {
    const fetchMock = createTwCatalogFetchMock()
    const prisma = createMockPrisma()

    await runTwCatalogBootstrapSeed(prisma, {
      fetchOptions: { fetchFn: fetchMock as unknown as typeof fetch },
    })
    const createCallsAfterFirst = (prisma.asset.create as jest.Mock).mock.calls.length

    await runTwCatalogBootstrapSeed(prisma, {
      fetchOptions: { fetchFn: fetchMock as unknown as typeof fetch },
    })

    expect((prisma.asset.create as jest.Mock).mock.calls.length).toBe(createCallsAfterFirst)
    fetchMock.mockRestore()
  })

  it('production bootstrap invokes TW bootstrap after catalog fixtures', async () => {
    const prisma = createMockPrisma()
    const twSpy = jest
      .spyOn(await import('../../prisma/seed/tw-catalog-bootstrap-runner'), 'runTwCatalogBootstrapSeed')
      .mockResolvedValue({
        dryRun: false,
        startedAt: new Date().toISOString(),
        durationMs: 1,
        sources: {
          twse_listed_stock: { fetched: 0, valid: 0, filtered: 0 },
          tpex_otc_stock: { fetched: 0, valid: 0, filtered: 0 },
          twse_listed_etf: { fetched: 0, valid: 0, filtered: 0 },
        },
        records: {
          totalValid: 0,
          uniqueSymbols: 0,
          duplicateSymbols: 0,
          byType: { equity: 0, etf: 0 },
          byAssetClass: { equity: 0, bond: 0 },
        },
        wouldCreateAssets: 0,
        wouldCreateAliases: 0,
        sampleRecords: [],
        skippedExamples: [],
        symbolConflicts: [],
      })

    await runProductionBootstrap(prisma)

    expect(seedProductionCatalogBootstrap).toHaveBeenCalledWith(prisma)
    expect(twSpy).toHaveBeenCalledWith(prisma)
    expect(twSpy.mock.invocationCallOrder[0]).toBeGreaterThan(
      (seedProductionCatalogBootstrap as jest.Mock).mock.invocationCallOrder[0],
    )

    twSpy.mockRestore()
  })
})
