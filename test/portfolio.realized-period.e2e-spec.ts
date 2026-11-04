import { randomUUID } from 'crypto'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import {
  AssetType,
  Currency,
  Prisma,
  TxType,
  UserRole,
  type Asset,
  type Account,
} from '@prisma/client'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import type { App } from 'supertest/types'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma.service'
import { authCookieFor } from './helpers/auth'
import {
  clearDatabase,
  createTestDatabaseConfig,
  dropTestSchema,
  prepareTestDatabase,
} from './helpers/e2e-db'

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000

function taipeiParts(instant: Date): { year: number; month: number } {
  const shifted = new Date(instant.getTime() + TAIPEI_OFFSET_MS)
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 }
}

describe('Portfolio realized period performance (e2e)', () => {
  const database = createTestDatabaseConfig()

  let app: INestApplication<App>
  let prisma: PrismaService

  beforeAll(async () => {
    process.env.DATABASE_URL = database.testUrl
    prepareTestDatabase(database.testUrl)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.use(cookieParser())
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
    await app.init()
    prisma = app.get(PrismaService)
  })

  beforeEach(async () => {
    await clearDatabase(prisma)
  })

  afterAll(async () => {
    if (app) await app.close()
    await dropTestSchema(database.adminUrl, database.schema)
    process.env.DATABASE_URL = database.baseUrl
  })

  function auth(user: { id: string; role?: UserRole }) {
    return { Cookie: authCookieFor(app, user) }
  }

  async function counts() {
    const [transactions, lots, positions, matches, prices, glEntries, glLines] =
      await Promise.all([
        prisma.transaction.count(),
        prisma.positionLot.count(),
        prisma.position.count(),
        prisma.sellLotMatch.count(),
        prisma.price.count(),
        prisma.glEntry.count(),
        prisma.glLine.count(),
      ])
    return {
      transactions,
      lots,
      positions,
      matches,
      prices,
      glEntries,
      glLines,
    }
  }

  async function user(email: string, role: UserRole = UserRole.user) {
    return prisma.user.create({ data: { email, passwordHash: '!', role } })
  }

  async function account(userId: string, name: string, currency: Currency) {
    return prisma.account.create({
      data: { userId, name, type: 'broker', currency },
    })
  }

  async function asset(
    symbol: string,
    name: string,
    type: AssetType = AssetType.etf,
  ) {
    return prisma.asset.create({
      data: { symbol, name, type, assetClass: 'equity', baseCurrency: 'TWD' },
    })
  }

  async function matchedSell(input: {
    account: Account
    asset: Asset
    buyTime: Date
    sellTime: Date
    buyAmount: string
    buyQuantity: string
    sellAmount: string
    sellQuantity: string | null
    unitCost?: string
    price?: string | null
    fee?: string
    tax?: string
    matchQuantity?: string | null
    deleted?: boolean
  }) {
    const buy = await prisma.transaction.create({
      data: {
        accountId: input.account.id,
        assetId: input.asset.id,
        type: TxType.buy,
        amount: new Prisma.Decimal(input.buyAmount),
        quantity: new Prisma.Decimal(input.buyQuantity),
        tradeTime: input.buyTime,
      },
    })
    const lot = await prisma.positionLot.create({
      data: {
        accountId: input.account.id,
        assetId: input.asset.id,
        sourceTransactionId: buy.id,
        originalQuantity: new Prisma.Decimal(input.buyQuantity),
        remainingQuantity: new Prisma.Decimal(input.buyQuantity),
        unitCost: new Prisma.Decimal(input.unitCost ?? '0'),
        openedAt: input.buyTime,
      },
    })
    const sell = await prisma.transaction.create({
      data: {
        accountId: input.account.id,
        assetId: input.asset.id,
        type: TxType.sell,
        amount: new Prisma.Decimal(input.sellAmount),
        quantity:
          input.sellQuantity == null
            ? null
            : new Prisma.Decimal(input.sellQuantity),
        price: input.price == null ? null : new Prisma.Decimal(input.price),
        fee: new Prisma.Decimal(input.fee ?? '0'),
        tax: new Prisma.Decimal(input.tax ?? '0'),
        tradeTime: input.sellTime,
        isDeleted: input.deleted ?? false,
        deletedAt: input.deleted ? input.sellTime : null,
      },
    })
    if (input.matchQuantity !== null) {
      await prisma.sellLotMatch.create({
        data: {
          sellTransactionId: sell.id,
          buyLotId: lot.id,
          quantity: new Prisma.Decimal(
            input.matchQuantity ?? input.sellQuantity ?? '0',
          ),
          unitCost: new Prisma.Decimal(input.unitCost ?? '0'),
        },
      })
    }
    return sell
  }

  it('returns the year, asset, and sell chain for the owner and does not write', async () => {
    const owner = await user('realized-owner@trackvest.local')
    const intruder = await user(
      'realized-admin@trackvest.local',
      UserRole.admin,
    )
    const twd = await account(owner.id, 'Broker TWD', Currency.TWD)
    const usd = await account(owner.id, 'Broker USD', Currency.USD)
    const alpha = await asset('E2E-RP-AAA', 'Alpha', AssetType.etf)
    const beta = await asset('E2E-RP-BBB', 'Beta', AssetType.equity)
    const gamma = await asset('E2E-RP-CCC', 'Gamma', AssetType.equity)

    await matchedSell({
      account: twd,
      asset: alpha,
      buyTime: new Date('2023-11-01T02:00:00.000Z'),
      sellTime: new Date('2024-03-15T02:00:00.000Z'),
      buyAmount: '1000',
      buyQuantity: '10',
      sellAmount: '250',
      sellQuantity: '2',
      unitCost: '100',
      price: '125',
      fee: '1',
      tax: '0.5',
    })
    await matchedSell({
      account: twd,
      asset: beta,
      buyTime: new Date('2024-01-02T00:00:00.000Z'),
      sellTime: new Date('2024-03-16T02:00:00.000Z'),
      buyAmount: '100',
      buyQuantity: '1',
      sellAmount: '80',
      sellQuantity: '1',
      unitCost: '100',
      price: '80',
    })
    await matchedSell({
      account: usd,
      asset: gamma,
      buyTime: new Date('2024-01-05T02:00:00.000Z'),
      sellTime: new Date('2024-03-20T02:00:00.000Z'),
      buyAmount: '3',
      buyQuantity: '1',
      sellAmount: '7',
      sellQuantity: '1',
      unitCost: '3',
      price: '7',
    })
    await matchedSell({
      account: twd,
      asset: alpha,
      buyTime: new Date('2024-04-01T00:00:00.000Z'),
      sellTime: new Date('2024-04-02T00:00:00.000Z'),
      buyAmount: '9999',
      buyQuantity: '1',
      sellAmount: '9999',
      sellQuantity: '1',
      unitCost: '1',
      deleted: true,
    })
    await prisma.transaction.create({
      data: {
        accountId: twd.id,
        assetId: alpha.id,
        type: TxType.dividend,
        amount: new Prisma.Decimal('20'),
        tradeTime: new Date('2024-05-01T00:00:00.000Z'),
      },
    })
    const before = await counts()

    const periods = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/periods')
      .query({ year: 2024, accountId: twd.id })
      .set(auth(owner))
      .expect(200)
    const assets = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/assets')
      .query({ year: 2024, currency: 'twd' })
      .set(auth(owner))
      .expect(200)
    const trades = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/trades')
      .query({ year: 2024, month: 3, currency: 'TWD', assetId: alpha.id })
      .set(auth(owner))
      .expect(200)
    const annual = await request(app.getHttpServer())
      .get('/portfolio/performance/annual-realized')
      .query({ accountId: twd.id })
      .set(auth(owner))
      .expect(200)

    expect(periods.body.timeZone).toBe('Asia/Taipei')
    expect(periods.body.scope).toEqual({
      accountId: twd.id,
      year: 2024,
      month: null,
      currency: null,
    })
    expect(periods.body.asOf).toBeNull()
    expect(periods.body.isCurrentYear).toBe(false)
    expect(periods.body.periodStart).toBe('2023-12-31T16:00:00.000Z')
    expect(periods.body.periodEndExclusive).toBe('2024-12-31T16:00:00.000Z')
    expect(periods.body.groups).toHaveLength(1)
    expect(periods.body.groups[0].months).toHaveLength(12)
    expect(periods.body.groups[0].summary).toEqual({
      sellCount: 2,
      netProceeds: '330',
      disposedCost: '300',
      realizedNetPnl: '30',
      issues: [],
    })
    expect(periods.body.groups[0].months[2]).toMatchObject({
      month: 3,
      sellCount: 2,
      netProceeds: '330',
    })
    expect(periods.body.groups[0].months[3]).toMatchObject({
      month: 4,
      sellCount: 0,
      netProceeds: '0',
    })

    expect(assets.body.scope.currency).toBe('TWD')
    expect(assets.body.summary).toEqual(periods.body.groups[0].summary)
    expect(assets.body.total).toBe(2)
    expect(
      assets.body.items.map((item: { symbol: string }) => item.symbol),
    ).toEqual(['E2E-RP-AAA', 'E2E-RP-BBB'])
    expect(assets.body.items[0]).toMatchObject({
      type: 'etf',
      sellCount: 1,
      realizedQuantity: '2',
      netProceeds: '250',
      realizedNetPnl: '50',
    })
    expect(assets.body.items[1]).toMatchObject({ realizedNetPnl: '-20' })

    expect(trades.body.scope.assetId).toBe(alpha.id)
    expect(trades.body.summary).toMatchObject({
      sellCount: 1,
      netProceeds: '250',
      realizedNetPnl: '50',
      issues: [],
    })
    expect(trades.body.items).toHaveLength(1)
    expect(trades.body.items[0]).toMatchObject({
      type: 'sell',
      accountName: 'Broker TWD',
      amount: '250',
      fee: '1',
      tax: '0.5',
      quantity: '2',
      price: '125',
      disposedCost: '200',
      realizedNetPnl: '50',
    })

    const annual2024 = annual.body.items.find(
      (item: { year: number; currency: string }) =>
        item.year === 2024 && item.currency === 'TWD',
    )
    expect(annual2024).toMatchObject(periods.body.groups[0].summary)
    expect(await counts()).toEqual(before)

    const hidden = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/periods')
      .query({ year: 2024 })
      .set(auth(intruder))
      .expect(200)
    expect(hidden.body.groups).toEqual([])
    await request(app.getHttpServer())
      .get('/portfolio/performance/realized/assets')
      .query({ year: 2024, currency: 'TWD', accountId: twd.id })
      .set(auth(intruder))
      .expect(403)
    await request(app.getHttpServer())
      .get('/portfolio/performance/realized/periods')
      .query({ year: 2024 })
      .expect(401)

    const usdAssets = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/assets')
      .query({ year: 2024, currency: 'USD' })
      .set(auth(owner))
      .expect(200)
    expect(usdAssets.body.summary).toMatchObject({
      sellCount: 1,
      netProceeds: '7',
      realizedNetPnl: '4',
    })
    expect(usdAssets.body.items[0].assetId).toBe(gamma.id)
  })

  it('assigns the Taipei year and month boundary through the API', async () => {
    const owner = await user('realized-boundary@trackvest.local')
    const twd = await account(owner.id, 'TWD', Currency.TWD)
    const alpha = await asset('E2E-RP-BOUND', 'Boundary')
    await matchedSell({
      account: twd,
      asset: alpha,
      buyTime: new Date('2024-01-01T00:00:00.000Z'),
      sellTime: new Date('2024-12-31T15:59:59.999Z'),
      buyAmount: '1',
      buyQuantity: '1',
      sellAmount: '1',
      sellQuantity: '1',
      unitCost: '1',
    })
    await matchedSell({
      account: twd,
      asset: alpha,
      buyTime: new Date('2024-01-02T00:00:00.000Z'),
      sellTime: new Date('2024-12-31T16:00:00.000Z'),
      buyAmount: '2',
      buyQuantity: '1',
      sellAmount: '2',
      sellQuantity: '1',
      unitCost: '1',
    })

    const december = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/periods')
      .query({ year: 2024 })
      .set(auth(owner))
      .expect(200)
    const january = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/assets')
      .query({ year: 2025, month: 1, currency: 'TWD' })
      .set(auth(owner))
      .expect(200)

    expect(december.body.groups[0].months[11]).toMatchObject({
      month: 12,
      netProceeds: '1',
    })
    expect(january.body.summary).toMatchObject({
      sellCount: 1,
      netProceeds: '2',
    })
    expect(january.body.periodStart).toBe('2024-12-31T16:00:00.000Z')
    expect(january.body.periodEndExclusive).toBe('2025-01-31T16:00:00.000Z')
  })

  it('keeps a complete month while a missing match nulls that month and the year', async () => {
    const owner = await user('realized-missing@trackvest.local')
    const twd = await account(owner.id, 'TWD', Currency.TWD)
    const alpha = await asset('E2E-RP-BAD', 'Bad')
    const beta = await asset('E2E-RP-GOOD', 'Good')
    await matchedSell({
      account: twd,
      asset: alpha,
      buyTime: new Date('2024-01-01T00:00:00.000Z'),
      sellTime: new Date('2024-03-01T00:00:00.000Z'),
      buyAmount: '400',
      buyQuantity: '4',
      sellAmount: '500',
      sellQuantity: '4',
      unitCost: '100',
      matchQuantity: '3',
    })
    await matchedSell({
      account: twd,
      asset: beta,
      buyTime: new Date('2024-01-02T00:00:00.000Z'),
      sellTime: new Date('2024-04-01T00:00:00.000Z'),
      buyAmount: '40',
      buyQuantity: '1',
      sellAmount: '100',
      sellQuantity: '1',
      unitCost: '40',
    })

    const periods = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/periods')
      .query({ year: 2024 })
      .set(auth(owner))
      .expect(200)
    const assets = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/assets')
      .query({ year: 2024, currency: 'TWD' })
      .set(auth(owner))
      .expect(200)

    expect(periods.body.groups[0].months[2]).toMatchObject({
      disposedCost: null,
      realizedNetPnl: null,
      netProceeds: '500',
      issues: ['MISSING_FIFO'],
    })
    expect(periods.body.groups[0].months[3]).toMatchObject({
      netProceeds: '100',
      disposedCost: '40',
      realizedNetPnl: '60',
      issues: [],
    })
    expect(periods.body.groups[0].summary).toMatchObject({
      sellCount: 2,
      netProceeds: '600',
      disposedCost: null,
      realizedNetPnl: null,
      issues: ['MISSING_FIFO'],
    })
    expect(
      assets.body.items.find(
        (item: { symbol: string }) => item.symbol === 'E2E-RP-GOOD',
      ),
    ).toMatchObject({
      realizedNetPnl: '60',
      issues: [],
    })
    expect(
      assets.body.items.find(
        (item: { symbol: string }) => item.symbol === 'E2E-RP-BAD',
      ),
    ).toMatchObject({
      realizedQuantity: null,
      realizedNetPnl: null,
      issues: ['MISSING_FIFO'],
    })
  })

  it('pages sells without letting skip or take change the full summary', async () => {
    const owner = await user('realized-page@trackvest.local')
    const twd = await account(owner.id, 'TWD', Currency.TWD)
    const alpha = await asset('E2E-RP-PAGE', 'Paged')
    const buy = await prisma.transaction.create({
      data: {
        accountId: twd.id,
        assetId: alpha.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('100'),
        quantity: new Prisma.Decimal('30'),
        tradeTime: new Date('2024-01-01T00:00:00.000Z'),
      },
    })
    const lot = await prisma.positionLot.create({
      data: {
        accountId: twd.id,
        assetId: alpha.id,
        sourceTransactionId: buy.id,
        originalQuantity: new Prisma.Decimal('30'),
        remainingQuantity: new Prisma.Decimal('30'),
        unitCost: new Prisma.Decimal('4'),
        openedAt: buy.tradeTime,
      },
    })
    for (let index = 1; index <= 21; index += 1) {
      const sell = await prisma.transaction.create({
        data: {
          id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          accountId: twd.id,
          assetId: alpha.id,
          type: TxType.sell,
          amount: new Prisma.Decimal('10'),
          quantity: new Prisma.Decimal(index === 21 ? '4' : '1'),
          price: new Prisma.Decimal('10'),
          tradeTime: new Date('2024-04-10T02:00:00.000Z'),
        },
      })
      await prisma.sellLotMatch.create({
        data: {
          sellTransactionId: sell.id,
          buyLotId: lot.id,
          quantity: new Prisma.Decimal('1'),
          unitCost: new Prisma.Decimal('4'),
        },
      })
    }

    const first = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/trades')
      .query({ year: 2024, currency: 'TWD', assetId: alpha.id })
      .set(auth(owner))
      .expect(200)
    const second = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/trades')
      .query({
        year: 2024,
        currency: 'TWD',
        assetId: alpha.id,
        skip: 20,
        take: 20,
      })
      .set(auth(owner))
      .expect(200)

    expect(first.body.take).toBe(20)
    expect(first.body.total).toBe(21)
    expect(first.body.items).toHaveLength(20)
    expect(second.body.items).toHaveLength(1)
    expect(first.body.summary).toEqual(second.body.summary)
    expect(first.body.summary).toMatchObject({
      sellCount: 21,
      netProceeds: '210',
      disposedCost: null,
      realizedNetPnl: null,
      issues: ['MISSING_FIFO'],
    })
    expect(
      first.body.items.every(
        (item: { issues: string[] }) => item.issues.length === 0,
      ),
    ).toBe(true)
    expect(second.body.items[0]).toMatchObject({
      transactionId: '00000000-0000-4000-8000-000000000021',
      disposedCost: null,
      issues: ['MISSING_FIFO'],
    })
  })

  it('returns an empty report for dividends, a year with no sells, and an unused currency', async () => {
    const owner = await user('realized-empty@trackvest.local')
    const twd = await account(owner.id, 'TWD', Currency.TWD)
    const alpha = await asset('E2E-RP-EMPTY', 'Empty')
    await prisma.transaction.create({
      data: {
        accountId: twd.id,
        assetId: alpha.id,
        type: TxType.dividend,
        amount: new Prisma.Decimal('20'),
        tradeTime: new Date('2024-02-01T00:00:00.000Z'),
      },
    })

    const dividends = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/periods')
      .query({ year: 2024 })
      .set(auth(owner))
      .expect(200)
    expect(dividends.body.groups).toEqual([])

    await prisma.transaction.create({
      data: {
        accountId: twd.id,
        assetId: alpha.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('10'),
        quantity: new Prisma.Decimal('1'),
        tradeTime: new Date('2023-02-01T00:00:00.000Z'),
      },
    })
    const quiet = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/periods')
      .query({ year: 2024 })
      .set(auth(owner))
      .expect(200)
    expect(quiet.body.groups[0].summary).toEqual({
      sellCount: 0,
      netProceeds: '0',
      disposedCost: '0',
      realizedNetPnl: '0',
      issues: [],
    })
    expect(quiet.body.groups[0].months).toHaveLength(12)

    const noYen = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/assets')
      .query({ year: 2024, currency: 'JPY' })
      .set(auth(owner))
      .expect(200)
    expect(noYen.body).toMatchObject({
      items: [],
      total: 0,
      summary: {
        sellCount: 0,
        netProceeds: '0',
        disposedCost: '0',
        realizedNetPnl: '0',
        issues: [],
      },
    })
    const unknownAsset = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/trades')
      .query({ year: 2024, currency: 'TWD', assetId: randomUUID() })
      .set(auth(owner))
      .expect(200)
    expect(unknownAsset.body.items).toEqual([])
    expect(unknownAsset.body.summary.sellCount).toBe(0)
  })

  it('merges same-currency accounts and excludes a trade that has not happened yet', async () => {
    const owner = await user('realized-scope@trackvest.local')
    const first = await account(owner.id, 'TWD 1', Currency.TWD)
    const second = await account(owner.id, 'TWD 2', Currency.TWD)
    const alpha = await asset('E2E-RP-MERGE', 'Merge')
    await matchedSell({
      account: first,
      asset: alpha,
      buyTime: new Date('2024-01-01T00:00:00.000Z'),
      sellTime: new Date('2024-03-01T00:00:00.000Z'),
      buyAmount: '4',
      buyQuantity: '1',
      sellAmount: '10',
      sellQuantity: '1',
      unitCost: '4',
    })
    await matchedSell({
      account: second,
      asset: alpha,
      buyTime: new Date('2024-01-02T00:00:00.000Z'),
      sellTime: new Date('2024-03-02T00:00:00.000Z'),
      buyAmount: '5',
      buyQuantity: '1',
      sellAmount: '15',
      sellQuantity: '1',
      unitCost: '5',
    })

    const merged = await request(app.getHttpServer())
      .get('/portfolio/performance/realized/assets')
      .query({ year: 2024, month: 3, currency: 'TWD' })
      .set(auth(owner))
      .expect(200)
    expect(merged.body.summary).toMatchObject({
      sellCount: 2,
      netProceeds: '25',
      realizedNetPnl: '16',
    })
    expect(merged.body.items).toHaveLength(1)

    const now = new Date()
    const later = new Date(now.getTime() + 60 * 60 * 1000)
    const nowParts = taipeiParts(now)
    const laterParts = taipeiParts(later)
    if (laterParts.year === nowParts.year) {
      await matchedSell({
        account: first,
        asset: alpha,
        buyTime: new Date('2024-01-03T00:00:00.000Z'),
        sellTime: later,
        buyAmount: '1',
        buyQuantity: '1',
        sellAmount: '99',
        sellQuantity: '1',
        unitCost: '1',
      })
      const current = await request(app.getHttpServer())
        .get('/portfolio/performance/realized/periods')
        .query({ year: nowParts.year })
        .set(auth(owner))
        .expect(200)
      const annual = await request(app.getHttpServer())
        .get('/portfolio/performance/annual-realized')
        .set(auth(owner))
        .expect(200)
      const periodRow = current.body.groups.find(
        (group: { currency: string }) => group.currency === 'TWD',
      )
      const annualRow = annual.body.items.find(
        (item: { year: number; currency: string }) =>
          item.year === nowParts.year && item.currency === 'TWD',
      )
      expect(periodRow.months).toHaveLength(nowParts.month)
      expect(periodRow.months[nowParts.month - 1].isCurrentMonth).toBe(true)
      expect(current.body.asOf).toBe(current.body.generatedAt)
      expect(
        new Prisma.Decimal(annualRow.netProceeds)
          .sub(periodRow.summary.netProceeds)
          .toString(),
      ).toBe('99')
    }

    await request(app.getHttpServer())
      .get('/portfolio/performance/realized/periods')
      .query({ year: nowParts.year + 1 })
      .set(auth(owner))
      .expect(400)
    if (nowParts.month < 12) {
      await request(app.getHttpServer())
        .get('/portfolio/performance/realized/assets')
        .query({
          year: nowParts.year,
          month: nowParts.month + 1,
          currency: 'TWD',
        })
        .set(auth(owner))
        .expect(400)
    }
  })

  it('rejects invalid year, currency, pagination, and account ids', async () => {
    const owner = await user('realized-invalid@trackvest.local')
    const cookie = auth(owner)

    await request(app.getHttpServer())
      .get('/portfolio/performance/realized/periods')
      .query({ year: 1899 })
      .set(cookie)
      .expect(400)
    await request(app.getHttpServer())
      .get('/portfolio/performance/realized/assets')
      .query({ year: 2024, currency: 'GBP' })
      .set(cookie)
      .expect(400)
    await request(app.getHttpServer())
      .get('/portfolio/performance/realized/assets')
      .query({ year: 2024, currency: 'TWD', take: 0 })
      .set(cookie)
      .expect(400)
    await request(app.getHttpServer())
      .get('/portfolio/performance/realized/trades')
      .query({ year: 2024, currency: 'TWD', assetId: 'not-a-uuid' })
      .set(cookie)
      .expect(400)
    await request(app.getHttpServer())
      .get('/portfolio/performance/realized/periods')
      .query({ year: 2024, accountId: 'not-a-uuid' })
      .set(cookie)
      .expect(400)
  })
})
