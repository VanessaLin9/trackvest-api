import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { AssetType, Currency, GlAccountType } from '@prisma/client'
import * as request from 'supertest'
import type { App } from 'supertest/types'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma.service'
import {
  clearDatabase,
  createTestDatabaseConfig,
  dropTestSchema,
  prepareTestDatabase,
} from './helpers/e2e-db'

describe('Portfolio overview (e2e)', () => {
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
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
    await app.init()

    prisma = app.get(PrismaService)
  })

  beforeEach(async () => {
    await clearDatabase(prisma)
  })

  afterAll(async () => {
    if (app) {
      await app.close()
    }
    await dropTestSchema(database.adminUrl, database.schema)
    process.env.DATABASE_URL = database.baseUrl
  })

  function auth(userId: string) {
    return { 'X-User-Id': userId }
  }

  async function createTransaction(
    userId: string,
    payload: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .post('/transactions')
      .set(auth(userId))
      .send(payload)
      .expect(201)
  }

  async function createFixture() {
    const user = await prisma.user.create({
      data: {
        email: 'portfolio-e2e@trackvest.local',
        passwordHash: '!',
      },
    })

    const [twdAccount, usdAccount] = await Promise.all([
      prisma.account.create({
        data: {
          userId: user.id,
          name: 'Broker TWD',
          type: 'broker',
          currency: Currency.TWD,
          broker: 'cathay',
        },
      }),
      prisma.account.create({
        data: {
          userId: user.id,
          name: 'Broker USD',
          type: 'broker',
          currency: Currency.USD,
          broker: 'ib',
        },
      }),
    ])

    const [twdAsset, usdAsset] = await Promise.all([
      prisma.asset.create({
        data: {
          symbol: 'E2E-0050',
          name: 'E2E Taiwan 50',
          type: AssetType.etf,
          assetClass: 'equity',
          baseCurrency: 'TWD',
        },
      }),
      prisma.asset.create({
        data: {
          symbol: 'E2E-AAPL',
          name: 'E2E Apple Inc.',
          type: AssetType.equity,
          assetClass: 'equity',
          baseCurrency: 'USD',
        },
      }),
    ])

    await prisma.glAccount.createMany({
      data: [
        {
          userId: user.id,
          name: '資產-投資-股票(台幣)',
          type: GlAccountType.asset,
          currency: Currency.TWD,
        },
        {
          userId: user.id,
          name: '資產-投資-股票(美金)',
          type: GlAccountType.asset,
          currency: Currency.USD,
        },
        {
          userId: user.id,
          name: '費用-手續費',
          type: GlAccountType.expense,
          currency: Currency.TWD,
        },
        {
          userId: user.id,
          name: '收入-已實現損益-收益',
          type: GlAccountType.income,
          currency: Currency.TWD,
        },
        {
          userId: user.id,
          name: '費用-已實現損益-損失',
          type: GlAccountType.expense,
          currency: Currency.TWD,
        },
        {
          userId: user.id,
          name: '權益-投入資本',
          type: GlAccountType.equity,
          currency: Currency.TWD,
        },
      ],
    })

    await Promise.all([
      createTransaction(user.id, {
        accountId: twdAccount.id,
        assetId: twdAsset.id,
        type: 'buy',
        amount: 1000,
        quantity: 10,
        price: 100,
        fee: 0,
        tax: 0,
        tradeTime: '2026-04-01T09:30:00.000Z',
        note: 'buy twd asset',
      }),
      createTransaction(user.id, {
        accountId: usdAccount.id,
        assetId: usdAsset.id,
        type: 'buy',
        amount: 200,
        quantity: 1,
        price: 200,
        fee: 0,
        tax: 0,
        tradeTime: '2026-04-02T09:30:00.000Z',
        note: 'buy usd asset',
      }),
    ])

    await prisma.price.createMany({
      data: [
        {
          assetId: twdAsset.id,
          price: 120,
          asOf: new Date('2026-04-05T00:00:00.000Z'),
          source: 'fixture',
        },
        {
          assetId: usdAsset.id,
          price: 250,
          asOf: new Date('2026-04-05T00:00:00.000Z'),
          source: 'fixture',
        },
      ],
    })

    await prisma.fxRate.create({
      data: {
        base: 'TWD',
        quote: 'USD',
        rate: 0.03125,
        asOf: new Date('2026-04-05T00:00:00.000Z'),
      },
    })

    return {
      user,
      twdAsset,
      usdAsset,
    }
  }

  async function createRebalanceFixture() {
    const user = await prisma.user.create({
      data: {
        email: 'rebalance-e2e@trackvest.local',
        passwordHash: '!',
      },
    })

    const account = await prisma.account.create({
      data: {
        userId: user.id,
        name: 'Broker USD',
        type: 'broker',
        currency: Currency.USD,
        broker: 'ib',
      },
    })

    const [equityAsset, bondAsset] = await Promise.all([
      prisma.asset.create({
        data: {
          symbol: 'E2E-VTI',
          name: 'E2E Total Stock ETF',
          type: AssetType.etf,
          assetClass: 'equity',
          baseCurrency: 'USD',
        },
      }),
      prisma.asset.create({
        data: {
          symbol: 'E2E-BND',
          name: 'E2E Total Bond ETF',
          type: AssetType.etf,
          assetClass: 'bond',
          baseCurrency: 'USD',
        },
      }),
    ])

    await prisma.glAccount.createMany({
      data: [
        {
          userId: user.id,
          name: '資產-投資-股票(美金)',
          type: GlAccountType.asset,
          currency: Currency.USD,
        },
        {
          userId: user.id,
          name: '費用-手續費',
          type: GlAccountType.expense,
          currency: Currency.USD,
        },
        {
          userId: user.id,
          name: '收入-已實現損益-收益',
          type: GlAccountType.income,
          currency: Currency.USD,
        },
        {
          userId: user.id,
          name: '費用-已實現損益-損失',
          type: GlAccountType.expense,
          currency: Currency.USD,
        },
        {
          userId: user.id,
          name: '權益-投入資本',
          type: GlAccountType.equity,
          currency: Currency.USD,
        },
      ],
    })

    await createTransaction(user.id, {
      accountId: account.id,
      assetId: equityAsset.id,
      type: 'buy',
      amount: 700,
      quantity: 1,
      price: 700,
      fee: 0,
      tax: 0,
      tradeTime: '2026-04-01T09:30:00.000Z',
      note: 'buy equity asset',
    })

    await createTransaction(user.id, {
      accountId: account.id,
      assetId: bondAsset.id,
      type: 'buy',
      amount: 300,
      quantity: 1,
      price: 300,
      fee: 0,
      tax: 0,
      tradeTime: '2026-04-02T09:30:00.000Z',
      note: 'buy bond asset',
    })

    await prisma.price.createMany({
      data: [
        {
          assetId: equityAsset.id,
          price: 700,
          asOf: new Date('2026-04-05T00:00:00.000Z'),
          source: 'fixture',
        },
        {
          assetId: bondAsset.id,
          price: 300,
          asOf: new Date('2026-04-05T00:00:00.000Z'),
          source: 'fixture',
        },
      ],
    })

    return { user }
  }

  it('returns a live cross-currency portfolio summary and holdings snapshot', async () => {
    const { user, twdAsset, usdAsset } = await createFixture()

    const summaryResponse = await request(app.getHttpServer())
      .get('/portfolio/summary')
      .set(auth(user.id))
      .expect(200)

    expect(summaryResponse.body).toEqual({
      asOf: '2026-04-05T00:00:00.000Z',
      displayCurrencyMode: 'portfolio-default',
      requestedDisplayCurrency: null,
      effectiveDisplayCurrency: 'USD',
      baseCurrency: 'USD',
      investedCapital: 231.25,
      marketValue: 287.5,
      totalPnl: 56.25,
      totalReturnRate: 0.24324324,
      holdingsCount: 2,
    })

    const holdingsResponse = await request(app.getHttpServer())
      .get('/portfolio/holdings')
      .set(auth(user.id))
      .expect(200)

    expect(holdingsResponse.body).toEqual({
      displayCurrencyMode: 'portfolio-default',
      requestedDisplayCurrency: null,
      effectiveDisplayCurrency: 'USD',
      items: [
        {
          assetId: usdAsset.id,
          symbol: 'E2E-AAPL',
          name: 'E2E Apple Inc.',
          type: 'equity',
          assetClass: 'equity',
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
          lastActivitySummary: 'buy usd asset',
        },
        {
          assetId: twdAsset.id,
          symbol: 'E2E-0050',
          name: 'E2E Taiwan 50',
          type: 'etf',
          assetClass: 'equity',
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
          lastActivitySummary: 'buy twd asset',
        },
      ],
      allocationByType: [
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
      ],
      allocationByAssetClass: [
        {
          assetClass: 'equity',
          marketValue: 287.5,
          weight: 1,
        },
      ],
    })
  })

  it('returns requested display currency metadata and normalized values', async () => {
    const { user, twdAsset, usdAsset } = await createFixture()

    await prisma.fxRate.create({
      data: {
        base: 'USD',
        quote: 'TWD',
        rate: 32,
        asOf: new Date('2026-04-05T00:00:00.000Z'),
      },
    })

    const summaryResponse = await request(app.getHttpServer())
      .get('/portfolio/summary')
      .query({ preferredBaseCurrency: 'TWD' })
      .set(auth(user.id))
      .expect(200)

    expect(summaryResponse.body).toEqual({
      asOf: '2026-04-05T00:00:00.000Z',
      displayCurrencyMode: 'preferred-base',
      requestedDisplayCurrency: 'TWD',
      effectiveDisplayCurrency: 'TWD',
      baseCurrency: 'TWD',
      investedCapital: 7400,
      marketValue: 9200,
      totalPnl: 1800,
      totalReturnRate: 0.24324324,
      holdingsCount: 2,
    })

    const holdingsResponse = await request(app.getHttpServer())
      .get('/portfolio/holdings')
      .query({ preferredBaseCurrency: 'TWD' })
      .set(auth(user.id))
      .expect(200)

    expect(holdingsResponse.body).toEqual({
      displayCurrencyMode: 'preferred-base',
      requestedDisplayCurrency: 'TWD',
      effectiveDisplayCurrency: 'TWD',
      items: [
        {
          assetId: usdAsset.id,
          symbol: 'E2E-AAPL',
          name: 'E2E Apple Inc.',
          type: 'equity',
          assetClass: 'equity',
          quantity: 1,
          avgCost: 6400,
          latestPrice: 250,
          latestPriceCurrency: 'USD',
          assetBaseCurrency: 'USD',
          investedAmount: 6400,
          marketValue: 8000,
          pnl: 1600,
          returnRate: 0.25,
          weight: 0.86956522,
          lastActivitySummary: 'buy usd asset',
        },
        {
          assetId: twdAsset.id,
          symbol: 'E2E-0050',
          name: 'E2E Taiwan 50',
          type: 'etf',
          assetClass: 'equity',
          quantity: 10,
          avgCost: 100,
          latestPrice: 120,
          latestPriceCurrency: 'TWD',
          assetBaseCurrency: 'TWD',
          investedAmount: 1000,
          marketValue: 1200,
          pnl: 200,
          returnRate: 0.2,
          weight: 0.13043478,
          lastActivitySummary: 'buy twd asset',
        },
      ],
      allocationByType: [
        {
          type: 'equity',
          marketValue: 8000,
          weight: 0.86956522,
        },
        {
          type: 'etf',
          marketValue: 1200,
          weight: 0.13043478,
        },
      ],
      allocationByAssetClass: [
        {
          assetClass: 'equity',
          marketValue: 9200,
          weight: 1,
        },
      ],
    })
  })

  it('returns rebalance metrics for equity and bond holdings', async () => {
    const { user } = await createRebalanceFixture()

    const rebalanceResponse = await request(app.getHttpServer())
      .get('/portfolio/rebalance')
      .set(auth(user.id))
      .expect(200)

    expect(rebalanceResponse.body).toEqual({
      asOf: expect.any(String),
      displayCurrencyMode: 'portfolio-default',
      requestedDisplayCurrency: null,
      effectiveDisplayCurrency: 'USD',
      baseCurrency: 'USD',
      targets: {
        equity: 0.8,
        bond: 0.2,
      },
      current: {
        equity: 0.7,
        bond: 0.3,
      },
      gaps: {
        equity: 0.1,
        bond: -0.1,
      },
      marketValueByAssetClass: {
        equity: 700,
        bond: 300,
      },
      recommendedBuyAmountByAssetClass: {
        equity: 500,
        bond: 0,
      },
      trackedMarketValue: 1000,
      suggestions: [
        {
          assetClass: 'equity',
          assetId: expect.any(String),
          symbol: 'E2E-VTI',
          name: 'E2E Total Stock ETF',
          currentMarketValue: 700,
          currentWeightWithinAssetClass: 1,
          suggestedBuyAmount: 500,
          estimatedQuantity: 0.71428571,
          latestPrice: 700,
          latestPriceCurrency: 'USD',
        },
      ],
      notes: [
        'Recommended buy amounts assume a buy-only rebalance and do not suggest selling.',
        'Suggestions are distributed across existing holdings based on current market value within each asset class.',
        'Estimated quantities are approximate and do not account for broker lot-size constraints.',
      ],
    })
  })

  it('accepts client-provided rebalance targets', async () => {
    const { user } = await createRebalanceFixture()

    const rebalanceResponse = await request(app.getHttpServer())
      .get('/portfolio/rebalance')
      .query({ targetBond: 0.4 })
      .set(auth(user.id))
      .expect(200)

    expect(rebalanceResponse.body).toEqual({
      asOf: expect.any(String),
      displayCurrencyMode: 'portfolio-default',
      requestedDisplayCurrency: null,
      effectiveDisplayCurrency: 'USD',
      baseCurrency: 'USD',
      targets: {
        equity: 0.6,
        bond: 0.4,
      },
      current: {
        equity: 0.7,
        bond: 0.3,
      },
      gaps: {
        equity: -0.1,
        bond: 0.1,
      },
      marketValueByAssetClass: {
        equity: 700,
        bond: 300,
      },
      recommendedBuyAmountByAssetClass: {
        equity: 0,
        bond: 166.66666667,
      },
      trackedMarketValue: 1000,
      suggestions: [
        {
          assetClass: 'bond',
          assetId: expect.any(String),
          symbol: 'E2E-BND',
          name: 'E2E Total Bond ETF',
          currentMarketValue: 300,
          currentWeightWithinAssetClass: 1,
          suggestedBuyAmount: 166.66666667,
          estimatedQuantity: 0.55555556,
          latestPrice: 300,
          latestPriceCurrency: 'USD',
        },
      ],
      notes: [
        'Recommended buy amounts assume a buy-only rebalance and do not suggest selling.',
        'Suggestions are distributed across existing holdings based on current market value within each asset class.',
        'Estimated quantities are approximate and do not account for broker lot-size constraints.',
      ],
    })
  })
})
