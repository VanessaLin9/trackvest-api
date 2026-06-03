import { MarketPriceService } from './market-price.service'

describe('MarketPriceService', () => {
  function createHarness() {
    const prisma = {
      asset: {
        findMany: jest.fn(),
      },
      price: {
        upsert: jest.fn(),
      },
    }
    const taiwanPriceProvider = {
      providerKey: 'finmind',
      getDailyPrices: jest.fn(),
    }

    const service = new MarketPriceService(prisma as never, taiwanPriceProvider as never)

    return { service, prisma, taiwanPriceProvider }
  }

  it('upserts full Taiwan daily fields for each FinMind row', async () => {
    const { service, prisma, taiwanPriceProvider } = createHarness()

    prisma.asset.findMany.mockResolvedValue([
      { id: 'asset-2330', symbol: '2330' },
    ])
    taiwanPriceProvider.getDailyPrices.mockResolvedValue([
      {
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
      },
    ])

    const result = await service.syncTaiwanPrices({
      startDate: '2026-06-02',
      endDate: '2026-06-02',
    })

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
        open: 2350,
        high: 2390,
        low: 2340,
        volume: 1000,
        turnoverAmount: 2000000,
        changeRate: 1.2,
        tradeCount: 12345,
      }),
    })
  })

  it('syncs only Taiwan-dollar assets', async () => {
    const { service, prisma, taiwanPriceProvider } = createHarness()

    prisma.asset.findMany.mockResolvedValue([])
    taiwanPriceProvider.getDailyPrices.mockResolvedValue([])

    await service.syncTaiwanPrices({
      startDate: '2026-06-02',
      endDate: '2026-06-02',
    })

    expect(prisma.asset.findMany).toHaveBeenCalledWith({
      where: {
        baseCurrency: 'TWD',
      },
      select: {
        id: true,
        symbol: true,
      },
      orderBy: {
        symbol: 'asc',
      },
    })
  })
})
