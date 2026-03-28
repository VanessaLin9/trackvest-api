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

describe('Transactions sell FIFO (e2e)', () => {
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

  async function createFixture() {
    const user = await prisma.user.create({
      data: {
        email: 'fifo-e2e@trackvest.local',
        passwordHash: '!',
      },
    })

    const account = await prisma.account.create({
      data: {
        userId: user.id,
        name: 'Broker TWD',
        type: 'broker',
        currency: Currency.TWD,
        broker: 'cathay',
      },
    })

    const asset = await prisma.asset.create({
      data: {
        symbol: 'E2E-0050',
        name: 'E2E Taiwan 50',
        type: AssetType.etf,
        baseCurrency: 'TWD',
      },
    })

    await prisma.assetAlias.create({
      data: {
        assetId: asset.id,
        alias: 'E2E 台灣50',
        broker: 'cathay',
      },
    })

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

    return { user, account, asset }
  }

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

  async function createBaseScenario(options?: {
    sellQuantity?: number
    sellPrice?: number
    sellAmount?: number
    sellFee?: number
    sellTax?: number
    sellNote?: string
  }) {
    const { user, account, asset } = await createFixture()

    const buy1 = await createTransaction(user.id, {
      accountId: account.id,
      assetId: asset.id,
      type: 'buy',
      amount: 1000,
      quantity: 10,
      price: 100,
      fee: 0,
      tax: 0,
      tradeTime: '2026-03-20T09:30:00.000Z',
      note: 'buy lot 1',
    })

    const buy2 = await createTransaction(user.id, {
      accountId: account.id,
      assetId: asset.id,
      type: 'buy',
      amount: 1200,
      quantity: 10,
      price: 120,
      fee: 0,
      tax: 0,
      tradeTime: '2026-03-21T09:30:00.000Z',
      note: 'buy lot 2',
    })

    const sellQuantity = options?.sellQuantity ?? 12
    const sellPrice = options?.sellPrice ?? 150
    const sellFee = options?.sellFee ?? 12
    const sellTax = options?.sellTax ?? 12
    const sellAmount = options?.sellAmount ?? 1776
    const sellNote = options?.sellNote ?? 'sell after two buys'

    const sell = await createTransaction(user.id, {
      accountId: account.id,
      assetId: asset.id,
      type: 'sell',
      amount: sellAmount,
      quantity: sellQuantity,
      price: sellPrice,
      fee: sellFee,
      tax: sellTax,
      tradeTime: '2026-03-22T09:30:00.000Z',
      note: sellNote,
    })

    return { user, account, asset, buy1, buy2, sell }
  }

  async function findActivePosition(accountId: string, assetId: string) {
    return prisma.position.findFirst({
      where: {
        accountId,
        assetId,
        closedAt: null,
      },
    })
  }

  async function findLots(accountId: string, assetId: string) {
    return prisma.positionLot.findMany({
      where: {
        accountId,
        assetId,
      },
      orderBy: { openedAt: 'asc' },
    })
  }

  async function findSellEntries(sellTransactionId: string) {
    const [active, archived] = await Promise.all([
      prisma.glEntry.findMany({
        where: {
          refTxId: sellTransactionId,
          isDeleted: false,
        },
        include: { lines: true },
      }),
      prisma.glEntry.findMany({
        where: {
          refTxId: sellTransactionId,
          isDeleted: true,
        },
        include: { lines: true },
      }),
    ])

    return { active, archived }
  }

  it('rebuilds sell lot matches and reposts sell GL when an earlier buy is updated', async () => {
    const { user, account, asset, buy1, sell } = await createBaseScenario()

    await request(app.getHttpServer())
      .patch(`/transactions/${buy1.body.id}`)
      .set(auth(user.id))
      .send({
        amount: 900,
        quantity: 10,
        price: 90,
        fee: 0,
        tax: 0,
        tradeTime: '2026-03-20T09:30:00.000Z',
        note: 'buy lot 1 updated',
      })
      .expect(200)

    const position = await findActivePosition(account.id, asset.id)

    expect(position).not.toBeNull()
    expect(Number(position?.quantity)).toBe(8)
    expect(Number(position?.avgCost)).toBe(120)

    const lots = await findLots(account.id, asset.id)

    expect(
      lots.map((lot) => ({
        sourceTransactionId: lot.sourceTransactionId,
        remainingQuantity: Number(lot.remainingQuantity),
        unitCost: Number(lot.unitCost),
        isClosed: lot.closedAt !== null,
      })),
    ).toEqual([
      {
        sourceTransactionId: buy1.body.id,
        remainingQuantity: 0,
        unitCost: 90,
        isClosed: true,
      },
      {
        sourceTransactionId: expect.any(String),
        remainingQuantity: 8,
        unitCost: 120,
        isClosed: false,
      },
    ])

    const sellMatches = await prisma.sellLotMatch.findMany({
      where: { sellTransactionId: sell.body.id },
      include: {
        buyLot: {
          select: {
            sourceTransactionId: true,
          },
        },
      },
    })

    expect(
      sellMatches.map((match) => ({
        quantity: Number(match.quantity),
        unitCost: Number(match.unitCost),
        sourceTransactionId: match.buyLot.sourceTransactionId,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          quantity: 10,
          unitCost: 90,
          sourceTransactionId: buy1.body.id,
        },
        {
          quantity: 2,
          unitCost: 120,
          sourceTransactionId: expect.any(String),
        },
      ]),
    )

    const { active: activeSellEntries, archived: archivedSellEntries } =
      await findSellEntries(sell.body.id)

    expect(activeSellEntries).toHaveLength(1)
    expect(archivedSellEntries).toHaveLength(1)

    const activeLineSnapshot = activeSellEntries[0].lines.map((line) => ({
      side: line.side,
      amount: Number(line.amount),
      note: line.note,
    }))

    expect(activeLineSnapshot).toEqual(
      expect.arrayContaining([
        { side: 'debit', amount: 1776, note: 'sell proceeds in' },
        { side: 'credit', amount: 1140, note: 'sell cost basis out' },
        { side: 'debit', amount: 24, note: 'sell fee and tax' },
        { side: 'credit', amount: 660, note: 'realized gain' },
      ]),
    )
  })

  it('rebuilds lot matches and reposts GL when a sell transaction is updated', async () => {
    const { user, account, asset, buy1, sell } = await createBaseScenario()

    await request(app.getHttpServer())
      .patch(`/transactions/${sell.body.id}`)
      .set(auth(user.id))
      .send({
        amount: 1176,
        quantity: 8,
        price: 150,
        fee: 12,
        tax: 12,
        tradeTime: '2026-03-22T09:30:00.000Z',
        note: 'sell updated to smaller quantity',
      })
      .expect(200)

    const position = await findActivePosition(account.id, asset.id)
    expect(position).not.toBeNull()
    expect(Number(position?.quantity)).toBe(12)
    expect(Number(position?.avgCost)).toBeCloseTo(116.6666666667, 8)

    const lots = await findLots(account.id, asset.id)
    expect(
      lots.map((lot) => ({
        sourceTransactionId: lot.sourceTransactionId,
        remainingQuantity: Number(lot.remainingQuantity),
        unitCost: Number(lot.unitCost),
        isClosed: lot.closedAt !== null,
      })),
    ).toEqual([
      {
        sourceTransactionId: buy1.body.id,
        remainingQuantity: 2,
        unitCost: 100,
        isClosed: false,
      },
      {
        sourceTransactionId: expect.any(String),
        remainingQuantity: 10,
        unitCost: 120,
        isClosed: false,
      },
    ])

    const sellMatches = await prisma.sellLotMatch.findMany({
      where: { sellTransactionId: sell.body.id },
      include: {
        buyLot: {
          select: { sourceTransactionId: true },
        },
      },
    })
    expect(sellMatches).toHaveLength(1)
    expect(Number(sellMatches[0].quantity)).toBe(8)
    expect(Number(sellMatches[0].unitCost)).toBe(100)
    expect(sellMatches[0].buyLot.sourceTransactionId).toBe(buy1.body.id)

    const { active, archived } = await findSellEntries(sell.body.id)
    expect(active).toHaveLength(1)
    expect(archived).toHaveLength(1)
    expect(
      active[0].lines.map((line) => ({
        side: line.side,
        amount: Number(line.amount),
        note: line.note,
      })),
    ).toEqual(
      expect.arrayContaining([
        { side: 'debit', amount: 1176, note: 'sell proceeds in' },
        { side: 'credit', amount: 800, note: 'sell cost basis out' },
        { side: 'debit', amount: 24, note: 'sell fee and tax' },
        { side: 'credit', amount: 400, note: 'realized gain' },
      ]),
    )
  })

  it('restores the position and archives sell GL when a sell transaction is soft deleted', async () => {
    const { user, account, asset, sell } = await createBaseScenario()

    await request(app.getHttpServer())
      .delete(`/transactions/${sell.body.id}`)
      .set(auth(user.id))
      .expect(200)

    const position = await findActivePosition(account.id, asset.id)
    expect(position).not.toBeNull()
    expect(Number(position?.quantity)).toBe(20)
    expect(Number(position?.avgCost)).toBe(110)

    const lots = await findLots(account.id, asset.id)
    expect(
      lots.map((lot) => ({
        remainingQuantity: Number(lot.remainingQuantity),
        unitCost: Number(lot.unitCost),
        isClosed: lot.closedAt !== null,
      })),
    ).toEqual([
      { remainingQuantity: 10, unitCost: 100, isClosed: false },
      { remainingQuantity: 10, unitCost: 120, isClosed: false },
    ])

    const sellMatches = await prisma.sellLotMatch.findMany({
      where: { sellTransactionId: sell.body.id },
    })
    expect(sellMatches).toHaveLength(0)

    const { active, archived } = await findSellEntries(sell.body.id)
    expect(active).toHaveLength(0)
    expect(archived).toHaveLength(1)

    const persistedSell = await prisma.transaction.findUniqueOrThrow({
      where: { id: sell.body.id },
    })
    expect(persistedSell.isDeleted).toBe(true)
  })

  it('restores the position and archives sell GL when a sell transaction is hard deleted', async () => {
    const { user, account, asset, sell } = await createBaseScenario()

    await request(app.getHttpServer())
      .delete(`/transactions/${sell.body.id}/hard`)
      .set(auth(user.id))
      .expect(200)

    const position = await findActivePosition(account.id, asset.id)
    expect(position).not.toBeNull()
    expect(Number(position?.quantity)).toBe(20)
    expect(Number(position?.avgCost)).toBe(110)

    const lots = await findLots(account.id, asset.id)
    expect(
      lots.map((lot) => ({
        remainingQuantity: Number(lot.remainingQuantity),
        unitCost: Number(lot.unitCost),
        isClosed: lot.closedAt !== null,
      })),
    ).toEqual([
      { remainingQuantity: 10, unitCost: 100, isClosed: false },
      { remainingQuantity: 10, unitCost: 120, isClosed: false },
    ])

    const sellMatches = await prisma.sellLotMatch.findMany({
      where: { sellTransactionId: sell.body.id },
    })
    expect(sellMatches).toHaveLength(0)

    const { active, archived } = await findSellEntries(sell.body.id)
    expect(active).toHaveLength(0)
    expect(archived).toHaveLength(1)

    const persistedSell = await prisma.transaction.findUnique({
      where: { id: sell.body.id },
    })
    expect(persistedSell).toBeNull()
  })

  it('rebuilds lot matches and reposts GL when an earlier buy is soft deleted', async () => {
    const { user, account, asset, buy1, buy2, sell } = await createBaseScenario({
      sellQuantity: 8,
      sellAmount: 1176,
    })

    await request(app.getHttpServer())
      .delete(`/transactions/${buy1.body.id}`)
      .set(auth(user.id))
      .expect(200)

    const position = await findActivePosition(account.id, asset.id)
    expect(position).not.toBeNull()
    expect(Number(position?.quantity)).toBe(2)
    expect(Number(position?.avgCost)).toBe(120)

    const lots = await findLots(account.id, asset.id)
    expect(
      lots.map((lot) => ({
        sourceTransactionId: lot.sourceTransactionId,
        remainingQuantity: Number(lot.remainingQuantity),
        unitCost: Number(lot.unitCost),
        isClosed: lot.closedAt !== null,
      })),
    ).toEqual([
      {
        sourceTransactionId: buy2.body.id,
        remainingQuantity: 2,
        unitCost: 120,
        isClosed: false,
      },
    ])

    const sellMatches = await prisma.sellLotMatch.findMany({
      where: { sellTransactionId: sell.body.id },
      include: {
        buyLot: {
          select: { sourceTransactionId: true },
        },
      },
    })
    expect(sellMatches).toHaveLength(1)
    expect(Number(sellMatches[0].quantity)).toBe(8)
    expect(Number(sellMatches[0].unitCost)).toBe(120)
    expect(sellMatches[0].buyLot.sourceTransactionId).toBe(buy2.body.id)

    const { active, archived } = await findSellEntries(sell.body.id)
    expect(active).toHaveLength(1)
    expect(archived).toHaveLength(1)
    expect(
      active[0].lines.map((line) => ({
        side: line.side,
        amount: Number(line.amount),
        note: line.note,
      })),
    ).toEqual(
      expect.arrayContaining([
        { side: 'debit', amount: 1176, note: 'sell proceeds in' },
        { side: 'credit', amount: 960, note: 'sell cost basis out' },
        { side: 'debit', amount: 24, note: 'sell fee and tax' },
        { side: 'credit', amount: 240, note: 'realized gain' },
      ]),
    )

    const persistedBuy1 = await prisma.transaction.findUniqueOrThrow({
      where: { id: buy1.body.id },
    })
    expect(persistedBuy1.isDeleted).toBe(true)
  })

  it('rebuilds lot matches and reposts GL when an earlier buy is hard deleted', async () => {
    const { user, account, asset, buy1, buy2, sell } = await createBaseScenario({
      sellQuantity: 8,
      sellAmount: 1176,
    })

    await request(app.getHttpServer())
      .delete(`/transactions/${buy1.body.id}/hard`)
      .set(auth(user.id))
      .expect(200)

    const position = await findActivePosition(account.id, asset.id)
    expect(position).not.toBeNull()
    expect(Number(position?.quantity)).toBe(2)
    expect(Number(position?.avgCost)).toBe(120)

    const lots = await findLots(account.id, asset.id)
    expect(
      lots.map((lot) => ({
        sourceTransactionId: lot.sourceTransactionId,
        remainingQuantity: Number(lot.remainingQuantity),
        unitCost: Number(lot.unitCost),
        isClosed: lot.closedAt !== null,
      })),
    ).toEqual([
      {
        sourceTransactionId: buy2.body.id,
        remainingQuantity: 2,
        unitCost: 120,
        isClosed: false,
      },
    ])

    const sellMatches = await prisma.sellLotMatch.findMany({
      where: { sellTransactionId: sell.body.id },
      include: {
        buyLot: {
          select: { sourceTransactionId: true },
        },
      },
    })
    expect(sellMatches).toHaveLength(1)
    expect(Number(sellMatches[0].quantity)).toBe(8)
    expect(Number(sellMatches[0].unitCost)).toBe(120)
    expect(sellMatches[0].buyLot.sourceTransactionId).toBe(buy2.body.id)

    const { active, archived } = await findSellEntries(sell.body.id)
    expect(active).toHaveLength(1)
    expect(archived).toHaveLength(1)
    expect(
      active[0].lines.map((line) => ({
        side: line.side,
        amount: Number(line.amount),
        note: line.note,
      })),
    ).toEqual(
      expect.arrayContaining([
        { side: 'debit', amount: 1176, note: 'sell proceeds in' },
        { side: 'credit', amount: 960, note: 'sell cost basis out' },
        { side: 'debit', amount: 24, note: 'sell fee and tax' },
        { side: 'credit', amount: 240, note: 'realized gain' },
      ]),
    )

    const persistedBuy1 = await prisma.transaction.findUnique({
      where: { id: buy1.body.id },
    })
    expect(persistedBuy1).toBeNull()
  })

  it('imports a sell row through the HTTP endpoint and creates FIFO matches', async () => {
    const { user, account, asset } = await createFixture()

    await request(app.getHttpServer())
      .post('/transactions')
      .set(auth(user.id))
      .send({
        accountId: account.id,
        assetId: asset.id,
        type: 'buy',
        amount: 1000,
        quantity: 10,
        price: 100,
        fee: 0,
        tax: 0,
        tradeTime: '2026-03-20T09:30:00.000Z',
        note: 'buy before import sell',
      })
      .expect(201)

    const importResponse = await request(app.getHttpServer())
      .post('/transactions/import')
      .set(auth(user.id))
      .send({
        accountId: account.id,
        csvContent: [
          ['股名', '日期', '成交股數', '淨收付', '成交單價', '手續費', '交易稅', '稅款', '委託書號', '幣別', '備註'].join('\t'),
          ['E2E 台灣50', '2026/03/21', '4', '585', '150', '10', '3', '2', 'E2E-SELL-001', 'TWD', '匯入賣出'].join('\t'),
        ].join('\n'),
      })
      .expect(201)

    expect(importResponse.body.successCount).toBe(1)
    expect(importResponse.body.failureCount).toBe(0)

    const importedSellId = importResponse.body.createdTransactionIds[0] as string
    const sellMatches = await prisma.sellLotMatch.findMany({
      where: { sellTransactionId: importedSellId },
    })
    const sellEntry = await prisma.glEntry.findFirst({
      where: {
        refTxId: importedSellId,
        isDeleted: false,
      },
      include: { lines: true },
    })

    expect(sellMatches).toHaveLength(1)
    expect(Number(sellMatches[0].quantity)).toBe(4)
    expect(Number(sellMatches[0].unitCost)).toBe(100)

    expect(sellEntry).not.toBeNull()
    expect(
      sellEntry?.lines.map((line) => ({
        side: line.side,
        amount: Number(line.amount),
        note: line.note,
      })),
    ).toEqual(
      expect.arrayContaining([
        { side: 'debit', amount: 585, note: 'sell proceeds in' },
        { side: 'credit', amount: 400, note: 'sell cost basis out' },
        { side: 'debit', amount: 15, note: 'sell fee and tax' },
        { side: 'credit', amount: 200, note: 'realized gain' },
      ]),
    )
  })
})
