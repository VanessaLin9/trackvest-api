import { MarketPriceService } from './market-price.service'

describe('MarketPriceService', () => {
  function createHarness() {
    const prisma = {
      transaction: {
        groupBy: jest.fn(),
      },
      asset: {
        findMany: jest.fn(),
      },
      price: {
        aggregate: jest.fn(),
        upsert: jest.fn(),
      },
    }
    const taiwanPriceProvider = {
      providerKey: 'finmind',
      getDailyPrices: jest.fn(),
    }
    const usPriceProvider = {
      providerKey: 'finmind',
      getDailyPrices: jest.fn(),
    }

    const service = new MarketPriceService(
      prisma as never,
      taiwanPriceProvider as never,
      usPriceProvider as never,
    )

    return { service, prisma, taiwanPriceProvider, usPriceProvider }
  }

  const sampleTwRow = {
    date: '2026-06-02',
    stockId: '2330',
    open: 2350,
    high: 2390,
    low: 2340,
    close: 2380,
    volume: 1000,
    turnoverAmount: 2000000,
    changeRate: 1.2,
    tradeCount: 12345,
    provider: 'finmind',
  }

  const sampleUsRow = {
    date: '2026-06-02',
    stockId: 'AAPL',
    open: 200,
    high: 205,
    low: 198,
    close: 204,
    volume: 50000000,
    adjClose: 203.5,
    provider: 'finmind',
  }

  it('resolves only TWD assets that ever had buy/sell transactions', async () => {
    const { service, prisma } = createHarness()

    prisma.transaction.groupBy.mockResolvedValue([{ assetId: 'asset-2330' }])
    prisma.asset.findMany.mockResolvedValue([{ id: 'asset-2330', symbol: '2330' }])

    const assets = await service.resolveEverHeldAssets('TWD')

    expect(assets).toEqual([{ id: 'asset-2330', symbol: '2330' }])
    expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['assetId'],
        where: expect.objectContaining({
          isDeleted: false,
          type: { in: ['buy', 'sell'] },
          asset: { baseCurrency: 'TWD' },
        }),
      }),
    )
  })

  it('resolves only USD assets that ever had buy/sell transactions', async () => {
    const { service, prisma } = createHarness()

    prisma.transaction.groupBy.mockResolvedValue([{ assetId: 'asset-aapl' }])
    prisma.asset.findMany.mockResolvedValue([{ id: 'asset-aapl', symbol: 'AAPL' }])

    const assets = await service.resolveEverHeldAssets('USD')

    expect(assets).toEqual([{ id: 'asset-aapl', symbol: 'AAPL' }])
    expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          asset: { baseCurrency: 'USD' },
        }),
      }),
    )
  })

  it('syncTwDaily upserts full Taiwan daily fields for a short window', async () => {
    const { service, prisma, taiwanPriceProvider } = createHarness()

    prisma.transaction.groupBy.mockResolvedValue([{ assetId: 'asset-2330' }])
    prisma.asset.findMany.mockResolvedValue([{ id: 'asset-2330', symbol: '2330' }])
    taiwanPriceProvider.getDailyPrices.mockResolvedValue([sampleTwRow])

    const result = await service.syncTaiwanPrices({
      startDate: '2026-06-02',
      endDate: '2026-06-02',
    })

    expect(result.market).toBe('tw')
    expect(result.mode).toBe('daily')
    expect(result.rowsUpserted).toBe(1)
    expect(prisma.price.upsert).toHaveBeenCalledWith({
      where: {
        assetId_asOf: {
          assetId: 'asset-2330',
          asOf: new Date('2026-06-02T00:00:00.000Z'),
        },
      },
      create: expect.objectContaining({
        assetId: 'asset-2330',
        source: 'finmind',
        price: 2380,
        open: 2350,
        high: 2390,
        low: 2340,
        volume: 1000,
        turnoverAmount: 2000000,
        changeRate: 1.2,
        tradeCount: 12345,
      }),
      update: expect.objectContaining({
        source: 'finmind',
        price: 2380,
      }),
    })
  })

  it('syncUsDaily upserts US daily fields including adjClose', async () => {
    const { service, prisma, usPriceProvider } = createHarness()

    prisma.transaction.groupBy.mockResolvedValue([{ assetId: 'asset-aapl' }])
    prisma.asset.findMany.mockResolvedValue([{ id: 'asset-aapl', symbol: 'AAPL' }])
    usPriceProvider.getDailyPrices.mockResolvedValue([sampleUsRow])

    const result = await service.syncUsPrices({
      startDate: '2026-06-02',
      endDate: '2026-06-02',
    })

    expect(result.market).toBe('us')
    expect(result.rowsUpserted).toBe(1)
    expect(usPriceProvider.getDailyPrices).toHaveBeenCalledWith({
      stockId: 'AAPL',
      startDate: '2026-06-02',
      endDate: '2026-06-02',
    })
    expect(prisma.price.upsert).toHaveBeenCalledWith({
      where: {
        assetId_asOf: {
          assetId: 'asset-aapl',
          asOf: new Date('2026-06-02T00:00:00.000Z'),
        },
      },
      create: expect.objectContaining({
        price: 204,
        adjClose: 203.5,
        volume: 50000000,
      }),
      update: expect.objectContaining({
        price: 204,
        adjClose: 203.5,
      }),
    })
  })

  it('syncTwBackfill only processes incomplete assets up to the per-run limit', async () => {
    const { service, prisma, taiwanPriceProvider } = createHarness()

    prisma.transaction.groupBy
      .mockResolvedValueOnce([{ assetId: 'asset-a' }, { assetId: 'asset-b' }])
      .mockResolvedValueOnce([
        { assetId: 'asset-a', _min: { tradeTime: new Date('2026-01-02T00:00:00.000Z') } },
        { assetId: 'asset-b', _min: { tradeTime: new Date('2026-02-02T00:00:00.000Z') } },
      ])
    prisma.asset.findMany.mockResolvedValue([
      { id: 'asset-a', symbol: '0050' },
      { id: 'asset-b', symbol: '2330' },
    ])
    prisma.price.aggregate.mockImplementation(({ where }: { where: { assetId: string } }) => {
      if (where.assetId === 'asset-a') {
        return Promise.resolve({ _min: { asOf: null }, _max: { asOf: null } })
      }
      return Promise.resolve({
        _min: { asOf: new Date('2026-06-01T00:00:00.000Z') },
        _max: { asOf: new Date('2026-06-02T00:00:00.000Z') },
      })
    })
    taiwanPriceProvider.getDailyPrices.mockResolvedValue([sampleTwRow])

    const result = await service.syncTwBackfill({
      endDate: '2026-06-03',
      maxAssetsPerRun: 1,
    })

    expect(result.mode).toBe('backfill')
    expect(result.assetsProcessed).toBe(1)
    expect(taiwanPriceProvider.getDailyPrices).toHaveBeenCalledTimes(1)
    expect(result.perAsset.find((entry) => entry.assetId === 'asset-a' && !entry.skipped)).toBeTruthy()
    expect(result.perAsset.find((entry) => entry.assetId === 'asset-b' && entry.skipped)).toBeTruthy()
  })
})
