import { ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AssetPerformanceService } from './asset-performance.service'

describe('AssetPerformanceService', () => {
  function createHarness(accounts: Array<{ id: string; currency: string }>) {
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
})
