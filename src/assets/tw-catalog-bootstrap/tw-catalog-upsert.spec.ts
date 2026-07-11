import { PrismaClient } from '@prisma/client'
import type { TwAssetBootstrapRecord } from './tw-catalog-bootstrap.types'
import {
  applyTwCatalogUpserts,
  planTwCatalogUpserts,
  runTwCatalogUpsertTransaction,
  TW_GLOBAL_ALIAS_BROKER,
} from './tw-catalog-upsert'

const SAMPLE_RECORD: TwAssetBootstrapRecord = {
  symbol: '2330',
  name: '台積電',
  type: 'equity',
  assetClass: 'equity',
  baseCurrency: 'TWD',
  source: 'twse_listed_stock',
  globalAliases: ['台積電', '2330'],
}

const ETF_RECORD: TwAssetBootstrapRecord = {
  symbol: '0050',
  name: '元大台灣50',
  type: 'etf',
  assetClass: 'equity',
  baseCurrency: 'TWD',
  source: 'twse_listed_etf',
  globalAliases: ['元大台灣50', '0050'],
}

function createMockDb() {
  const assets = new Map<string, { id: string; symbol: string; name: string; type: string; assetClass: string; baseCurrency: string }>()
  const aliases = new Map<string, { id: string; assetId: string; alias: string; broker: string }>()
  let nextAssetId = 1
  let nextAliasId = 1

  const db = {
    asset: {
      findUnique: jest.fn(async ({ where }: { where: { symbol: string } }) => {
        for (const asset of assets.values()) {
          if (asset.symbol === where.symbol) {
            return { id: asset.id }
          }
        }
        return null
      }),
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            symbol: string
            name: string
            type: string
            assetClass: string
            baseCurrency: string
          }
        }) => {
          const id = `asset-${nextAssetId++}`
          assets.set(id, { id, ...data })
          return { id }
        },
      ),
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
      create: jest.fn(
        async ({ data }: { data: { assetId: string; alias: string; broker: string } }) => {
          const id = `alias-${nextAliasId++}`
          aliases.set(id, { id, ...data })
          return { id, ...data }
        },
      ),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
    __state: { assets, aliases },
  }

  return db
}

describe('tw-catalog-upsert', () => {
  it('creates missing assets and global aliases', async () => {
    const db = createMockDb()

    const result = await applyTwCatalogUpserts(db, [SAMPLE_RECORD, ETF_RECORD])

    expect(result.assets).toEqual({ created: 2, skippedExisting: 0 })
    expect(result.aliases).toEqual({
      created: 4,
      skippedExisting: 0,
      conflicts: 0,
      conflictExamples: [],
    })
    expect(db.asset.create).toHaveBeenCalledTimes(2)
    expect(db.assetAlias.create).toHaveBeenCalledTimes(4)
  })

  it('is idempotent on rerun without duplicating assets or aliases', async () => {
    const db = createMockDb()

    await applyTwCatalogUpserts(db, [SAMPLE_RECORD])
    const second = await applyTwCatalogUpserts(db, [SAMPLE_RECORD])

    expect(second.assets).toEqual({ created: 0, skippedExisting: 1 })
    expect(second.aliases).toEqual({
      created: 0,
      skippedExisting: 2,
      conflicts: 0,
      conflictExamples: [],
    })
    expect(db.asset.create).toHaveBeenCalledTimes(1)
    expect(db.assetAlias.create).toHaveBeenCalledTimes(2)
  })

  it('does not update existing asset fields', async () => {
    const db = createMockDb()
    db.__state.assets.set('asset-existing', {
      id: 'asset-existing',
      symbol: '2330',
      name: '使用者自訂名稱',
      type: 'equity',
      assetClass: 'equity',
      baseCurrency: 'TWD',
    })
    ;(db.asset.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { symbol: string } }) => {
      for (const asset of db.__state.assets.values()) {
        if (asset.symbol === where.symbol) {
          return { id: asset.id, name: asset.name, type: asset.type, assetClass: asset.assetClass, baseCurrency: asset.baseCurrency }
        }
      }
      return null
    })

    await applyTwCatalogUpserts(db, [SAMPLE_RECORD])

    expect(db.asset.create).not.toHaveBeenCalled()
    expect(db.__state.assets.get('asset-existing')?.name).toBe('使用者自訂名稱')
  })

  it('refuses conflicting global aliases without overwriting', async () => {
    const db = createMockDb()
    db.__state.assets.set('asset-other', {
      id: 'asset-other',
      symbol: '9999',
      name: '其他資產',
      type: 'equity',
      assetClass: 'equity',
      baseCurrency: 'TWD',
    })
    db.__state.aliases.set('alias-conflict', {
      id: 'alias-conflict',
      assetId: 'asset-other',
      alias: '台積電',
      broker: TW_GLOBAL_ALIAS_BROKER,
    })

    const result = await applyTwCatalogUpserts(db, [SAMPLE_RECORD])

    expect(result.aliases.conflicts).toBe(1)
    expect(result.aliases.conflictExamples).toEqual([
      {
        alias: '台積電',
        existingAssetId: 'asset-other',
        expectedSymbol: '2330',
      },
    ])
    expect(db.assetAlias.create).toHaveBeenCalledTimes(1)
    expect(db.__state.aliases.get('alias-conflict')?.assetId).toBe('asset-other')
  })

  it('plans upserts without writes during dry-run', async () => {
    const db = createMockDb()

    const plan = await planTwCatalogUpserts(db, [SAMPLE_RECORD])

    expect(plan.assets).toEqual({ created: 1, skippedExisting: 0 })
    expect(plan.aliases.created).toBe(2)
    expect(db.asset.create).not.toHaveBeenCalled()
    expect(db.assetAlias.create).not.toHaveBeenCalled()
  })

  it('runs writes inside a transaction when available', async () => {
    const db = createMockDb()

    await runTwCatalogUpsertTransaction(db as unknown as PrismaClient, [SAMPLE_RECORD])

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.asset.create).toHaveBeenCalledTimes(1)
  })
})
