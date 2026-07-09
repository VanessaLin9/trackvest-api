import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { AccountType, Currency, GlAccountPurpose, UserRole } from '@prisma/client'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import type { App } from 'supertest/types'
import { AppModule } from '../src/app.module'
import { DEFAULT_SYSTEM_GL_PURPOSES } from '../src/gl/default-chart/default-chart.definitions'
import { PrismaService } from '../src/prisma.service'
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
  })

  beforeEach(async () => {
    await clearDatabase(prisma)
  })

  afterAll(async () => {
    if (app) await app.close()
    await dropTestSchema(database.adminUrl, database.schema)
    process.env.DATABASE_URL = database.baseUrl
  })

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
})
