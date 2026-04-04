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
    }
    const ownershipService = {
      validateUserExists: jest.fn(),
    }

    const service = new PortfolioService(prisma as never, ownershipService as never)

    return { service, prisma, ownershipService }
  }

  it('returns an empty summary when the user has no open holdings', async () => {
    const { service, prisma, ownershipService } = createHarness()
    ownershipService.validateUserExists.mockResolvedValue(undefined)
    prisma.position.findMany.mockResolvedValue([])

    const result = await service.getSummary('user-1')

    expect(ownershipService.validateUserExists).toHaveBeenCalledWith('user-1')
    expect(prisma.price.findMany).not.toHaveBeenCalled()
    expect(prisma.transaction.findMany).not.toHaveBeenCalled()
    expect(result.baseCurrency).toBeNull()
    expect(result.investedCapital).toBe(0)
    expect(result.marketValue).toBe(0)
    expect(result.totalPnl).toBe(0)
    expect(result.totalReturnRate).toBe(0)
    expect(result.holdingsCount).toBe(0)
  })

  it('aggregates holdings by asset and derives allocation metrics from latest prices', async () => {
    const { service, prisma, ownershipService } = createHarness()
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
    const { service, prisma, ownershipService } = createHarness()
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

    const result = await service.getSummary('user-1')

    expect(result.baseCurrency).toBe('MIXED')
    expect(result.investedCapital).toBe(3100)
    expect(result.marketValue).toBe(3100)
    expect(result.totalPnl).toBe(0)
    expect(result.totalReturnRate).toBe(0)
    expect(result.holdingsCount).toBe(2)
  })

  it('builds sparse portfolio trend points from transactions and price history', async () => {
    const { service, prisma, ownershipService } = createHarness()
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

  it('builds asset trend points and throws when the asset is not held by the user', async () => {
    const { service, prisma, ownershipService } = createHarness()
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
    prisma.price.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        price: 120,
        asOf: new Date('2026-04-03T00:00:00.000Z'),
      },
    ])

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
})
