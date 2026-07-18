/**
 * CP3: real-DB proof that import commit is all-or-nothing.
 *
 * Uses an isolated Prisma schema (see helpers/e2e-db). Persistence assertions
 * cover transactions, position lots / sell allocations, and GL entries.
 */
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { AssetType, Currency, GlAccountPurpose, GlAccountType } from '@prisma/client'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import type { App } from 'supertest/types'
import { AppModule } from '../src/app.module'
import { PostingService } from '../src/gl/posting.service'
import { PrismaService } from '../src/prisma.service'
import { authCookieFor } from './helpers/auth'
import {
  clearDatabase,
  createTestDatabaseConfig,
  dropTestSchema,
  prepareTestDatabase,
} from './helpers/e2e-db'

describe('Transaction import atomic commit (e2e)', () => {
  const database = createTestDatabaseConfig()

  let app: INestApplication<App>
  let prisma: PrismaService
  let postingService: PostingService

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
    postingService = app.get(PostingService)
  })

  beforeEach(async () => {
    await clearDatabase(prisma)
    jest.restoreAllMocks()
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

  async function createImportFixture(params?: { alias?: string; symbol?: string }) {
    const alias = params?.alias ?? 'E2E原子台積電'
    const symbol = params?.symbol ?? `E2E-ATOMIC-${Date.now()}`

    const user = await prisma.user.create({
      data: {
        email: `import-atomic-${Date.now()}@trackvest.local`,
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
        symbol,
        name: 'E2E Atomic TSMC',
        type: AssetType.equity,
        assetClass: 'equity',
        baseCurrency: 'TWD',
      },
    })

    await prisma.assetAlias.create({
      data: {
        assetId: asset.id,
        alias,
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

    return { user, account, asset, alias }
  }

  function auth(userId: string) {
    return { Cookie: authCookieFor(app, { id: userId }) }
  }

  function commitImport(userId: string, accountId: string, csvContent: string) {
    return request(app.getHttpServer())
      .post('/transactions/import/commit')
      .set(auth(userId))
      .send({ accountId, csvContent })
  }

  async function countAccountPersistence(accountId: string, assetId: string) {
    const [transactions, positions, lots, sellMatches, glEntries] = await Promise.all([
      prisma.transaction.count({ where: { accountId } }),
      prisma.position.count({ where: { accountId, assetId } }),
      prisma.positionLot.count({ where: { accountId, assetId } }),
      prisma.sellLotMatch.count({
        where: {
          sellTransaction: { accountId },
        },
      }),
      // GlEntry has no FK to Transaction; count the whole isolated schema so a
      // leaked posting outside the import tx cannot hide behind missing txs.
      prisma.glEntry.count(),
    ])

    return { transactions, positions, lots, sellMatches, glEntries }
  }

  function failPostingAfterCalls(successCount: number) {
    const original = postingService.postTransaction.bind(postingService)
    let calls = 0
    jest.spyOn(postingService, 'postTransaction').mockImplementation(async (command) => {
      calls += 1
      if (calls > successCount) {
        throw new Error('forced posting failure for atomic import e2e')
      }
      return original(command)
    })
  }

  it('persists transactions, lots, and GL for a multi-row successful commit', async () => {
    const { user, account, asset, alias } = await createImportFixture()
    const csvContent = buildCsv([
      [alias, '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'ATOMIC-BUY-A', '台幣', 'buy-a'],
      [alias, '2021/03/01', '5', '-2500', '500', '0', '0', '0', 'ATOMIC-BUY-B', '台幣', 'buy-b'],
    ])

    const commit = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(commit.body).toEqual(
      expect.objectContaining({
        successCount: 2,
        skippedCount: 0,
        failureCount: 0,
        createdTransactionIds: expect.arrayContaining([expect.any(String), expect.any(String)]),
      }),
    )
    expect(commit.body.createdTransactionIds).toHaveLength(2)

    const txs = await prisma.transaction.findMany({
      where: { accountId: account.id },
      orderBy: [{ tradeTime: 'asc' }, { id: 'asc' }],
      select: { id: true, brokerOrderNo: true, type: true, quantity: true },
    })
    expect(txs.map((tx) => tx.brokerOrderNo)).toEqual(['ATOMIC-BUY-A', 'ATOMIC-BUY-B'])

    const lots = await prisma.positionLot.findMany({
      where: { accountId: account.id, assetId: asset.id },
      orderBy: { openedAt: 'asc' },
    })
    expect(lots).toHaveLength(2)
    expect(lots.map((lot) => Number(lot.remainingQuantity))).toEqual([10, 5])
    expect(lots.map((lot) => lot.sourceTransactionId)).toEqual([txs[0].id, txs[1].id])

    const position = await prisma.position.findFirst({
      where: { accountId: account.id, assetId: asset.id, closedAt: null },
    })
    expect(position).not.toBeNull()
    expect(Number(position?.quantity)).toBe(15)

    const glEntries = await prisma.glEntry.findMany({
      where: {
        refTxId: { in: txs.map((tx) => tx.id) },
        isDeleted: false,
      },
      include: { lines: true },
    })
    expect(glEntries).toHaveLength(2)
    expect(glEntries.every((entry) => entry.lines.length >= 2)).toBe(true)
  })

  it('rolls back earlier writes when a later ready row fails during commit', async () => {
    const { user, account, asset, alias } = await createImportFixture()
    failPostingAfterCalls(1)

    const csvContent = buildCsv([
      [alias, '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'ATOMIC-FAIL-1', '台幣', 'first'],
      [alias, '2021/03/01', '5', '-2500', '500', '0', '0', '0', 'ATOMIC-FAIL-2', '台幣', 'second'],
    ])

    const commit = await commitImport(user.id, account.id, csvContent).expect(400)
    expect(commit.body).toEqual(
      expect.objectContaining({
        errorCode: 'IMPORT_COMMIT_FAILED',
        successCount: 0,
        createdTransactionIds: [],
      }),
    )

    expect(await countAccountPersistence(account.id, asset.id)).toEqual({
      transactions: 0,
      positions: 0,
      lots: 0,
      sellMatches: 0,
      glEntries: 0,
    })
  })

  it('lets a same-batch sell consume the earlier imported buy via FIFO', async () => {
    const { user, account, asset, alias } = await createImportFixture()
    const csvContent = buildCsv([
      [alias, '2022/01/04', '5', '3250', '650', '1', '9', '0', 'ATOMIC-SELL', '台幣', 'sell'],
      [alias, '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'ATOMIC-BUY', '台幣', 'buy'],
    ])

    const commit = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(commit.body.successCount).toBe(2)

    const txs = await prisma.transaction.findMany({
      where: { accountId: account.id },
      orderBy: [{ tradeTime: 'asc' }, { id: 'asc' }],
      select: { id: true, brokerOrderNo: true, type: true },
    })
    expect(txs).toEqual([
      expect.objectContaining({ brokerOrderNo: 'ATOMIC-BUY', type: 'buy' }),
      expect.objectContaining({ brokerOrderNo: 'ATOMIC-SELL', type: 'sell' }),
    ])

    const buyId = txs[0].id
    const sellId = txs[1].id

    const lots = await prisma.positionLot.findMany({
      where: { accountId: account.id, assetId: asset.id },
      orderBy: { openedAt: 'asc' },
    })
    expect(lots).toHaveLength(1)
    expect(lots[0].sourceTransactionId).toBe(buyId)
    expect(Number(lots[0].remainingQuantity)).toBe(5)
    expect(lots[0].closedAt).toBeNull()

    const matches = await prisma.sellLotMatch.findMany({
      where: { sellTransactionId: sellId },
    })
    expect(matches).toHaveLength(1)
    expect(matches[0].buyLotId).toBe(lots[0].id)
    expect(Number(matches[0].quantity)).toBe(5)
    expect(Number(matches[0].unitCost)).toBe(433.5)

    const position = await prisma.position.findFirst({
      where: { accountId: account.id, assetId: asset.id, closedAt: null },
    })
    expect(Number(position?.quantity)).toBe(5)

    const sellGl = await prisma.glEntry.findMany({
      where: { refTxId: sellId, isDeleted: false },
      include: { lines: true },
    })
    expect(sellGl).toHaveLength(1)
    expect(sellGl[0].lines.length).toBeGreaterThanOrEqual(2)
  })

  it('rolls back transactions, lots, sell matches, and GL when posting fails', async () => {
    const { user, account, asset, alias } = await createImportFixture()
    // Buy posts successfully; sell posting fails after FIFO matches are written.
    failPostingAfterCalls(1)

    const csvContent = buildCsv([
      [alias, '2022/01/04', '5', '3250', '650', '1', '9', '0', 'ATOMIC-GL-SELL', '台幣', 'sell'],
      [alias, '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'ATOMIC-GL-BUY', '台幣', 'buy'],
    ])

    const commit = await commitImport(user.id, account.id, csvContent).expect(400)
    expect(commit.body).toEqual(
      expect.objectContaining({
        errorCode: 'IMPORT_COMMIT_FAILED',
        successCount: 0,
        createdTransactionIds: [],
      }),
    )

    expect(await countAccountPersistence(account.id, asset.id)).toEqual({
      transactions: 0,
      positions: 0,
      lots: 0,
      sellMatches: 0,
      glEntries: 0,
    })
  })

  it('skips an existing duplicate and persists only the ready row', async () => {
    const { user, account, asset, alias } = await createImportFixture()

    const seed = await commitImport(
      user.id,
      account.id,
      buildCsv([
        [alias, '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'ATOMIC-EXISTING', '台幣', 'seed'],
      ]),
    ).expect(201)
    expect(seed.body.successCount).toBe(1)
    const seededId = seed.body.createdTransactionIds[0] as string

    const mixed = await commitImport(
      user.id,
      account.id,
      buildCsv([
        [alias, '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'ATOMIC-EXISTING', '台幣', 'dup'],
        [alias, '2021/03/01', '5', '-2500', '500', '0', '0', '0', 'ATOMIC-READY', '台幣', 'ready'],
      ]),
    ).expect(201)

    expect(mixed.body).toEqual(
      expect.objectContaining({
        successCount: 1,
        skippedCount: 1,
        failureCount: 0,
        createdTransactionIds: [expect.any(String)],
      }),
    )
    expect(mixed.body.createdTransactionIds).not.toContain(seededId)

    const txs = await prisma.transaction.findMany({
      where: { accountId: account.id },
      orderBy: [{ tradeTime: 'asc' }, { id: 'asc' }],
      select: { id: true, brokerOrderNo: true },
    })
    expect(txs).toEqual([
      { id: seededId, brokerOrderNo: 'ATOMIC-EXISTING' },
      {
        id: mixed.body.createdTransactionIds[0],
        brokerOrderNo: 'ATOMIC-READY',
      },
    ])

    expect(
      await prisma.positionLot.count({
        where: { accountId: account.id, assetId: asset.id },
      }),
    ).toBe(2)
    expect(
      await prisma.glEntry.count({
        where: {
          refTxId: { in: txs.map((tx) => tx.id) },
          isDeleted: false,
        },
      }),
    ).toBe(2)
  })

  it('re-importing a successful file creates no duplicate transactions', async () => {
    const { user, account, alias } = await createImportFixture()
    const csvContent = buildCsv([
      [alias, '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'ATOMIC-IDEMP', '台幣', 'buy'],
    ])

    const first = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(first.body.successCount).toBe(1)

    const second = await commitImport(user.id, account.id, csvContent).expect(201)
    expect(second.body).toEqual(
      expect.objectContaining({
        successCount: 0,
        skippedCount: 1,
        failureCount: 0,
        createdTransactionIds: [],
      }),
    )

    expect(
      await prisma.transaction.count({
        where: { accountId: account.id, brokerOrderNo: 'ATOMIC-IDEMP' },
      }),
    ).toBe(1)
  })
})
