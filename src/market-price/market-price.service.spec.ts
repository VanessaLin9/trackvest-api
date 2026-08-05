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

  describe('refreshPrices', () => {
    function mockEverHeld(
      prisma: ReturnType<typeof createHarness>['prisma'],
      assets: Array<{ id: string; symbol: string }>,
    ) {
      prisma.transaction.groupBy.mockResolvedValue(assets.map((asset) => ({ assetId: asset.id })))
      prisma.asset.findMany.mockResolvedValue(assets)
    }

    it('uses market-timezone 14-day windows and includes prior Friday on Sunday', async () => {
      const { service, prisma, taiwanPriceProvider, usPriceProvider } = createHarness()
      mockEverHeld(prisma, [])
      taiwanPriceProvider.getDailyPrices.mockResolvedValue([])
      usPriceProvider.getDailyPrices.mockResolvedValue([])

      // Sunday 2026-08-02 12:00 UTC → Taipei and NY are both still 2026-08-02.
      const sunday = new Date('2026-08-02T12:00:00.000Z')
      const result = await service.refreshPrices(sunday)

      expect(result.status).toBe('success')
      expect(result.markets).toEqual([
        {
          market: 'tw',
          status: 'success',
          startDate: '2026-07-20',
          endDate: '2026-08-02',
          assetsProcessed: 0,
          rowsUpserted: 0,
        },
        {
          market: 'us',
          status: 'success',
          startDate: '2026-07-20',
          endDate: '2026-08-02',
          assetsProcessed: 0,
          rowsUpserted: 0,
        },
      ])
      // Inclusive window covers Friday 2026-07-31 before that Sunday.
      const twMarket = result.markets[0]
      expect(twMarket.status).toBe('success')
      if (twMarket.status === 'success') {
        expect(twMarket.startDate <= '2026-07-31').toBe(true)
        expect(twMarket.endDate >= '2026-07-31').toBe(true)
      }
    })

    it('derives TW and US endDates independently when timezones disagree', async () => {
      const { service, prisma, taiwanPriceProvider, usPriceProvider } = createHarness()
      mockEverHeld(prisma, [])
      taiwanPriceProvider.getDailyPrices.mockResolvedValue([])
      usPriceProvider.getDailyPrices.mockResolvedValue([])

      // 2026-08-03 02:00 UTC → Taipei 08-03, America/New_York still 08-02 (EDT).
      const result = await service.refreshPrices(new Date('2026-08-03T02:00:00.000Z'))

      expect(result.markets[0]).toMatchObject({
        market: 'tw',
        startDate: '2026-07-21',
        endDate: '2026-08-03',
      })
      expect(result.markets[1]).toMatchObject({
        market: 'us',
        startDate: '2026-07-20',
        endDate: '2026-08-02',
      })
    })

    it('returns success when both markets refresh', async () => {
      const { service, prisma, taiwanPriceProvider, usPriceProvider } = createHarness()
      mockEverHeld(prisma, [{ id: 'asset-2330', symbol: '2330' }])
      taiwanPriceProvider.getDailyPrices.mockResolvedValue([sampleTwRow])
      usPriceProvider.getDailyPrices.mockResolvedValue([sampleUsRow])

      const result = await service.refreshPrices(new Date('2026-08-02T12:00:00.000Z'))

      expect(result.status).toBe('success')
      expect(result.markets.map((entry) => entry.status)).toEqual(['success', 'success'])
      expect(result.markets[0]).toMatchObject({
        market: 'tw',
        assetsProcessed: 1,
        rowsUpserted: 1,
      })
      expect(result.markets[1]).toMatchObject({
        market: 'us',
        assetsProcessed: 1,
        rowsUpserted: 1,
      })
    })

    it('returns partial_success when TW succeeds and US fails', async () => {
      const { service, prisma, taiwanPriceProvider, usPriceProvider } = createHarness()
      mockEverHeld(prisma, [{ id: 'asset-2330', symbol: '2330' }])
      taiwanPriceProvider.getDailyPrices.mockResolvedValue([sampleTwRow])
      usPriceProvider.getDailyPrices.mockRejectedValue(new Error('finmind down'))

      const result = await service.refreshPrices(new Date('2026-08-02T12:00:00.000Z'))

      expect(result.status).toBe('partial_success')
      expect(result.markets[0]).toMatchObject({
        market: 'tw',
        status: 'success',
        rowsUpserted: 1,
      })
      expect(result.markets[1]).toEqual({
        market: 'us',
        status: 'failed',
        errorCode: 'PRICE_REFRESH_FAILED',
        message: 'US price refresh failed',
      })
    })

    it('returns partial_success when US succeeds and TW fails', async () => {
      const { service, prisma, taiwanPriceProvider, usPriceProvider } = createHarness()
      mockEverHeld(prisma, [{ id: 'asset-aapl', symbol: 'AAPL' }])
      taiwanPriceProvider.getDailyPrices.mockRejectedValue(new Error('finmind down'))
      usPriceProvider.getDailyPrices.mockResolvedValue([sampleUsRow])

      const result = await service.refreshPrices(new Date('2026-08-02T12:00:00.000Z'))

      expect(result.status).toBe('partial_success')
      expect(result.markets[0]).toEqual({
        market: 'tw',
        status: 'failed',
        errorCode: 'PRICE_REFRESH_FAILED',
        message: 'TW price refresh failed',
      })
      expect(result.markets[1]).toMatchObject({
        market: 'us',
        status: 'success',
        rowsUpserted: 1,
      })
    })

    it('returns failed with sanitized errors when both markets fail', async () => {
      const { service, prisma, taiwanPriceProvider, usPriceProvider } = createHarness()
      mockEverHeld(prisma, [{ id: 'asset-2330', symbol: '2330' }])
      taiwanPriceProvider.getDailyPrices.mockRejectedValue(new Error('token leaked: SECRET'))
      usPriceProvider.getDailyPrices.mockRejectedValue(new Error('https://provider.example/secret'))

      const result = await service.refreshPrices(new Date('2026-08-02T12:00:00.000Z'))

      expect(result.status).toBe('failed')
      expect(result.markets).toEqual([
        {
          market: 'tw',
          status: 'failed',
          errorCode: 'PRICE_REFRESH_FAILED',
          message: 'TW price refresh failed',
        },
        {
          market: 'us',
          status: 'failed',
          errorCode: 'PRICE_REFRESH_FAILED',
          message: 'US price refresh failed',
        },
      ])
      expect(JSON.stringify(result)).not.toContain('SECRET')
      expect(JSON.stringify(result)).not.toContain('provider.example')
    })

    it('treats no holdings as success with zero counts without calling providers', async () => {
      const { service, prisma, taiwanPriceProvider, usPriceProvider } = createHarness()
      mockEverHeld(prisma, [])
      taiwanPriceProvider.getDailyPrices.mockResolvedValue([])
      usPriceProvider.getDailyPrices.mockResolvedValue([])

      const result = await service.refreshPrices(new Date('2026-08-02T12:00:00.000Z'))

      expect(result.status).toBe('success')
      expect(result.markets).toEqual([
        {
          market: 'tw',
          status: 'success',
          startDate: '2026-07-20',
          endDate: '2026-08-02',
          assetsProcessed: 0,
          rowsUpserted: 0,
        },
        {
          market: 'us',
          status: 'success',
          startDate: '2026-07-20',
          endDate: '2026-08-02',
          assetsProcessed: 0,
          rowsUpserted: 0,
        },
      ])
      expect(taiwanPriceProvider.getDailyPrices).not.toHaveBeenCalled()
      expect(usPriceProvider.getDailyPrices).not.toHaveBeenCalled()
    })

    it('treats empty provider rows as success with zero upserts', async () => {
      const { service, prisma, taiwanPriceProvider, usPriceProvider } = createHarness()
      mockEverHeld(prisma, [{ id: 'asset-2330', symbol: '2330' }])
      taiwanPriceProvider.getDailyPrices.mockResolvedValue([])
      usPriceProvider.getDailyPrices.mockResolvedValue([])

      const result = await service.refreshPrices(new Date('2026-08-02T12:00:00.000Z'))

      expect(result.status).toBe('success')
      expect(result.markets[0]).toMatchObject({
        market: 'tw',
        status: 'success',
        assetsProcessed: 1,
        rowsUpserted: 0,
      })
      expect(result.markets[1]).toMatchObject({
        market: 'us',
        status: 'success',
        assetsProcessed: 1,
        rowsUpserted: 0,
      })
      expect(prisma.price.upsert).not.toHaveBeenCalled()
    })
  })
})
