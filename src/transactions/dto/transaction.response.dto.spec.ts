import { Prisma, TxType } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import {
  TransactionListResponseDto,
  TransactionResponseDto,
} from './transaction.response.dto'

describe('TransactionResponseDto', () => {
  const raw = {
    id: 'tx-1',
    accountId: 'acc-1',
    assetId: 'asset-1',
    type: TxType.buy,
    amount: new Prisma.Decimal('1000.50'),
    quantity: new Prisma.Decimal('10'),
    price: new Prisma.Decimal('100.05'),
    fee: new Prisma.Decimal('1.25'),
    tax: new Prisma.Decimal('0'),
    brokerOrderNo: null,
    cashInLieuActionId: null,
    tradeTime: new Date('2026-01-02T00:00:00.000Z'),
    note: null,
    isDeleted: false,
    deletedAt: null,
    account: {
      id: 'acc-1',
      name: 'Broker TWD',
      currency: 'TWD',
      userId: 'user-1',
      broker: 'should-drop',
    },
    asset: {
      id: 'asset-1',
      symbol: '2330',
      name: 'TSMC',
      baseCurrency: 'TWD',
      type: 'should-drop',
    },
    tags: [{ id: 'should-drop' }],
  }

  it('exposes one item shape with decimal strings and nested summaries', () => {
    const item = plainToInstance(TransactionResponseDto, raw, {
      excludeExtraneousValues: true,
    })

    expect(item.amount).toBe('1000.5')
    expect(item.quantity).toBe('10')
    expect(item.price).toBe('100.05')
    expect(item.fee).toBe('1.25')
    expect(item.tax).toBe('0')
    expect(item.account).toEqual({
      id: 'acc-1',
      name: 'Broker TWD',
      currency: 'TWD',
      userId: 'user-1',
    })
    expect(item.asset).toEqual({
      id: 'asset-1',
      symbol: '2330',
      name: 'TSMC',
      baseCurrency: 'TWD',
    })
    expect(item).not.toHaveProperty('tags')
  })

  it('serializes a page with the same item shape', () => {
    const page = plainToInstance(
      TransactionListResponseDto,
      { total: 1, skip: 0, take: 20, items: [raw], extra: true },
      { excludeExtraneousValues: true },
    )

    expect(page.total).toBe(1)
    expect(page.items[0]?.amount).toBe('1000.5')
    expect(page.items[0]?.account?.name).toBe('Broker TWD')
    expect(page).not.toHaveProperty('extra')
  })

  it('keeps a null asset null', () => {
    const item = plainToInstance(
      TransactionResponseDto,
      { ...raw, asset: null, assetId: null },
      { excludeExtraneousValues: true },
    )

    expect(item.asset).toBeNull()
  })
})
