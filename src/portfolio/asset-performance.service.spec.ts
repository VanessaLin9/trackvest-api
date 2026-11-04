import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AssetPerformanceService } from './asset-performance.service'

describe('AssetPerformanceService', () => {
  function createHarness(accounts: Array<{ id: string; currency: string; name?: string }>) {
    const tx = {
      account: {
        findMany: jest.fn().mockResolvedValue(accounts),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      positionLot: { findMany: jest.fn(), update: jest.fn() },
      position: { findMany: jest.fn(), update: jest.fn() },
      sellLotMatch: { findMany: jest.fn(), create: jest.fn() },
      asset: { findMany: jest.fn() },
      price: { groupBy: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>, options?: unknown) => {
        expect(options).toEqual({
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        })
        return fn(tx)
      }),
    }
    return {
      service: new AssetPerformanceService(prisma as never),
      tx,
      prisma,
    }
  }

  it('rejects an account outside the caller and does not read trades', async () => {
    const { service, tx } = createHarness([])

    await expect(service.getAssetPerformance('user-1', {
      accountId: '11111111-1111-4111-8111-111111111111',
    })).rejects.toBeInstanceOf(ForbiddenException)

    expect(tx.account.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        id: '11111111-1111-4111-8111-111111111111',
      },
      select: { id: true, currency: true },
    })
    expect(tx.transaction.findMany).not.toHaveBeenCalled()
  })

  it('reads only the caller accounts and active buy, sell, and dividend rows', async () => {
    const { service, tx } = createHarness([{ id: 'account-1', currency: 'TWD' }])

    const response = await service.getAssetPerformance('user-1', {})

    expect(response.items).toEqual([])
    expect(tx.account.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true, currency: true },
    })
    expect(tx.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        accountId: { in: ['account-1'] },
        isDeleted: false,
        assetId: { not: null },
        type: { in: ['buy', 'sell', 'dividend'] },
      },
    }))
    expect(tx.transaction.update).not.toHaveBeenCalled()
    expect(tx.transaction.create).not.toHaveBeenCalled()
    expect(tx.positionLot.update).not.toHaveBeenCalled()
    expect(tx.position.update).not.toHaveBeenCalled()
    expect(tx.sellLotMatch.create).not.toHaveBeenCalled()
    expect(tx.price.update).not.toHaveBeenCalled()
  })

  it('keeps soft-deleted buy lots out of the snapshot and ignores seed quotes', async () => {
    const { service, tx } = createHarness([{ id: 'account-1', currency: 'TWD' }])
    tx.transaction.findMany.mockResolvedValue([
      {
        id: 'buy-1',
        accountId: 'account-1',
        assetId: 'asset-1',
        type: 'buy',
        amount: new Prisma.Decimal('10'),
        quantity: new Prisma.Decimal('1'),
        tradeTime: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])
    tx.positionLot.findMany.mockResolvedValue([])
    tx.position.findMany.mockResolvedValue([])
    tx.asset.findMany.mockResolvedValue([
      { id: 'asset-1', symbol: '0050', name: '元大台灣50', baseCurrency: 'TWD' },
    ])
    tx.price.groupBy.mockResolvedValue([])

    await service.getAssetPerformance('user-1', {})

    expect(tx.positionLot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        accountId: { in: ['account-1'] },
        assetId: { in: ['asset-1'] },
        sourceTransaction: { isDeleted: false },
      },
    }))
    const quoteQuery = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql
    expect(quoteQuery.strings.join(' ')).toContain('"price" <> \'NaN\'::numeric')
    expect(quoteQuery.strings.join(' ')).toContain('"price" > 0')
    expect(quoteQuery.strings.join(' ')).toContain('"source" <> \'seed\'')
    expect(quoteQuery.values).toContain('asset-1')
    expect(tx.price.groupBy).not.toHaveBeenCalled()
    expect(tx.sellLotMatch.findMany).not.toHaveBeenCalled()
  })

  it('rejects another user account for annual realized and does not read trades', async () => {
    const { service, tx } = createHarness([])

    await expect(service.getAnnualRealized('user-1', {
      accountId: '11111111-1111-4111-8111-111111111111',
    })).rejects.toBeInstanceOf(ForbiddenException)

    expect(tx.transaction.findMany).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })

  it('reads annual sells without quotes, lots, or writes', async () => {
    const { service, tx } = createHarness([{ id: 'account-1', currency: 'TWD' }])
    tx.transaction.findMany.mockResolvedValue([
      {
        id: 'sell-1',
        accountId: 'account-1',
        assetId: 'asset-1',
        type: 'sell',
        amount: new Prisma.Decimal('10'),
        quantity: new Prisma.Decimal('1'),
        tradeTime: new Date('2026-02-01T00:00:00.000Z'),
      },
    ])
    tx.sellLotMatch.findMany.mockResolvedValue([
      {
        sellTransactionId: 'sell-1',
        quantity: new Prisma.Decimal('1'),
        unitCost: new Prisma.Decimal('4'),
      },
    ])

    const response = await service.getAnnualRealized('user-1', {})

    expect(response.timeZone).toBe('Asia/Taipei')
    expect(response.items[0]).toMatchObject({
      currency: 'TWD',
      sellCount: 1,
      netProceeds: '10',
      realizedNetPnl: '6',
      issues: [],
    })
    expect(tx.positionLot.findMany).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
    expect(tx.transaction.update).not.toHaveBeenCalled()
    expect(tx.sellLotMatch.create).not.toHaveBeenCalled()
  })

  it('rejects another user account for annual buys and does not read trades', async () => {
    const { service, tx } = createHarness([])

    await expect(service.getAnnualBuys('user-1', {
      accountId: '11111111-1111-4111-8111-111111111111',
    })).rejects.toBeInstanceOf(ForbiddenException)

    expect(tx.transaction.findMany).not.toHaveBeenCalled()
    expect(tx.asset.findMany).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })

  it('reads annual buys by asset type without quotes, lots, or asset class', async () => {
    const { service, tx } = createHarness([{ id: 'account-1', currency: 'TWD' }])
    tx.transaction.findMany.mockResolvedValue([
      {
        accountId: 'account-1',
        assetId: 'etf-1',
        type: 'buy',
        amount: new Prisma.Decimal('300'),
        tradeTime: new Date('2026-03-01T00:00:00.000Z'),
      },
    ])
    tx.asset.findMany.mockResolvedValue([{ id: 'etf-1', type: 'etf' }])

    const response = await service.getAnnualBuys('user-1', {})

    expect(response.timeZone).toBe('Asia/Taipei')
    expect(response.items[0]).toMatchObject({
      currency: 'TWD',
      buyAmount: '300',
      types: [{ type: 'etf', buyAmount: '300', share: '1' }],
    })
    expect(tx.asset.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['etf-1'] } },
      select: { id: true, type: true },
    })
    expect(tx.positionLot.findMany).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
    expect(tx.transaction.update).not.toHaveBeenCalled()
  })

  it('rejects another user account for realized periods and does not read trades', async () => {
    const { service, tx, prisma } = createHarness([])

    await expect(service.getRealizedPeriods('user-1', {
      year: 2024,
      accountId: '11111111-1111-4111-8111-111111111111',
    })).rejects.toBeInstanceOf(ForbiddenException)

    expect(tx.transaction.findMany).not.toHaveBeenCalled()
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('rejects a future year before opening a snapshot', async () => {
    const { service, prisma } = createHarness([{ id: 'account-1', currency: 'TWD' }])
    const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000)

    await expect(service.getRealizedAssets('user-1', {
      year: shifted.getUTCFullYear() + 1,
      currency: 'TWD',
    })).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('reads realized periods from one trade batch and does not touch quotes, lots, or writes', async () => {
    const { service, tx } = createHarness([{ id: 'account-1', name: 'Broker', currency: 'TWD' }])
    tx.transaction.findMany.mockResolvedValue([
      {
        id: 'sell-1',
        accountId: 'account-1',
        assetId: 'asset-1',
        type: 'sell',
        amount: new Prisma.Decimal('10'),
        quantity: new Prisma.Decimal('1'),
        price: new Prisma.Decimal('10'),
        fee: new Prisma.Decimal('1'),
        tax: new Prisma.Decimal('0'),
        tradeTime: new Date('2024-03-01T00:00:00.000Z'),
      },
      {
        id: 'sell-2',
        accountId: 'account-1',
        assetId: 'asset-2',
        type: 'sell',
        amount: new Prisma.Decimal('5'),
        quantity: new Prisma.Decimal('1'),
        price: null,
        fee: new Prisma.Decimal('0'),
        tax: new Prisma.Decimal('0'),
        tradeTime: new Date('2024-05-01T00:00:00.000Z'),
      },
    ])
    tx.sellLotMatch.findMany.mockResolvedValue([
      { sellTransactionId: 'sell-1', quantity: new Prisma.Decimal('1'), unitCost: new Prisma.Decimal('4') },
      { sellTransactionId: 'sell-2', quantity: new Prisma.Decimal('1'), unitCost: new Prisma.Decimal('1') },
    ])
    tx.asset.findMany.mockResolvedValue([
      { id: 'asset-1', symbol: 'AAA', name: 'Alpha', type: 'etf' },
      { id: 'asset-2', symbol: 'BBB', name: 'Beta', type: 'equity' },
    ])

    const periods = await service.getRealizedPeriods('user-1', { year: 2024 })
    const assets = await service.getRealizedAssets('user-1', { year: 2024, currency: 'TWD', skip: 0, take: 1 })
    const trades = await service.getRealizedTrades('user-1', { year: 2024, currency: 'TWD', assetId: 'asset-1' })

    expect(periods.groups[0].summary).toMatchObject({ sellCount: 2, netProceeds: '15', realizedNetPnl: '10' })
    expect(periods.groups[0].months).toHaveLength(12)
    expect(assets.total).toBe(2)
    expect(assets.items).toHaveLength(1)
    expect(assets.summary.sellCount).toBe(2)
    expect(trades.items[0]).toMatchObject({ amount: '10', fee: '1', realizedNetPnl: '6' })
    expect(trades.summary.sellCount).toBe(1)
    expect(tx.transaction.findMany).toHaveBeenCalledTimes(3)
    expect(tx.sellLotMatch.findMany).toHaveBeenCalledTimes(3)
    expect(tx.asset.findMany).toHaveBeenCalledTimes(3)
    expect(tx.positionLot.findMany).not.toHaveBeenCalled()
    expect(tx.position.findMany).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
    expect(tx.transaction.update).not.toHaveBeenCalled()
    expect(tx.transaction.create).not.toHaveBeenCalled()
    expect(tx.sellLotMatch.create).not.toHaveBeenCalled()
  })
})
