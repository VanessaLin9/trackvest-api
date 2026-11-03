import { randomUUID } from 'crypto'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { AssetType, Currency, Prisma, TxType, UserRole } from '@prisma/client'
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

describe('Portfolio asset performance (e2e)', () => {
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
    const [transactions, lots, positions, matches, prices] = await Promise.all([
      prisma.transaction.count(),
      prisma.positionLot.count(),
      prisma.position.count(),
      prisma.sellLotMatch.count(),
      prisma.price.count(),
    ])
    return { transactions, lots, positions, matches, prices }
  }

  it('returns closed and open history in account currency and does not write', async () => {
    const user = await prisma.user.create({
      data: { email: 'asset-perf@trackvest.local', passwordHash: '!', role: UserRole.user },
    })
    const other = await prisma.user.create({
      data: { email: 'asset-perf-other@trackvest.local', passwordHash: '!' },
    })
    const [twd, usd, foreign] = await Promise.all([
      prisma.account.create({
        data: { userId: user.id, name: 'TWD', type: 'broker', currency: Currency.TWD },
      }),
      prisma.account.create({
        data: { userId: user.id, name: 'USD', type: 'broker', currency: Currency.USD },
      }),
      prisma.account.create({
        data: { userId: other.id, name: 'Foreign', type: 'broker', currency: Currency.TWD },
      }),
    ])
    const asset = await prisma.asset.create({
      data: {
        symbol: 'E2E-0050',
        name: 'E2E 0050',
        type: AssetType.etf,
        assetClass: 'equity',
        baseCurrency: 'TWD',
      },
    })
    const closedAsset = await prisma.asset.create({
      data: {
        symbol: 'E2E-2330',
        name: 'E2E 2330',
        type: AssetType.equity,
        assetClass: 'equity',
        baseCurrency: 'TWD',
      },
    })
    const buy = await prisma.transaction.create({
      data: {
        accountId: twd.id,
        assetId: asset.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('1050'),
        quantity: new Prisma.Decimal('10'),
        fee: new Prisma.Decimal('50'),
        tradeTime: new Date('2025-03-03T01:00:00.000Z'),
      },
    })
    const sell = await prisma.transaction.create({
      data: {
        accountId: twd.id,
        assetId: asset.id,
        type: TxType.sell,
        amount: new Prisma.Decimal('500'),
        quantity: new Prisma.Decimal('4'),
        fee: new Prisma.Decimal('10'),
        tax: new Prisma.Decimal('5'),
        tradeTime: new Date('2026-06-01T01:00:00.000Z'),
      },
    })
    await prisma.transaction.create({
      data: {
        accountId: twd.id,
        assetId: asset.id,
        type: TxType.sell,
        amount: new Prisma.Decimal('9999'),
        quantity: new Prisma.Decimal('4'),
        tradeTime: new Date('2026-07-01T01:00:00.000Z'),
        isDeleted: true,
        deletedAt: new Date('2026-07-02T00:00:00.000Z'),
      },
    })
    await prisma.transaction.create({
      data: {
        accountId: twd.id,
        assetId: asset.id,
        type: TxType.dividend,
        amount: new Prisma.Decimal('20'),
        tradeTime: new Date('2026-09-01T00:00:00.000Z'),
      },
    })
    await prisma.transaction.create({
      data: {
        accountId: twd.id,
        assetId: asset.id,
        type: TxType.dividend,
        amount: new Prisma.Decimal('500'),
        tradeTime: new Date('2026-09-02T00:00:00.000Z'),
        isDeleted: true,
      },
    })
    const lot = await prisma.positionLot.create({
      data: {
        accountId: twd.id,
        assetId: asset.id,
        sourceTransactionId: buy.id,
        originalQuantity: new Prisma.Decimal('10'),
        remainingQuantity: new Prisma.Decimal('6'),
        unitCost: new Prisma.Decimal('105'),
        openedAt: buy.tradeTime,
      },
    })
    await prisma.sellLotMatch.create({
      data: {
        sellTransactionId: sell.id,
        buyLotId: lot.id,
        quantity: new Prisma.Decimal('4'),
        unitCost: new Prisma.Decimal('105'),
      },
    })
    await prisma.position.create({
      data: {
        accountId: twd.id,
        assetId: asset.id,
        quantity: new Prisma.Decimal('6'),
        avgCost: new Prisma.Decimal('105'),
        openedAt: buy.tradeTime,
      },
    })
    const closedBuy = await prisma.transaction.create({
      data: {
        accountId: twd.id,
        assetId: closedAsset.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('1000'),
        quantity: new Prisma.Decimal('10'),
        tradeTime: new Date('2024-01-01T00:00:00.000Z'),
      },
    })
    const closedSell = await prisma.transaction.create({
      data: {
        accountId: twd.id,
        assetId: closedAsset.id,
        type: TxType.sell,
        amount: new Prisma.Decimal('900'),
        quantity: new Prisma.Decimal('10'),
        tradeTime: new Date('2024-06-01T00:00:00.000Z'),
      },
    })
    const closedLot = await prisma.positionLot.create({
      data: {
        accountId: twd.id,
        assetId: closedAsset.id,
        sourceTransactionId: closedBuy.id,
        originalQuantity: new Prisma.Decimal('10'),
        remainingQuantity: new Prisma.Decimal('0'),
        unitCost: new Prisma.Decimal('100'),
        openedAt: closedBuy.tradeTime,
        closedAt: closedSell.tradeTime,
      },
    })
    await prisma.sellLotMatch.create({
      data: {
        sellTransactionId: closedSell.id,
        buyLotId: closedLot.id,
        quantity: new Prisma.Decimal('10'),
        unitCost: new Prisma.Decimal('100'),
      },
    })
    const usdBuy = await prisma.transaction.create({
      data: {
        accountId: usd.id,
        assetId: asset.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('20'),
        quantity: new Prisma.Decimal('1'),
        tradeTime: new Date('2025-05-01T00:00:00.000Z'),
      },
    })
    await prisma.positionLot.create({
      data: {
        accountId: usd.id,
        assetId: asset.id,
        sourceTransactionId: usdBuy.id,
        originalQuantity: new Prisma.Decimal('1'),
        remainingQuantity: new Prisma.Decimal('1'),
        unitCost: new Prisma.Decimal('20'),
        openedAt: usdBuy.tradeTime,
      },
    })
    await prisma.position.create({
      data: {
        accountId: usd.id,
        assetId: asset.id,
        quantity: new Prisma.Decimal('1'),
        avgCost: new Prisma.Decimal('20'),
        openedAt: usdBuy.tradeTime,
      },
    })
    await prisma.transaction.create({
      data: {
        accountId: foreign.id,
        assetId: asset.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('1'),
        quantity: new Prisma.Decimal('1'),
        tradeTime: new Date('2025-01-01T00:00:00.000Z'),
      },
    })
    await prisma.price.createMany({
      data: [
        {
          assetId: asset.id,
          asOf: new Date('2026-10-31T00:00:00.000Z'),
          source: 'seed',
          price: new Prisma.Decimal('1'),
        },
        {
          assetId: asset.id,
          asOf: new Date('2026-10-30T00:00:00.000Z'),
          source: 'finmind',
          price: new Prisma.Decimal('120'),
        },
      ],
    })

    const before = await counts()
    const response = await request(app.getHttpServer())
      .get('/portfolio/performance/assets')
      .set(auth(user))
      .expect(200)
    expect(await counts()).toEqual(before)

    expect(response.body.generatedAt).toEqual(expect.any(String))
    expect(response.body.items).toEqual([
      expect.objectContaining({
        symbol: 'E2E-0050',
        currency: 'TWD',
        status: 'holding',
        quantity: '6',
        realizedQuantity: '4',
        realizedNetPnl: '80',
        remainingCost: '630',
        latestPrice: '120',
        priceSource: 'finmind',
        priceAsOf: '2026-10-30T00:00:00.000Z',
        unrealizedPnl: '90',
        tradeNetPnl: '170',
        recordedDividendAmount: '20',
        recordedDividendCount: 1,
        lastTradeAt: '2026-06-01T01:00:00.000Z',
        issues: [],
      }),
      expect.objectContaining({
        symbol: 'E2E-0050',
        currency: 'USD',
        quantity: '1',
        realizedQuantity: '0',
        latestPrice: null,
        unrealizedPnl: null,
        issues: ['CURRENCY_MISMATCH'],
      }),
      expect.objectContaining({
        symbol: 'E2E-2330',
        status: 'closed',
        quantity: '0',
        realizedQuantity: '10',
        realizedNetPnl: '-100',
        unrealizedPnl: '0',
        latestPrice: null,
        issues: [],
      }),
    ])

    const scoped = await request(app.getHttpServer())
      .get('/portfolio/performance/assets')
      .query({ accountId: usd.id })
      .set(auth(user))
      .expect(200)
    expect(scoped.body.items).toHaveLength(1)
    expect(scoped.body.items[0].currency).toBe('USD')
  })

  it('reads post-split lot decimals and rounds half up after aggregation', async () => {
    const user = await prisma.user.create({
      data: { email: 'asset-split@trackvest.local', passwordHash: '!' },
    })
    const account = await prisma.account.create({
      data: { userId: user.id, name: 'TWD', type: 'broker', currency: Currency.TWD },
    })
    const asset = await prisma.asset.create({
      data: {
        symbol: 'E2E-SPLIT',
        name: 'Split',
        type: AssetType.equity,
        assetClass: 'equity',
        baseCurrency: 'TWD',
      },
    })
    const buy = await prisma.transaction.create({
      data: {
        accountId: account.id,
        assetId: asset.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('1000'),
        quantity: new Prisma.Decimal('10'),
        tradeTime: new Date('2025-01-01T00:00:00.000Z'),
      },
    })
    await prisma.positionLot.create({
      data: {
        accountId: account.id,
        assetId: asset.id,
        sourceTransactionId: buy.id,
        originalQuantity: new Prisma.Decimal('1'),
        remainingQuantity: new Prisma.Decimal('1'),
        unitCost: new Prisma.Decimal('1.000000015'),
        openedAt: buy.tradeTime,
      },
    })
    await prisma.position.create({
      data: {
        accountId: account.id,
        assetId: asset.id,
        quantity: new Prisma.Decimal('1'),
        avgCost: new Prisma.Decimal('1.000000015'),
        openedAt: buy.tradeTime,
      },
    })
    await prisma.price.create({
      data: {
        assetId: asset.id,
        asOf: new Date('2026-10-30T00:00:00.000Z'),
        source: 'finmind',
        price: new Prisma.Decimal('2'),
      },
    })

    const response = await request(app.getHttpServer())
      .get('/portfolio/performance/assets')
      .set(auth(user))
      .expect(200)

    expect(response.body.items[0]).toMatchObject({
      quantity: '1',
      remainingCost: '1.00000002',
      unrealizedPnl: '0.99999999',
      tradeNetPnl: '0.99999999',
      issues: [],
    })
  })

  it('uses an older positive quote when a newer price is numeric NaN', async () => {
    const user = await prisma.user.create({
      data: { email: 'asset-nan@trackvest.local', passwordHash: '!' },
    })
    const account = await prisma.account.create({
      data: { userId: user.id, name: 'TWD', type: 'broker', currency: Currency.TWD },
    })
    const asset = await prisma.asset.create({
      data: {
        symbol: 'E2E-NAN',
        name: 'NaN quote',
        type: AssetType.equity,
        assetClass: 'equity',
        baseCurrency: 'TWD',
      },
    })
    const buy = await prisma.transaction.create({
      data: {
        accountId: account.id,
        assetId: asset.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('1000'),
        quantity: new Prisma.Decimal('10'),
        tradeTime: new Date('2025-01-01T00:00:00.000Z'),
      },
    })
    await prisma.positionLot.create({
      data: {
        accountId: account.id,
        assetId: asset.id,
        sourceTransactionId: buy.id,
        originalQuantity: new Prisma.Decimal('10'),
        remainingQuantity: new Prisma.Decimal('10'),
        unitCost: new Prisma.Decimal('100'),
        openedAt: buy.tradeTime,
      },
    })
    await prisma.position.create({
      data: {
        accountId: account.id,
        assetId: asset.id,
        quantity: new Prisma.Decimal('10'),
        avgCost: new Prisma.Decimal('100'),
        openedAt: buy.tradeTime,
      },
    })
    await prisma.price.create({
      data: {
        assetId: asset.id,
        asOf: new Date('2026-10-30T00:00:00.000Z'),
        source: 'finmind',
        price: new Prisma.Decimal('120'),
      },
    })
    await prisma.$executeRaw`
      INSERT INTO "Price" ("id", "assetId", "asOf", "source", "price")
      VALUES (
        ${randomUUID()}::uuid,
        ${asset.id}::uuid,
        ${new Date('2026-10-31T00:00:00.000Z')},
        'finmind',
        'NaN'::numeric
      )
    `

    const response = await request(app.getHttpServer())
      .get('/portfolio/performance/assets')
      .set(auth(user))
      .expect(200)

    expect(response.body.items[0]).toMatchObject({
      latestPrice: '120',
      priceAsOf: '2026-10-30T00:00:00.000Z',
      priceSource: 'finmind',
      unrealizedPnl: '200',
      issues: [],
    })
  })

  it('reports missing fifo, missing price, and inconsistent lots without dropping the other row', async () => {
    const user = await prisma.user.create({
      data: { email: 'asset-issues@trackvest.local', passwordHash: '!' },
    })
    const account = await prisma.account.create({
      data: { userId: user.id, name: 'TWD', type: 'broker', currency: Currency.TWD },
    })
    const [broken, healthy] = await Promise.all([
      prisma.asset.create({
        data: {
          symbol: 'E2E-BROKEN',
          name: 'Broken',
          type: AssetType.equity,
          assetClass: 'equity',
          baseCurrency: 'TWD',
        },
      }),
      prisma.asset.create({
        data: {
          symbol: 'E2E-OK',
          name: 'Ok',
          type: AssetType.equity,
          assetClass: 'equity',
          baseCurrency: 'TWD',
        },
      }),
    ])
    const brokenBuy = await prisma.transaction.create({
      data: {
        accountId: account.id,
        assetId: broken.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('1000'),
        quantity: new Prisma.Decimal('10'),
        tradeTime: new Date('2025-01-01T00:00:00.000Z'),
      },
    })
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        assetId: broken.id,
        type: TxType.sell,
        amount: new Prisma.Decimal('400'),
        quantity: new Prisma.Decimal('4'),
        tradeTime: new Date('2025-06-01T00:00:00.000Z'),
      },
    })
    await prisma.positionLot.create({
      data: {
        accountId: account.id,
        assetId: broken.id,
        sourceTransactionId: brokenBuy.id,
        originalQuantity: new Prisma.Decimal('10'),
        remainingQuantity: new Prisma.Decimal('8'),
        unitCost: new Prisma.Decimal('100'),
        openedAt: brokenBuy.tradeTime,
      },
    })
    await prisma.position.create({
      data: {
        accountId: account.id,
        assetId: broken.id,
        quantity: new Prisma.Decimal('10'),
        avgCost: new Prisma.Decimal('100'),
        openedAt: brokenBuy.tradeTime,
      },
    })
    const okBuy = await prisma.transaction.create({
      data: {
        accountId: account.id,
        assetId: healthy.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('50'),
        quantity: new Prisma.Decimal('1'),
        tradeTime: new Date('2025-02-01T00:00:00.000Z'),
      },
    })
    await prisma.positionLot.create({
      data: {
        accountId: account.id,
        assetId: healthy.id,
        sourceTransactionId: okBuy.id,
        originalQuantity: new Prisma.Decimal('1'),
        remainingQuantity: new Prisma.Decimal('1'),
        unitCost: new Prisma.Decimal('50'),
        openedAt: okBuy.tradeTime,
      },
    })
    await prisma.position.create({
      data: {
        accountId: account.id,
        assetId: healthy.id,
        quantity: new Prisma.Decimal('1'),
        avgCost: new Prisma.Decimal('50'),
        openedAt: okBuy.tradeTime,
      },
    })
    await prisma.price.create({
      data: {
        assetId: broken.id,
        asOf: new Date('2026-10-30T00:00:00.000Z'),
        source: 'seed',
        price: new Prisma.Decimal('120'),
      },
    })

    const response = await request(app.getHttpServer())
      .get('/portfolio/performance/assets')
      .set(auth(user))
      .expect(200)

    expect(response.body.items).toEqual([
      expect.objectContaining({
        symbol: 'E2E-BROKEN',
        quantity: '8',
        realizedQuantity: null,
        realizedNetPnl: null,
        remainingCost: null,
        latestPrice: null,
        unrealizedPnl: null,
        issues: ['MISSING_FIFO', 'MISSING_PRICE', 'INCONSISTENT_LOTS'],
      }),
      expect.objectContaining({
        symbol: 'E2E-OK',
        quantity: '1',
        realizedQuantity: '0',
        realizedNetPnl: '0',
        remainingCost: '50',
        issues: ['MISSING_PRICE'],
      }),
    ])
  })

  it('rejects another user, including an admin, and an unknown account', async () => {
    const owner = await prisma.user.create({
      data: { email: 'asset-owner@trackvest.local', passwordHash: '!' },
    })
    const intruder = await prisma.user.create({
      data: { email: 'asset-admin@trackvest.local', passwordHash: '!', role: UserRole.admin },
    })
    const account = await prisma.account.create({
      data: { userId: owner.id, name: 'Owner', type: 'broker', currency: Currency.TWD },
    })
    const asset = await prisma.asset.create({
      data: {
        symbol: 'E2E-OWN',
        name: 'Owned',
        type: AssetType.equity,
        assetClass: 'equity',
        baseCurrency: 'TWD',
      },
    })
    const buy = await prisma.transaction.create({
      data: {
        accountId: account.id,
        assetId: asset.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('10'),
        quantity: new Prisma.Decimal('1'),
        tradeTime: new Date('2025-01-01T00:00:00.000Z'),
      },
    })
    await prisma.positionLot.create({
      data: {
        accountId: account.id,
        assetId: asset.id,
        sourceTransactionId: buy.id,
        originalQuantity: new Prisma.Decimal('1'),
        remainingQuantity: new Prisma.Decimal('1'),
        unitCost: new Prisma.Decimal('10'),
        openedAt: buy.tradeTime,
      },
    })
    await prisma.position.create({
      data: {
        accountId: account.id,
        assetId: asset.id,
        quantity: new Prisma.Decimal('1'),
        avgCost: new Prisma.Decimal('10'),
        openedAt: buy.tradeTime,
      },
    })

    const leaked = await request(app.getHttpServer())
      .get('/portfolio/performance/assets')
      .set(auth({ id: intruder.id, role: UserRole.admin }))
      .expect(200)
    expect(leaked.body.items).toEqual([])

    await request(app.getHttpServer())
      .get('/portfolio/performance/assets')
      .query({ accountId: account.id })
      .set(auth({ id: intruder.id, role: UserRole.admin }))
      .expect(403)

    await request(app.getHttpServer())
      .get('/portfolio/performance/assets')
      .query({ accountId: '11111111-1111-4111-8111-111111111111' })
      .set(auth(owner))
      .expect(403)

    await request(app.getHttpServer())
      .get('/portfolio/performance/assets')
      .query({ accountId: 'not-a-uuid' })
      .set(auth(owner))
      .expect(400)

    await request(app.getHttpServer())
      .get('/portfolio/performance/assets')
      .expect(401)
  })

  it('returns annual buy allocation for the caller and hides another user', async () => {
    const owner = await prisma.user.create({
      data: { email: 'annual-buys@trackvest.local', passwordHash: '!', role: UserRole.user },
    })
    const intruder = await prisma.user.create({
      data: { email: 'annual-buys-other@trackvest.local', passwordHash: '!', role: UserRole.admin },
    })
    const account = await prisma.account.create({
      data: { userId: owner.id, name: 'TWD', type: 'broker', currency: Currency.TWD },
    })
    const equity = await prisma.asset.create({
      data: {
        symbol: 'E2E-EQUITY',
        name: 'E2E equity',
        type: AssetType.equity,
        assetClass: 'equity',
        baseCurrency: 'TWD',
      },
    })
    const etf = await prisma.asset.create({
      data: {
        symbol: 'E2E-ETF',
        name: 'E2E etf',
        type: AssetType.etf,
        assetClass: 'equity',
        baseCurrency: 'TWD',
      },
    })
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        assetId: equity.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('100'),
        quantity: new Prisma.Decimal('1'),
        fee: new Prisma.Decimal('5'),
        tradeTime: new Date('2024-02-01T00:00:00.000Z'),
      },
    })
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        assetId: etf.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('300'),
        quantity: new Prisma.Decimal('3'),
        tradeTime: new Date('2026-03-01T00:00:00.000Z'),
      },
    })
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        assetId: equity.id,
        type: TxType.buy,
        amount: new Prisma.Decimal('999'),
        quantity: new Prisma.Decimal('1'),
        tradeTime: new Date('2026-03-02T00:00:00.000Z'),
        isDeleted: true,
      },
    })
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        assetId: equity.id,
        type: TxType.sell,
        amount: new Prisma.Decimal('80'),
        quantity: new Prisma.Decimal('1'),
        tradeTime: new Date('2026-03-03T00:00:00.000Z'),
      },
    })
    const before = await counts()

    const response = await request(app.getHttpServer())
      .get('/portfolio/performance/annual-buys')
      .set(auth(owner))
      .expect(200)

    const twd2026 = response.body.items.find((item: { year: number; currency: string }) => item.year === 2026 && item.currency === 'TWD')
    const twd2024 = response.body.items.find((item: { year: number; currency: string }) => item.year === 2024 && item.currency === 'TWD')
    expect(response.body.timeZone).toBe('Asia/Taipei')
    expect(twd2026).toMatchObject({
      buyAmount: '300',
      sellNetProceeds: '80',
      buyMinusSellProceeds: '220',
      types: [{ type: 'etf', buyAmount: '300', share: '1' }],
    })
    expect(twd2026.months.find((month: { month: number }) => month.month === 3).buyAmount).toBe('300')
    expect(twd2024).toMatchObject({
      buyAmount: '100',
      types: [{ type: 'equity', buyAmount: '100', share: '1' }],
    })
    expect(twd2024.months).toHaveLength(12)
    expect(await counts()).toEqual(before)

    const hidden = await request(app.getHttpServer())
      .get('/portfolio/performance/annual-buys')
      .set(auth(intruder))
      .expect(200)
    expect(hidden.body.items).toEqual([])

    await request(app.getHttpServer())
      .get('/portfolio/performance/annual-buys')
      .query({ accountId: account.id })
      .set(auth(intruder))
      .expect(403)
  })
})
