import { PortfolioTrendService } from './portfolio-trend.service'
import { PortfolioHoldingsSnapshotService } from './portfolio-holdings-snapshot.service'

describe('split-adjusted portfolio trends', () => {
  function harness(ratio = 4) {
    const transaction = (
      id: string,
      type: 'buy' | 'sell',
      quantity: number,
      price: number,
      date: string,
      accountId = 'account-1',
    ) => ({
      id,
      type,
      quantity,
      price,
      amount: quantity * price,
      tradeTime: new Date(date),
      accountId,
      assetId: '0050',
    })
    const prisma = {
      transaction: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            transaction('buy', 'buy', 100, 200, '2025-06-01'),
            transaction('sell-before', 'sell', 20, 200, '2025-06-10'),
            transaction('second-account', 'buy', 10, 200, '2025-06-10', 'account-2'),
            transaction('buy-on-split', 'buy', 10, 200 / ratio, '2025-06-18'),
            transaction('sell-after', 'sell', 40 * ratio, 200 / ratio, '2025-06-19'),
          ]),
      },
      corporateAction: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { assetId: '0050', exDate: new Date('2025-06-18'), ratio, market: 'tw' },
          ]),
      },
      price: {
        findMany: jest.fn().mockResolvedValue([
          { assetId: '0050', asOf: new Date('2025-06-17'), price: 200 },
          { assetId: '0050', asOf: new Date('2025-06-18'), price: 200 / ratio },
        ]),
      },
      account: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'account-1', currency: 'TWD' },
          { id: 'account-2', currency: 'TWD' },
        ]),
      },
      asset: {
        findMany: jest.fn().mockResolvedValue([{ id: '0050', baseCurrency: 'TWD' }]),
        findUnique: jest.fn().mockResolvedValue({ id: '0050', baseCurrency: 'TWD' }),
      },
    }
    const ownership = { validateUserExists: jest.fn() }
    const snapshots = new PortfolioHoldingsSnapshotService(
      prisma as never,
      ownership as never,
      {} as never,
    )
    return {
      prisma,
      service: new PortfolioTrendService(prisma as never, ownership as never, snapshots),
    }
  }

  it.each([4, 0.5])(
    'preserves cost and market value through a ratio %s split in both endpoints',
    async (ratio) => {
      const { service } = harness(ratio)
      const holding = await service.getHoldingTrend('user-1', '0050')
      const portfolio = await service.getTrend('user-1')
      const splitValue = 18000 + (10 * 200) / ratio
      expect(holding.points.find((p) => p.date === '2025-06-18')).toMatchObject({
        investedAmount: splitValue,
        marketValue: splitValue,
      })
      expect(holding.points.at(-1)).toMatchObject({
        investedAmount: splitValue - 8000,
        marketValue: splitValue - 8000,
      })
      expect(
        portfolio.points.map((p) => ({
          date: p.date,
          investedAmount: p.investedCapital,
          marketValue: p.marketValue,
        })),
      ).toEqual(
        holding.points.map(({ date, investedAmount, marketValue }) => ({
          date,
          investedAmount,
          marketValue,
        })),
      )
    },
  )

  it('adjusts the carried-forward quote when the split day has neither a quote nor a transaction', async () => {
    const { service, prisma } = harness()
    const txs = await prisma.transaction.findMany()
    prisma.transaction.findMany.mockResolvedValue(
      txs.filter((tx: { id: string }) => tx.id !== 'buy-on-split'),
    )
    prisma.price.findMany.mockResolvedValue([
      { assetId: '0050', asOf: new Date('2025-06-17'), price: 200 },
    ])
    const result = await service.getHoldingTrend('user-1', '0050')
    expect(result.points.find((p) => p.date === '2025-06-18')).toMatchObject({
      investedAmount: 18000,
      marketValue: 18000,
    })
    expect(result.points.at(-1)).toMatchObject({ investedAmount: 10000, marketValue: 10000 })
  })

  it('rejects invalid ratios rather than returning corrupted valuations', async () => {
    const { service } = harness(0)
    await expect(service.getTrend('user-1')).rejects.toThrow(
      'split ratio must be a positive finite number',
    )
  })

  it('applies successive splits only to existing lots of the affected asset', async () => {
    const { service, prisma } = harness()
    const txs = await prisma.transaction.findMany()
    prisma.transaction.findMany.mockResolvedValue([
      txs[0],
      { ...txs[0], id: 'other-buy', assetId: '2330' },
      {
        ...txs[0],
        id: 'new-buy',
        quantity: 10,
        amount: 500,
        price: 50,
        tradeTime: new Date('2025-06-19'),
      },
    ])
    prisma.asset.findMany.mockResolvedValue([
      { id: '0050', baseCurrency: 'TWD' },
      { id: '2330', baseCurrency: 'TWD' },
    ])
    prisma.corporateAction.findMany.mockResolvedValue([
      { assetId: '0050', exDate: new Date('2025-06-18'), ratio: 4, market: 'tw' },
      { assetId: '0050', exDate: new Date('2025-06-20'), ratio: 2, market: 'tw' },
    ])
    const result = await service.getTrend('user-1')
    expect(result.points.at(-1)).toMatchObject({ investedCapital: 40500, marketValue: 40500 })
  })

  it('does not resurrect a closed position when its asset later splits', async () => {
    const { service, prisma } = harness()
    const txs = await prisma.transaction.findMany()
    prisma.transaction.findMany.mockResolvedValue([
      txs[0],
      { ...txs[1], quantity: 100, amount: 20000 },
    ])
    const result = await service.getHoldingTrend('user-1', '0050')
    expect(result.points.at(-1)).toMatchObject({ investedAmount: 0, marketValue: 0 })
  })
})
