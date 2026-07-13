/**
 * Phase 0 diagnostics: import sell-readiness gaps.
 *
 * Documents current behavior (not desired behavior):
 * - Preview does not check position/lot readiness.
 * - Commit processes rows in CSV source order, not trade-time order.
 * - Newest-first / sell-before-buy / missing history / oversell / same-date
 *   cases can all preview as ready while commit fails.
 * - Failure classes observed at commit:
 *   - Active position not found for sell transaction
 *   - sell quantity exceeds the remaining open position lots
 *   - sell quantity exceeds open lots during replay
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

describe('Transaction import sell-readiness diagnostics (e2e)', () => {
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
        email: `import-readiness-${Date.now()}@trackvest.local`,
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

  it('preview marks all rows ready when sell appears before buy in CSV source order', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      // Newest-first pattern: sell row 2, funding buy row 3 (older date, later in file)
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SELL-FIRST', '台幣', 'sell-first'],
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'BUY-LATER', '台幣', 'buy-later'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)

    expect(preview.body.canCommit).toBe(true)
    expect(preview.body.readyCount).toBe(2)
    expect(preview.body.errorCount).toBe(0)
    expect(preview.body.rows.map((row: { row: number; status: string }) => row.status)).toEqual([
      'ready',
      'ready',
    ])
  })

  it('commit fails on sell-before-buy source order even though preview was ready', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SELL-FIRST', '台幣', 'sell-first'],
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'BUY-LATER', '台幣', 'buy-later'],
    ])

    const commit = await commitImport(user.id, account.id, csvContent).expect(400)

    expect(commit.body.errorCode).toBe('IMPORT_COMMIT_FAILED')
    expect(commit.body.successCount).toBe(1)
    expect(commit.body.failureCount).toBeGreaterThanOrEqual(1)

    const sellRow = commit.body.preview.rows.find((row: { row: number }) => row.row === 2)
    expect(sellRow?.status).toBe('error')
    expect(
      sellRow?.errors.some((issue: { message: string }) =>
        issue.message.includes('Active position not found for sell transaction'),
      ),
    ).toBe(true)

    const txCount = await prisma.transaction.count({ where: { accountId: account.id } })
    expect(txCount).toBe(1)
    const buyTx = await prisma.transaction.findFirst({
      where: { accountId: account.id, brokerOrderNo: 'BUY-LATER' },
    })
    expect(buyTx?.type).toBe('buy')
  })

  it('commit succeeds when buy precedes sell in CSV source order (chronological file)', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'BUY-FIRST', '台幣', 'buy-first'],
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SELL-SECOND', '台幣', 'sell-second'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body.canCommit).toBe(true)

    const commit = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(commit.body.successCount).toBe(2)
    expect(commit.body.failureCount).toBe(0)

    const txCount = await prisma.transaction.count({ where: { accountId: account.id } })
    expect(txCount).toBe(2)
  })

  it('newest-first three-row pattern: newer buy then historical sell then older buy — preview ready, sell commit fails', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      // Mirrors real statement shape: row 2 newer buy, row 3 historical sell, row 4 older bulk buy
      ['E2E台積電', '2024/08/05', '1', '-846', '845', '1', '0', '0', 'BUY-NEW', '台幣', 'new-buy'],
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SELL-MID', '台幣', 'mid-sell'],
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'BUY-OLD', '台幣', 'old-buy'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body.canCommit).toBe(true)
    expect(preview.body.readyCount).toBe(3)

    const commit = await commitImport(user.id, account.id, csvContent).expect(400)

    expect(commit.body.errorCode).toBe('IMPORT_COMMIT_FAILED')
    const sellRow = commit.body.preview.rows.find((row: { row: number }) => row.row === 3)
    expect(sellRow?.status).toBe('error')
    expect(
      sellRow?.errors.some(
        (issue: { message: string }) =>
          issue.message.includes('Active position not found for sell transaction') ||
          issue.message.includes('sell quantity exceeds the remaining open position lots') ||
          issue.message.includes('sell quantity exceeds open lots during replay'),
      ),
    ).toBe(true)

    // Newer buy (row 2) may commit before sell fails — partial progress is current behavior.
    expect(commit.body.successCount).toBeGreaterThanOrEqual(1)
    expect(commit.body.successCount).toBeLessThan(3)
  })

  it('same three trades in chronological CSV order commits all rows', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'BUY-OLD', '台幣', 'old-buy'],
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SELL-MID', '台幣', 'mid-sell'],
      ['E2E台積電', '2024/08/05', '1', '-846', '845', '1', '0', '0', 'BUY-NEW', '台幣', 'new-buy'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body.canCommit).toBe(true)

    const commit = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(commit.body.successCount).toBe(3)
    expect(commit.body.failureCount).toBe(0)
  })

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

  async function redactedScopeState(accountId: string, assetId: string) {
    const [transactions, positions, lots, sellMatches] = await Promise.all([
      prisma.transaction.findMany({
        where: { accountId, assetId, isDeleted: false },
        select: { type: true, quantity: true, tradeTime: true, brokerOrderNo: true },
        orderBy: [{ tradeTime: 'asc' }, { id: 'asc' }],
      }),
      prisma.position.findMany({
        where: { accountId, assetId },
        select: { quantity: true, closedAt: true },
      }),
      prisma.positionLot.findMany({
        where: { accountId, assetId },
        select: { remainingQuantity: true, closedAt: true },
      }),
      prisma.sellLotMatch.count({
        where: { sellTransaction: { accountId, assetId } },
      }),
    ])

    return {
      transactionCount: transactions.length,
      transactionTypes: transactions.map((tx) => tx.type),
      openPositionCount: positions.filter((position) => position.closedAt === null).length,
      openLotCount: lots.filter((lot) => Number(lot.remainingQuantity) > 0).length,
      sellMatchCount: sellMatches,
    }
  }

  function failureMessages(commitBody: {
    preview?: { rows?: Array<{ row: number; errors?: Array<{ message: string }> }> }
  }) {
    return (commitBody.preview?.rows ?? []).flatMap((row) =>
      (row.errors ?? []).map((issue) => ({ row: row.row, message: issue.message })),
    )
  }

  it('pre-existing newer DB buy + imported historical sell: preview ready, commit fails via replay', async () => {
    const { user, account, asset } = await createImportFixture()

    await seedBuyViaApi({
      userId: user.id,
      accountId: account.id,
      assetId: asset.id,
      quantity: 2,
      price: 845,
      tradeTime: '2024-08-05T00:00:00.000Z',
      brokerOrderNo: 'DB-BUY-NEW',
    })

    const before = await redactedScopeState(account.id, asset.id)
    expect(before).toEqual({
      transactionCount: 1,
      transactionTypes: ['buy'],
      openPositionCount: 1,
      openLotCount: 1,
      sellMatchCount: 0,
    })

    // Historical sell of 5 shares; only 2 exist in DB and they are later than the sell.
    const csvContent = buildCsv([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'IMP-SELL-OLD', '台幣', 'historical-sell'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body.canCommit).toBe(true)
    expect(preview.body.readyCount).toBe(1)

    const commit = await commitImport(user.id, account.id, csvContent).expect(400)
    expect(commit.body.errorCode).toBe('IMPORT_COMMIT_FAILED')
    expect(commit.body.successCount).toBe(0)

    const messages = failureMessages(commit.body)
    expect(messages).toEqual([
      expect.objectContaining({
        row: 2,
        message: expect.stringMatching(
          /sell quantity exceeds open lots during replay|sell quantity exceeds the remaining open position lots|Active position not found/,
        ),
      }),
    ])
    // With later DB activity, historical sell should take the full-scope replay path.
    expect(messages[0].message).toContain('sell quantity exceeds open lots during replay')

    const after = await redactedScopeState(account.id, asset.id)
    expect(after).toEqual(before)
  })

  it('genuine oversell in chronological order: preview ready, commit fails with insufficient lots', async () => {
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

    const before = await redactedScopeState(account.id, asset.id)
    expect(before.openLotCount).toBe(1)

    const csvContent = buildCsv([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'OVERSELL', '台幣', 'oversell'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body.canCommit).toBe(true)

    const commit = await commitImport(user.id, account.id, csvContent).expect(400)
    expect(commit.body.errorCode).toBe('IMPORT_COMMIT_FAILED')
    expect(commit.body.successCount).toBe(0)

    const sellRow = commit.body.preview.rows.find((row: { row: number }) => row.row === 2)
    expect(sellRow?.status).toBe('error')
    expect(sellRow?.errors[0]?.message).toBe(
      'sell quantity exceeds the remaining open position lots',
    )

    const after = await redactedScopeState(account.id, asset.id)
    expect(after).toEqual(before)
  })

  it('sell with funding buy outside imported file: preview ready, commit fails with no active position', async () => {
    const { user, account, asset } = await createImportFixture()

    const before = await redactedScopeState(account.id, asset.id)
    expect(before.transactionCount).toBe(0)
    expect(before.openPositionCount).toBe(0)

    const csvContent = buildCsv([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'ORPHAN-SELL', '台幣', 'no-history'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body).toEqual(
      expect.objectContaining({
        canCommit: true,
        readyCount: 1,
        errorCount: 0,
      }),
    )

    const commit = await commitImport(user.id, account.id, csvContent).expect(400)
    expect(commit.body.errorCode).toBe('IMPORT_COMMIT_FAILED')
    expect(commit.body.successCount).toBe(0)
    expect(commit.body.preview.rows[0].errors[0].message).toBe(
      'Active position not found for sell transaction',
    )

    const after = await redactedScopeState(account.id, asset.id)
    expect(after).toEqual(before)
  })

  it('same-date sell before buy in CSV: preview ready, commit fails because source order wins over equal dates', async () => {
    const { user, account, asset } = await createImportFixture()

    // Broker date-only fields become midnight timestamps; import does not reorder by date.
    const csvContent = buildCsv([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SAME-DAY-SELL', '台幣', 'sell'],
      ['E2E台積電', '2022/01/04', '10', '-4335', '433.5', '1', '0', '0', 'SAME-DAY-BUY', '台幣', 'buy'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body.canCommit).toBe(true)
    expect(preview.body.rows.map((row: { tradeDate: string }) => row.tradeDate)).toEqual([
      '2022-01-04',
      '2022-01-04',
    ])

    const commit = await commitImport(user.id, account.id, csvContent).expect(400)
    expect(commit.body.errorCode).toBe('IMPORT_COMMIT_FAILED')

    const sellRow = commit.body.preview.rows.find((row: { row: number }) => row.row === 2)
    expect(sellRow?.errors[0]?.message).toBe(
      'Active position not found for sell transaction',
    )

    // Current behavior continues after failure; later same-day buy may still write.
    expect(commit.body.successCount).toBe(1)
    const after = await redactedScopeState(account.id, asset.id)
    expect(after.transactionTypes).toEqual(['buy'])
    expect(after.openPositionCount).toBe(1)
  })
})
