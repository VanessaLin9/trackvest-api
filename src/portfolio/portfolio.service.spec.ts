import { PortfolioService } from './portfolio.service'

describe('PortfolioService', () => {
  function createHarness() {
    const prisma = {
      position: {
        findMany: jest.fn(),
      },
      price: {
        findMany: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
      },
      account: {
        findMany: jest.fn(),
      },
      asset: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    }
    const ownershipService = {
      validateUserExists: jest.fn(),
    }
    const fxRateService = {
      getReferenceRate: jest.fn(),
    }

    const service = new PortfolioService(
      prisma as never,
      ownershipService as never,
      fxRateService as never,
    )

    return { service, prisma, ownershipService, fxRateService }
  }

  it('returns an empty summary when the user has no open holdings', async () => {
    const { service, prisma, ownershipService, fxRateService } = createHarness()
    ownershipService.validateUserExists.mockResolvedValue(undefined)
    prisma.position.findMany.mockResolvedValue([])

    const result = await service.getSummary('user-1')

    expect(ownershipService.validateUserExists).toHaveBeenCalledWith('user-1')
    expect(prisma.price.findMany).not.toHaveBeenCalled()
    expect(prisma.transaction.findMany).not.toHaveBeenCalled()
    expect(fxRateService.getReferenceRate).not.toHaveBeenCalled()
    expect(result.baseCurrency).toBeNull()
    expect(result.investedCapital).toBe(0)
    expect(result.marketValue).toBe(0)
    expect(result.totalPnl).toBe(0)
    expect(result.totalReturnRate).toBe(0)
    expect(result.holdingsCount).toBe(0)
  })

  it('aggregates holdings by asset and derives allocation metrics from latest prices', async () => {
    const { service, prisma, ownershipService, fxRateService } = createHarness()
    ownershipService.validateUserExists.mockResolvedValue(undefined)
    prisma.position.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        quantity: 2,
        avgCost: 100,
        openedAt: new Date('2026-03-01T00:00:00.000Z'),
        account: { currency: 'USD' },
        asset: {
          id: 'asset-1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'equity',
          baseCurrency: 'USD',
        },
      },
      {
        assetId: 'asset-1',
        quantity: 3,
        avgCost: 110,
        openedAt: new Date('2026-03-02T00:00:00.000Z'),
        account: { currency: 'USD' },
        asset: {
          id: 'asset-1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'equity',
          baseCurrency: 'USD',
        },
      },
      {
        assetId: 'asset-2',
        quantity: 4,
        avgCost: 50,
        openedAt: new Date('2026-03-03T00:00:00.000Z'),
        account: { currency: 'USD' },
        asset: {
          id: 'asset-2',
          symbol: 'TSLA',
          name: 'Tesla Inc.',
          type: 'equity',
          baseCurrency: 'USD',
        },
      },
    ])
    fxRateService.getReferenceRate.mockResolvedValue({
      base: 'USD',
      quote: 'USD',
      rate: 1,
      date: '2026-04-05',
      provider: 'identity',
    })
    prisma.price.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        price: 130,
        asOf: new Date('2026-04-05T00:00:00.000Z'),
      },
      {
        assetId: 'asset-1',
        price: 125,
        asOf: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])
    prisma.transaction.findMany.mockResolvedValue([
      {
        assetId: 'asset-2',
        type: 'buy',
        tradeTime: new Date('2026-04-04T00:00:00.000Z'),
        note: null,
      },
      {
        assetId: 'asset-1',
        type: 'sell',
        tradeTime: new Date('2026-04-03T00:00:00.000Z'),
        note: 'trim position',
      },
    ])

    const result = await service.getHoldings('user-1')

    expect(prisma.position.findMany).toHaveBeenCalledWith({
      where: {
        account: { userId: 'user-1' },
        closedAt: null,
        quantity: { gt: 0 },
      },
      include: {
        account: {
          select: {
            currency: true,
          },
        },
        asset: {
          select: {
            id: true,
            symbol: true,
            name: true,
            type: true,
            baseCurrency: true,
          },
        },
      },
      orderBy: [
        { assetId: 'asc' },
        { openedAt: 'asc' },
      ],
    })
    expect(result.items).toEqual([
      {
        assetId: 'asset-1',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'equity',
        quantity: 5,
        avgCost: 106,
        latestPrice: 130,
        latestPriceCurrency: 'USD',
        assetBaseCurrency: 'USD',
        investedAmount: 530,
        marketValue: 650,
        pnl: 120,
        returnRate: 0.22641509,
        weight: 0.76470588,
        lastActivitySummary: 'trim position',
      },
      {
        assetId: 'asset-2',
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        type: 'equity',
        quantity: 4,
        avgCost: 50,
        latestPrice: null,
        latestPriceCurrency: null,
        assetBaseCurrency: 'USD',
        investedAmount: 200,
        marketValue: 200,
        pnl: 0,
        returnRate: 0,
        weight: 0.23529412,
        lastActivitySummary: 'Buy on 2026-04-04',
      },
    ])
    expect(result.allocationByType).toEqual([
      {
        type: 'equity',
        marketValue: 850,
        weight: 1,
      },
    ])
  })

  it('returns mixed currency summary when holdings span multiple account currencies', async () => {
    const { service, prisma, ownershipService, fxRateService } = createHarness()
    ownershipService.validateUserExists.mockResolvedValue(undefined)
    prisma.position.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        quantity: 1,
        avgCost: 100,
        openedAt: new Date('2026-03-01T00:00:00.000Z'),
        account: { currency: 'USD' },
        asset: {
          id: 'asset-1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'equity',
          baseCurrency: 'USD',
        },
      },
      {
        assetId: 'asset-2',
        quantity: 1,
        avgCost: 3000,
        openedAt: new Date('2026-03-02T00:00:00.000Z'),
        account: { currency: 'TWD' },
        asset: {
          id: 'asset-2',
          symbol: '0050',
          name: 'Taiwan 50',
          type: 'etf',
          baseCurrency: 'TWD',
        },
      },
    ])
    prisma.price.findMany.mockResolvedValue([])
    prisma.transaction.findMany.mockResolvedValue([])
    fxRateService.getReferenceRate.mockResolvedValue({
      base: 'TWD',
      quote: 'USD',
      rate: 0.03125,
      date: '2026-04-05',
      provider: 'frankfurter',
    })

    const result = await service.getSummary('user-1')

    expect(result.baseCurrency).toBe('USD')
    expect(result.investedCapital).toBe(193.75)
    expect(result.marketValue).toBe(193.75)
    expect(result.totalPnl).toBe(0)
    expect(result.totalReturnRate).toBe(0)
    expect(result.holdingsCount).toBe(2)
  })

  it('converts each position before aggregating the same asset across mixed account currencies', async () => {
    const { service, prisma, ownershipService, fxRateService } = createHarness()
    ownershipService.validateUserExists.mockResolvedValue(undefined)
    prisma.position.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        quantity: 1,
        avgCost: 100,
        openedAt: new Date('2026-03-01T00:00:00.000Z'),
        account: { currency: 'USD' },
        asset: {
          id: 'asset-1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'equity',
          baseCurrency: 'USD',
        },
      },
      {
        assetId: 'asset-1',
        quantity: 1,
        avgCost: 3000,
        openedAt: new Date('2026-03-02T00:00:00.000Z'),
        account: { currency: 'TWD' },
        asset: {
          id: 'asset-1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'equity',
          baseCurrency: 'USD',
        },
      },
    ])
    prisma.price.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        price: 120,
        asOf: new Date('2026-04-05T00:00:00.000Z'),
      },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    fxRateService.getReferenceRate.mockImplementation(async ({ base, quote }: { base: string; quote: string }) => {
      if (base === 'TWD' && quote === 'USD') {
        return {
          base,
          quote,
          rate: 0.03,
          date: '2026-04-05',
          provider: 'frankfurter',
        }
      }

      return {
        base,
        quote,
        rate: 1,
        date: '2026-04-05',
        provider: 'identity',
      }
    })

    const result = await service.getHoldings('user-1')

    expect(result.items).toEqual([
      {
        assetId: 'asset-1',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'equity',
        quantity: 2,
        avgCost: 95,
        latestPrice: 120,
        latestPriceCurrency: 'USD',
        assetBaseCurrency: 'USD',
        investedAmount: 190,
        marketValue: 240,
        pnl: 50,
        returnRate: 0.26315789,
        weight: 1,
        lastActivitySummary: null,
      },
    ])
    expect(result.allocationByType).toEqual([
      {
        type: 'equity',
        marketValue: 240,
        weight: 1,
      },
    ])
  })

  it('builds sparse portfolio trend points from transactions and price history', async () => {
    const { service, prisma, ownershipService, fxRateService } = createHarness()
    ownershipService.validateUserExists.mockResolvedValue(undefined)
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        accountId: 'account-1',
        assetId: 'asset-1',
        type: 'buy',
        quantity: 10,
        amount: 1000,
        price: 100,
        tradeTime: new Date('2026-04-01T09:00:00.000Z'),
      },
      {
        id: 'tx-2',
        accountId: 'account-1',
        assetId: 'asset-1',
        type: 'sell',
        quantity: 4,
        amount: 480,
        price: 120,
        tradeTime: new Date('2026-04-03T09:00:00.000Z'),
      },
    ])
    prisma.account.findMany.mockResolvedValue([
      { id: 'account-1', currency: 'USD' },
    ])
    prisma.asset.findMany.mockResolvedValue([
      { id: 'asset-1', baseCurrency: 'USD' },
    ])
    prisma.price.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        price: 110,
        asOf: new Date('2026-04-02T00:00:00.000Z'),
      },
      {
        assetId: 'asset-1',
        price: 125,
        asOf: new Date('2026-04-04T00:00:00.000Z'),
      },
    ])
    fxRateService.getReferenceRate.mockResolvedValue({
      base: 'USD',
      quote: 'USD',
      rate: 1,
      date: '2026-04-04',
      provider: 'identity',
    })

    const result = await service.getTrend('user-1')

    expect(result).toEqual({
      points: [
        {
          label: '2026-04-01',
          date: '2026-04-01',
          investedCapital: 1000,
          marketValue: 1000,
        },
        {
          label: '2026-04-02',
          date: '2026-04-02',
          investedCapital: 1000,
          marketValue: 1100,
        },
        {
          label: '2026-04-03',
          date: '2026-04-03',
          investedCapital: 600,
          marketValue: 720,
        },
        {
          label: '2026-04-04',
          date: '2026-04-04',
          investedCapital: 600,
          marketValue: 750,
        },
      ],
    })
  })

  it('uses same-day price snapshots as end-of-day values in portfolio trend points', async () => {
    const { service, prisma, ownershipService, fxRateService } = createHarness()
    ownershipService.validateUserExists.mockResolvedValue(undefined)
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        accountId: 'account-1',
        assetId: 'asset-1',
        type: 'buy',
        quantity: 10,
        amount: 1000,
        price: 100,
        tradeTime: new Date('2026-04-01T09:00:00.000Z'),
      },
    ])
    prisma.account.findMany.mockResolvedValue([{ id: 'account-1', currency: 'USD' }])
    prisma.asset.findMany.mockResolvedValue([{ id: 'asset-1', baseCurrency: 'USD' }])
    prisma.price.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        price: 110,
        asOf: new Date('2026-04-01T00:00:00.000Z'),
      },
    ])
    fxRateService.getReferenceRate.mockResolvedValue({
      base: 'USD',
      quote: 'USD',
      rate: 1,
      date: '2026-04-01',
      provider: 'identity',
    })

    const result = await service.getTrend('user-1')

    expect(result).toEqual({
      points: [
        {
          label: '2026-04-01',
          date: '2026-04-01',
          investedCapital: 1000,
          marketValue: 1100,
        },
      ],
    })
  })

  it('uses point-in-time FX when building mixed-currency portfolio trend points', async () => {
    const { service, prisma, ownershipService, fxRateService } = createHarness()
    ownershipService.validateUserExists.mockResolvedValue(undefined)
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'tx-twd-1',
        accountId: 'account-twd',
        assetId: 'asset-twd',
        type: 'buy',
        quantity: 10,
        amount: 1000,
        price: 100,
        tradeTime: new Date('2026-04-01T09:00:00.000Z'),
      },
      {
        id: 'tx-usd-1',
        accountId: 'account-usd',
        assetId: 'asset-usd',
        type: 'buy',
        quantity: 1,
        amount: 200,
        price: 200,
        tradeTime: new Date('2026-04-01T09:30:00.000Z'),
      },
    ])
    prisma.account.findMany.mockResolvedValue([
      { id: 'account-twd', currency: 'TWD' },
      { id: 'account-usd', currency: 'USD' },
    ])
    prisma.asset.findMany.mockResolvedValue([
      { id: 'asset-twd', baseCurrency: 'TWD' },
      { id: 'asset-usd', baseCurrency: 'USD' },
    ])
    prisma.price.findMany.mockResolvedValue([
      {
        assetId: 'asset-twd',
        price: 120,
        asOf: new Date('2026-04-02T00:00:00.000Z'),
      },
      {
        assetId: 'asset-twd',
        price: 120,
        asOf: new Date('2026-04-03T00:00:00.000Z'),
      },
    ])
    fxRateService.getReferenceRate.mockImplementation(
      async ({ base, quote, asOf }: { base: string; quote: string; asOf: Date }) => {
        if (base === 'TWD' && quote === 'USD') {
          const date = asOf.toISOString().slice(0, 10)
          const rateByDate: Record<string, number> = {
            '2026-04-01': 0.03,
            '2026-04-02': 0.03,
            '2026-04-03': 0.04,
          }

          return {
            base,
            quote,
            rate: rateByDate[date],
            date,
            provider: 'frankfurter',
          }
        }

        return {
          base,
          quote,
          rate: 1,
          date: asOf.toISOString().slice(0, 10),
          provider: 'identity',
        }
      },
    )

    const result = await service.getTrend('user-1')

    expect(result).toEqual({
      points: [
        {
          label: '2026-04-01',
          date: '2026-04-01',
          investedCapital: 230,
          marketValue: 230,
        },
        {
          label: '2026-04-02',
          date: '2026-04-02',
          investedCapital: 230,
          marketValue: 236,
        },
        {
          label: '2026-04-03',
          date: '2026-04-03',
          investedCapital: 240,
          marketValue: 248,
        },
      ],
    })
  })

  it('builds asset trend points and throws when the asset is not held by the user', async () => {
    const { service, prisma, ownershipService, fxRateService } = createHarness()
    ownershipService.validateUserExists.mockResolvedValue(undefined)
    prisma.transaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'tx-1',
          accountId: 'account-1',
          assetId: 'asset-1',
          type: 'buy',
          quantity: 5,
          amount: 500,
          price: 100,
          tradeTime: new Date('2026-04-01T09:00:00.000Z'),
        },
        {
          id: 'tx-2',
          accountId: 'account-1',
          assetId: 'asset-1',
          type: 'buy',
          quantity: 5,
          amount: 550,
          price: 110,
          tradeTime: new Date('2026-04-02T09:00:00.000Z'),
        },
      ])
    prisma.account.findMany.mockResolvedValue([
      { id: 'account-1', currency: 'USD' },
    ])
    prisma.asset.findUnique.mockResolvedValue({
      id: 'asset-1',
      baseCurrency: 'USD',
    })
    prisma.price.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        price: 120,
        asOf: new Date('2026-04-03T00:00:00.000Z'),
      },
    ])
    fxRateService.getReferenceRate.mockResolvedValue({
      base: 'USD',
      quote: 'USD',
      rate: 1,
      date: '2026-04-03',
      provider: 'identity',
    })

    await expect(service.getHoldingTrend('user-1', 'missing-asset')).rejects.toThrow(
      'Asset holding not found',
    )

    const result = await service.getHoldingTrend('user-1', 'asset-1')

    expect(result).toEqual({
      assetId: 'asset-1',
      points: [
        {
          label: '2026-04-01',
          date: '2026-04-01',
          investedAmount: 500,
          marketValue: 500,
        },
        {
          label: '2026-04-02',
          date: '2026-04-02',
          investedAmount: 1050,
          marketValue: 1100,
        },
        {
          label: '2026-04-03',
          date: '2026-04-03',
          investedAmount: 1050,
          marketValue: 1200,
        },
      ],
    })
  })

  it('uses same-day price snapshots as end-of-day values in holding trend points', async () => {
    const { service, prisma, ownershipService, fxRateService } = createHarness()
    ownershipService.validateUserExists.mockResolvedValue(undefined)
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        accountId: 'account-1',
        assetId: 'asset-1',
        type: 'buy',
        quantity: 5,
        amount: 500,
        price: 100,
        tradeTime: new Date('2026-04-01T09:00:00.000Z'),
      },
    ])
    prisma.account.findMany.mockResolvedValue([{ id: 'account-1', currency: 'USD' }])
    prisma.asset.findUnique.mockResolvedValue({
      id: 'asset-1',
      baseCurrency: 'USD',
    })
    prisma.price.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        price: 110,
        asOf: new Date('2026-04-01T00:00:00.000Z'),
      },
    ])
    fxRateService.getReferenceRate.mockResolvedValue({
      base: 'USD',
      quote: 'USD',
      rate: 1,
      date: '2026-04-01',
      provider: 'identity',
    })

    const result = await service.getHoldingTrend('user-1', 'asset-1')

    expect(result).toEqual({
      assetId: 'asset-1',
      points: [
        {
          label: '2026-04-01',
          date: '2026-04-01',
          investedAmount: 500,
          marketValue: 550,
        },
      ],
    })
  })

  it('converts cross-currency holdings to a USD overview base currency', async () => {
    const { service, prisma, ownershipService, fxRateService } = createHarness()
    ownershipService.validateUserExists.mockResolvedValue(undefined)
    prisma.position.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        quantity: 10,
        avgCost: 100,
        openedAt: new Date('2026-03-01T00:00:00.000Z'),
        account: { currency: 'TWD' },
        asset: {
          id: 'asset-1',
          symbol: '0050',
          name: 'Taiwan 50',
          type: 'etf',
          baseCurrency: 'TWD',
        },
      },
      {
        assetId: 'asset-2',
        quantity: 1,
        avgCost: 200,
        openedAt: new Date('2026-03-02T00:00:00.000Z'),
        account: { currency: 'USD' },
        asset: {
          id: 'asset-2',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'equity',
          baseCurrency: 'USD',
        },
      },
    ])
    prisma.price.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        price: 120,
        asOf: new Date('2026-04-05T00:00:00.000Z'),
      },
      {
        assetId: 'asset-2',
        price: 250,
        asOf: new Date('2026-04-05T00:00:00.000Z'),
      },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    fxRateService.getReferenceRate.mockResolvedValue({
      base: 'TWD',
      quote: 'USD',
      rate: 0.03125,
      date: '2026-04-05',
      provider: 'frankfurter',
    })

    const result = await service.getHoldings('user-1')

    expect(result.items).toEqual([
      {
        assetId: 'asset-2',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'equity',
        quantity: 1,
        avgCost: 200,
        latestPrice: 250,
        latestPriceCurrency: 'USD',
        assetBaseCurrency: 'USD',
        investedAmount: 200,
        marketValue: 250,
        pnl: 50,
        returnRate: 0.25,
        weight: 0.86956522,
        lastActivitySummary: null,
      },
      {
        assetId: 'asset-1',
        symbol: '0050',
        name: 'Taiwan 50',
        type: 'etf',
        quantity: 10,
        avgCost: 3.125,
        latestPrice: 120,
        latestPriceCurrency: 'TWD',
        assetBaseCurrency: 'TWD',
        investedAmount: 31.25,
        marketValue: 37.5,
        pnl: 6.25,
        returnRate: 0.2,
        weight: 0.13043478,
        lastActivitySummary: null,
      },
    ])
    expect(result.allocationByType).toEqual([
      {
        type: 'equity',
        marketValue: 250,
        weight: 0.86956522,
      },
      {
        type: 'etf',
        marketValue: 37.5,
        weight: 0.13043478,
      },
    ])
  })
})
