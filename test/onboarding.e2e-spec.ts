import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { AccountType, AssetType, Currency, GlAccountPurpose, UserRole } from '@prisma/client'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import type { App } from 'supertest/types'
import { AppModule } from '../src/app.module'
import { DEFAULT_SYSTEM_GL_PURPOSES } from '../src/gl/default-chart/default-chart.definitions'
import { GlService } from '../src/gl/services/gl.service'
import { PrismaService } from '../src/prisma.service'
import { authCookieFor } from './helpers/auth'
import {
  clearDatabase,
  createTestDatabaseConfig,
  dropTestSchema,
  prepareTestDatabase,
} from './helpers/e2e-db'

describe('Onboarding (e2e)', () => {
  const database = createTestDatabaseConfig()

  let app: INestApplication<App>
  let prisma: PrismaService
  let glService: GlService

  const password = 'onboarding-password'
  const email = 'onboarding-e2e@trackvest.local'

  const signupPayload = {
    email,
    password,
    starterAccount: {
      name: 'Cathay Broker',
      type: AccountType.broker,
      currency: Currency.TWD,
      broker: 'cathay',
    },
  }

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
    glService = app.get(GlService)
  })

  beforeEach(async () => {
    await clearDatabase(prisma)
  })

  afterAll(async () => {
    if (app) await app.close()
    await dropTestSchema(database.adminUrl, database.schema)
    process.env.DATABASE_URL = database.baseUrl
  })

  async function signupOnboardedUser() {
    const signup = await request(app.getHttpServer())
      .post('/onboarding/signup')
      .send(signupPayload)
      .expect(201)

    return {
      userId: signup.body.user.id as string,
      accountId: signup.body.starterAccount.id as string,
      cookie: authCookieFor(app, { id: signup.body.user.id }),
    }
  }

  function expectGlLine(
    lines: Array<{ glAccountId: string; side: string; amount: unknown }>,
    expected: { glAccountId: string; side: string; amount: number },
  ) {
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          glAccountId: expected.glAccountId,
          side: expected.side,
          amount: expect.anything(),
        }),
      ]),
    )
    const line = lines.find(
      (entry) => entry.glAccountId === expected.glAccountId && entry.side === expected.side,
    )
    expect(Number(line?.amount)).toBe(expected.amount)
  }

  it('signs up a user with default chart and starter account', async () => {
    const res = await request(app.getHttpServer())
      .post('/onboarding/signup')
      .send(signupPayload)
      .expect(201)

    expect(res.body.user).toEqual({
      id: expect.any(String),
      email,
      role: UserRole.user,
      createdAt: expect.any(String),
    })
    expect(res.body.starterAccount).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        userId: res.body.user.id,
        name: 'Cathay Broker',
        type: AccountType.broker,
        currency: Currency.TWD,
        broker: 'cathay',
      }),
    )

    const glAccounts = await prisma.glAccount.findMany({
      where: { userId: res.body.user.id },
      orderBy: { name: 'asc' },
    })
    const purposes = glAccounts
      .map((account) => account.purpose)
      .filter((purpose): purpose is GlAccountPurpose => purpose !== null)

    for (const purpose of DEFAULT_SYSTEM_GL_PURPOSES) {
      expect(purposes).toContain(purpose)
    }

    const linkedCash = glAccounts.find((account) => account.linkedAccountId === res.body.starterAccount.id)
    expect(linkedCash).toBeDefined()
  })

  it('returns conflict for duplicate email and leaves only the first user graph', async () => {
    await request(app.getHttpServer()).post('/onboarding/signup').send(signupPayload).expect(201)

    const duplicate = await request(app.getHttpServer())
      .post('/onboarding/signup')
      .send(signupPayload)
      .expect(409)

    expect(duplicate.body.message).toContain('Email already exists')
    expect(await prisma.user.count()).toBe(1)
    expect(await prisma.account.count()).toBe(1)
  })

  it('rejects missing starterAccount without creating a user', async () => {
    const { starterAccount: _starterAccount, ...payloadWithoutStarterAccount } = signupPayload

    const res = await request(app.getHttpServer())
      .post('/onboarding/signup')
      .send(payloadWithoutStarterAccount)
      .expect(400)

    const messages = Array.isArray(res.body.message) ? res.body.message : [res.body.message]
    expect(messages.some((message: string) => /starterAccount/i.test(message))).toBe(true)
    expect(await prisma.user.count()).toBe(0)
    expect(await prisma.glAccount.count()).toBe(0)
  })

  it('rejects invalid starter account input without creating a user', async () => {
    const res = await request(app.getHttpServer())
      .post('/onboarding/signup')
      .send({
        ...signupPayload,
        starterAccount: {
          ...signupPayload.starterAccount,
          broker: 'invalid-broker',
        },
      })
      .expect(400)

    expect(res.body.message).toContain('Broker must be cathay or empty for broker accounts')
    expect(await prisma.user.count()).toBe(0)
    expect(await prisma.glAccount.count()).toBe(0)
  })

  it('allows login after onboarding signup', async () => {
    await request(app.getHttpServer()).post('/onboarding/signup').send(signupPayload).expect(201)

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200)

    expect(login.body).toEqual({
      id: expect.any(String),
      email,
      role: UserRole.user,
    })
  })

  it('resolves required TWD GL purposes for PostingService after onboarding', async () => {
    const { userId } = await signupOnboardedUser()

    await expect(
      glService.getInvestmentBucketGlAccountId(userId, Currency.TWD),
    ).resolves.toEqual(expect.any(String))
    await expect(glService.getEquityGlAccountId(userId)).resolves.toEqual(expect.any(String))
    await expect(glService.getFeeExpenseGlAccountId(userId)).resolves.toEqual(expect.any(String))
    await expect(glService.getDividendIncomeGlAccountId(userId)).resolves.toEqual(expect.any(String))
    await expect(glService.getRealizedGainIncomeGlAccountId(userId)).resolves.toEqual(
      expect.any(String),
    )
    await expect(glService.getRealizedLossExpenseGlAccountId(userId)).resolves.toEqual(
      expect.any(String),
    )
  })

  it('auto-posts TWD deposit and buy transactions after onboarding', async () => {
    const { userId, accountId, cookie } = await signupOnboardedUser()

    const asset = await prisma.asset.create({
      data: {
        symbol: 'ONBOARD-0050',
        name: 'Onboarding Taiwan 50',
        type: AssetType.etf,
        assetClass: 'equity',
        baseCurrency: Currency.TWD,
      },
    })

    const equityGlId = await glService.getEquityGlAccountId(userId)
    const investmentGlId = await glService.getInvestmentBucketGlAccountId(userId, Currency.TWD)
    const linkedCashGl = await prisma.glAccount.findFirst({
      where: { linkedAccountId: accountId },
    })
    expect(linkedCashGl).toBeDefined()

    const deposit = await request(app.getHttpServer())
      .post('/transactions')
      .set('Cookie', cookie)
      .send({
        accountId,
        type: 'deposit',
        amount: 100000,
        tradeTime: '2026-04-01T09:00:00.000Z',
        note: 'initial funding',
      })
      .expect(201)

    const depositEntry = await prisma.glEntry.findFirst({
      where: { userId, refTxId: deposit.body.id, isDeleted: false },
      include: { lines: true },
    })
    expect(depositEntry?.source).toBe('auto:transaction:deposit')
    expect(depositEntry?.lines).toHaveLength(2)
    expectGlLine(depositEntry!.lines, {
      glAccountId: linkedCashGl!.id,
      side: 'debit',
      amount: 100000,
    })
    expectGlLine(depositEntry!.lines, {
      glAccountId: equityGlId,
      side: 'credit',
      amount: 100000,
    })

    const buy = await request(app.getHttpServer())
      .post('/transactions')
      .set('Cookie', cookie)
      .send({
        accountId,
        assetId: asset.id,
        type: 'buy',
        amount: 10050,
        quantity: 100,
        price: 100,
        fee: 50,
        tradeTime: '2026-04-02T09:30:00.000Z',
        note: 'first buy',
      })
      .expect(201)

    const buyEntry = await prisma.glEntry.findFirst({
      where: { userId, refTxId: buy.body.id, isDeleted: false },
      include: { lines: true },
    })
    expect(buyEntry?.source).toBe('auto:transaction:buy')
    expect(buyEntry?.lines).toHaveLength(2)
    expectGlLine(buyEntry!.lines, {
      glAccountId: investmentGlId,
      side: 'debit',
      amount: 10050,
    })
    expectGlLine(buyEntry!.lines, {
      glAccountId: linkedCashGl!.id,
      side: 'credit',
      amount: 10050,
    })
  })

  it('auto-posts TWD dividend transactions after onboarding', async () => {
    const { userId, accountId, cookie } = await signupOnboardedUser()

    const asset = await prisma.asset.create({
      data: {
        symbol: 'ONBOARD-2330',
        name: 'Onboarding TSMC',
        type: AssetType.equity,
        assetClass: 'equity',
        baseCurrency: Currency.TWD,
      },
    })

    const dividendIncomeGlId = await glService.getDividendIncomeGlAccountId(userId)
    const linkedCashGl = await prisma.glAccount.findFirst({
      where: { linkedAccountId: accountId },
    })
    expect(linkedCashGl).toBeDefined()

    const dividend = await request(app.getHttpServer())
      .post('/transactions')
      .set('Cookie', cookie)
      .send({
        accountId,
        assetId: asset.id,
        type: 'dividend',
        amount: 1200,
        tradeTime: '2026-04-03T10:00:00.000Z',
        note: 'cash dividend',
      })
      .expect(201)

    const dividendEntry = await prisma.glEntry.findFirst({
      where: { userId, refTxId: dividend.body.id, isDeleted: false },
      include: { lines: true },
    })
    expect(dividendEntry?.source).toBe('auto:transaction:dividend')
    expect(dividendEntry?.lines).toHaveLength(2)
    expectGlLine(dividendEntry!.lines, {
      glAccountId: linkedCashGl!.id,
      side: 'debit',
      amount: 1200,
    })
    expectGlLine(dividendEntry!.lines, {
      glAccountId: dividendIncomeGlId,
      side: 'credit',
      amount: 1200,
    })
  })
})
