/**
 * Phase 0 diagnostics: import sell-readiness vs CSV source order.
 *
 * Documents current behavior (not desired behavior):
 * - Preview does not check position/lot readiness.
 * - Commit processes rows in CSV source order, not trade-time order.
 * - Newest-first (or sell-before-buy) files can preview all rows as ready
 *   while commit fails on sell rows.
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
})
