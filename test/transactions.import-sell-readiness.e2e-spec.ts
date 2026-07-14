/**
 * Branch 3: import sell-readiness contract (e2e).
 *
 * Preview and commit share one chronological plan. Ready rows write in
 * planner order; sell readiness failures are typed preview errors.
 */
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { AssetType, Currency, GlAccountPurpose, GlAccountType } from '@prisma/client'
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

describe('Transaction import sell-readiness (e2e)', () => {
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
    if (app) {
      await app.close()
    }
    await dropTestSchema(database.adminUrl, database.schema)
    process.env.DATABASE_URL = database.baseUrl
  })

  function buildCsv(dataRows: string[][]): string {
    const headers = [
      '股名',
      '日期',
      '成交股數',
      '淨收付',
      '成交單價',
      '手續費',
      '交易稅',
      '稅款',
      '委託書號',
      '幣別',
      '備註',
    ]
    return [headers.join(','), ...dataRows.map((row) => row.join(','))].join('\n')
  }

  async function createImportFixture() {
    const user = await prisma.user.create({
      data: {
        email: `import-sell-ready-${Date.now()}@trackvest.local`,
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
        symbol: 'E2E-2330',
        name: 'E2E TSMC',
        type: AssetType.equity,
        assetClass: 'equity',
        baseCurrency: 'TWD',
      },
    })

    await prisma.assetAlias.create({
      data: {
        assetId: asset.id,
        alias: 'E2E台積電',
        broker: 'cathay',
      },
    })

    await prisma.glAccount.createMany({
      data: [
        {
          userId: user.id,
          name: '資產-投資-股票(台幣)',
          type: GlAccountType.asset,
          purpose: GlAccountPurpose.investment_bucket,
          currency: Currency.TWD,
        },
        {
          userId: user.id,
          name: '費用-手續費',
          type: GlAccountType.expense,
          purpose: GlAccountPurpose.fee_expense,
          currency: Currency.TWD,
        },
        {
          userId: user.id,
          name: '收入-已實現損益-收益',
          type: GlAccountType.income,
          purpose: GlAccountPurpose.realized_gain_income,
          currency: Currency.TWD,
        },
        {
          userId: user.id,
          name: '費用-已實現損益-損失',
          type: GlAccountType.expense,
          purpose: GlAccountPurpose.realized_loss_expense,
          currency: Currency.TWD,
        },
        {
          userId: user.id,
          name: '權益-投入資本',
          type: GlAccountType.equity,
          purpose: GlAccountPurpose.equity_contribution,
          currency: Currency.TWD,
        },
      ],
    })

    return { user, account, asset }
  }

  function auth(userId: string) {
    return { Cookie: authCookieFor(app, { id: userId }) }
  }

  function previewImport(userId: string, accountId: string, csvContent: string) {
    return request(app.getHttpServer())
      .post('/transactions/import/preview')
      .set(auth(userId))
      .send({ accountId, csvContent })
  }

  function commitImport(userId: string, accountId: string, csvContent: string) {
    return request(app.getHttpServer())
      .post('/transactions/import/commit')
      .set(auth(userId))
      .send({ accountId, csvContent })
  }

  async function seedBuyViaApi(params: {
    userId: string
    accountId: string
    assetId: string
    quantity: number
    price: number
    tradeTime: string
    brokerOrderNo: string
  }) {
    const amount = params.quantity * params.price
    return request(app.getHttpServer())
      .post('/transactions')
      .set(auth(params.userId))
      .send({
        accountId: params.accountId,
        assetId: params.assetId,
        type: 'buy',
        amount,
        quantity: params.quantity,
        price: params.price,
        fee: 0,
        tax: 0,
        brokerOrderNo: params.brokerOrderNo,
        tradeTime: params.tradeTime,
        note: 'seed-buy',
      })
      .expect(201)
  }

  it('newest-first CSV: earlier buy + later sell — preview ready and commit succeeds', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SELL-FIRST', '台幣', 'sell'],
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'BUY-LATER', '台幣', 'buy'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body).toEqual(
      expect.objectContaining({
        canCommit: true,
        readyCount: 2,
        errorCount: 0,
        writeOrderRowNumbers: [3, 2],
      }),
    )

    const commit = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(commit.body).toEqual(
      expect.objectContaining({
        successCount: 2,
        skippedCount: 0,
        failureCount: 0,
      }),
    )

    const txs = await prisma.transaction.findMany({
      where: { accountId: account.id },
      orderBy: [{ tradeTime: 'asc' }, { id: 'asc' }],
      select: { brokerOrderNo: true, type: true },
    })
    expect(txs).toEqual([
      { brokerOrderNo: 'BUY-LATER', type: 'buy' },
      { brokerOrderNo: 'SELL-FIRST', type: 'sell' },
    ])
  })

  it('DB history outside the file funds a later imported sell', async () => {
    const { user, account, asset } = await createImportFixture()

    await seedBuyViaApi({
      userId: user.id,
      accountId: account.id,
      assetId: asset.id,
      quantity: 10,
      price: 400,
      tradeTime: '2020-09-28T00:00:00.000Z',
      brokerOrderNo: 'DB-BUY-PRIOR',
    })

    const csvContent = buildCsv([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'IMP-SELL', '台幣', 'funded'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body.canCommit).toBe(true)
    expect(preview.body.readyCount).toBe(1)

    const commit = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(commit.body.successCount).toBe(1)
    expect(
      await prisma.transaction.count({
        where: { accountId: account.id, brokerOrderNo: 'IMP-SELL' },
      }),
    ).toBe(1)
  })

  it('orphan sell → SELL_HISTORY_REQUIRED and no writes', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'ORPHAN-SELL', '台幣', 'no-history'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body).toEqual(
      expect.objectContaining({
        canCommit: false,
        readyCount: 0,
        errorCount: 1,
      }),
    )
    expect(preview.body.rows[0].errors[0].code).toBe('SELL_HISTORY_REQUIRED')

    await commitImport(user.id, account.id, csvContent).expect(400)
    expect(await prisma.transaction.count({ where: { accountId: account.id } })).toBe(0)
  })

  it('genuine oversell → SELL_INSUFFICIENT_LOTS and no writes', async () => {
    const { user, account, asset } = await createImportFixture()

    await seedBuyViaApi({
      userId: user.id,
      accountId: account.id,
      assetId: asset.id,
      quantity: 3,
      price: 400,
      tradeTime: '2020-09-28T00:00:00.000Z',
      brokerOrderNo: 'DB-BUY-SMALL',
    })

    const csvContent = buildCsv([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'OVERSELL', '台幣', 'oversell'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body.canCommit).toBe(false)
    expect(preview.body.rows[0].errors[0].code).toBe('SELL_INSUFFICIENT_LOTS')

    const commit = await commitImport(user.id, account.id, csvContent).expect(400)
    expect(commit.body.errorCode).toBe('COMMIT_NOT_ALLOWED_WITH_ERRORS')
    expect(commit.body.successCount).toBe(0)
    expect(
      await prisma.transaction.count({
        where: { accountId: account.id, brokerOrderNo: 'OVERSELL' },
      }),
    ).toBe(0)
  })

  it('same-day sell depending only on same-day buy → SELL_SAME_DAY_ORDER_AMBIGUOUS', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SAME-DAY-SELL', '台幣', 'sell'],
      ['E2E台積電', '2022/01/04', '10', '-4335', '433.5', '1', '0', '0', 'SAME-DAY-BUY', '台幣', 'buy'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body).toEqual(
      expect.objectContaining({
        canCommit: true,
        readyCount: 1,
        errorCount: 1,
      }),
    )
    expect(preview.body.rows[0].errors[0].code).toBe('SELL_SAME_DAY_ORDER_AMBIGUOUS')
    expect(preview.body.rows[1].status).toBe('ready')

    const commit = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(commit.body.successCount).toBe(1)
    const txs = await prisma.transaction.findMany({
      where: { accountId: account.id },
      select: { brokerOrderNo: true, type: true },
    })
    expect(txs).toEqual([{ brokerOrderNo: 'SAME-DAY-BUY', type: 'buy' }])
  })

  it('same-day sell covered by earlier-date holdings remains ready', async () => {
    const { user, account, asset } = await createImportFixture()

    await seedBuyViaApi({
      userId: user.id,
      accountId: account.id,
      assetId: asset.id,
      quantity: 10,
      price: 400,
      tradeTime: '2021-12-01T00:00:00.000Z',
      brokerOrderNo: 'DB-BUY-PRIOR',
    })

    const csvContent = buildCsv([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SAME-DAY-SELL', '台幣', 'sell'],
      ['E2E台積電', '2022/01/04', '3', '-1300', '433', '1', '0', '0', 'SAME-DAY-BUY', '台幣', 'buy'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body.canCommit).toBe(true)
    expect(preview.body.readyCount).toBe(2)
    expect(preview.body.errorCount).toBe(0)

    const commit = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(commit.body.successCount).toBe(2)
  })

  it('mixed ready buy + history-required sell + alias error commits only the ready buy', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'READY-BUY', '台幣', 'ready'],
      // Sell before any available buy date → cannot use the later-file buy that is after? Buy is 2020, sell 2019 → history required.
      ['E2E台積電', '2019/01/04', '5', '3250', '650', '1', '9', '0', 'EARLY-SELL', '台幣', 'sell-error'],
      ['未知標的', '2022/01/05', '1', '-100', '100', '1', '0', '0', 'ALIAS-MISS', '台幣', 'alias-error'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body).toEqual(
      expect.objectContaining({
        canCommit: true,
        readyCount: 1,
        errorCount: 2,
      }),
    )
    expect(preview.body.rows[1].errors[0].code).toBe('SELL_HISTORY_REQUIRED')
    expect(preview.body.rows[2].errors[0].code).toBe('ASSET_ALIAS_NOT_FOUND')

    const commit = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(commit.body.successCount).toBe(1)
    const txs = await prisma.transaction.findMany({
      where: { accountId: account.id },
      select: { brokerOrderNo: true },
    })
    expect(txs).toEqual([{ brokerOrderNo: 'READY-BUY' }])
  })

  it('file-internal duplicate keeps canCommit false and writes nothing', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'DUP', '台幣', 'first'],
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'DUP', '台幣', 'second'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body.canCommit).toBe(false)
    expect(preview.body.rows[1].errors[0].code).toBe('DUPLICATE_BROKER_ORDER_IN_FILE')

    await commitImport(user.id, account.id, csvContent).expect(400)
    expect(await prisma.transaction.count({ where: { accountId: account.id } })).toBe(0)
  })

  it('preview does not write transaction / position / lot / GL state', async () => {
    const { user, account, asset } = await createImportFixture()
    const csvContent = buildCsv([
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'PREVIEW-ONLY', '台幣', 'buy'],
    ])

    await previewImport(user.id, account.id, csvContent).expect(201)

    expect(await prisma.transaction.count({ where: { accountId: account.id } })).toBe(0)
    expect(await prisma.position.count({ where: { accountId: account.id, assetId: asset.id } })).toBe(0)
    expect(await prisma.positionLot.count({ where: { accountId: account.id, assetId: asset.id } })).toBe(0)
    expect(await prisma.glEntry.count()).toBe(0)
  })
})
