/**
 * Branch 2: already-imported brokerOrderNo becomes skipped (not error).
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

describe('Transaction import duplicate skipped (e2e)', () => {
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
        email: `import-dup-skip-${Date.now()}@trackvest.local`,
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
        symbol: 'E2E-DUP-2330',
        name: 'E2E DUP TSMC',
        type: AssetType.equity,
        assetClass: 'equity',
        baseCurrency: 'TWD',
      },
    })

    await prisma.assetAlias.create({
      data: {
        assetId: asset.id,
        alias: 'E2E重複台積電',
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

  it('re-upload of an already-imported file is an all-skipped successful no-op', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      ['E2E重複台積電', '2022/01/04', '10', '-4335', '433.5', '1', '0', '0', 'DUP-SKIP-001', '台幣', 'buy'],
    ])

    const first = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(first.body).toEqual(
      expect.objectContaining({
        successCount: 1,
        skippedCount: 0,
        failureCount: 0,
        createdTransactionIds: expect.arrayContaining([expect.any(String)]),
      }),
    )

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body).toEqual(
      expect.objectContaining({
        canCommit: true,
        readyCount: 0,
        skippedCount: 1,
        errorCount: 0,
      }),
    )
    expect(preview.body.rows[0]).toEqual(
      expect.objectContaining({
        status: 'skipped',
        warnings: [
          expect.objectContaining({
            code: 'DUPLICATE_BROKER_ORDER_ALREADY_IMPORTED',
          }),
        ],
      }),
    )

    const second = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(second.body).toEqual(
      expect.objectContaining({
        successCount: 0,
        skippedCount: 1,
        failureCount: 0,
        createdTransactionIds: [],
      }),
    )

    const count = await prisma.transaction.count({
      where: { accountId: account.id, brokerOrderNo: 'DUP-SKIP-001' },
    })
    expect(count).toBe(1)
  })

  it('keeps same-file duplicate broker orders as blocking errors', async () => {
    const { user, account } = await createImportFixture()
    const csvContent = buildCsv([
      ['E2E重複台積電', '2022/01/04', '10', '-4335', '433.5', '1', '0', '0', 'FILE-DUP', '台幣', 'first'],
      ['E2E重複台積電', '2022/01/05', '10', '-4335', '433.5', '1', '0', '0', 'FILE-DUP', '台幣', 'second'],
    ])

    const preview = await previewImport(user.id, account.id, csvContent).expect(201)
    expect(preview.body.canCommit).toBe(false)
    expect(preview.body.errorCount).toBe(1)
    expect(preview.body.rows[1]).toEqual(
      expect.objectContaining({
        status: 'error',
        errors: [
          expect.objectContaining({
            code: 'DUPLICATE_BROKER_ORDER_IN_FILE',
          }),
        ],
      }),
    )

    await commitImport(user.id, account.id, csvContent).expect(400)
  })
})
