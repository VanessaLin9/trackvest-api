import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { UserRole } from '@prisma/client'
import bcrypt from 'bcrypt'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import type { App } from 'supertest/types'
import { AppModule } from '../src/app.module'
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../src/auth/auth.config'
import { PrismaService } from '../src/prisma.service'
import {
  clearDatabase,
  createTestDatabaseConfig,
  dropTestSchema,
  prepareTestDatabase,
} from './helpers/e2e-db'

/** Parse a raw Set-Cookie header into a { name, value } map. */
function parseSetCookie(header: string | string[] | undefined): Map<string, string> {
  const headers = Array.isArray(header) ? header : header ? [header] : []
  const out = new Map<string, string>()
  for (const entry of headers) {
    const [nameValue] = entry.split(';')
    const eq = nameValue.indexOf('=')
    if (eq > 0) out.set(nameValue.slice(0, eq).trim(), nameValue.slice(eq + 1).trim())
  }
  return out
}

describe('Auth (e2e)', () => {
  const database = createTestDatabaseConfig()

  let app: INestApplication<App>
  let prisma: PrismaService
  const password = 'correct horse battery staple'
  const email = 'auth-e2e@trackvest.local'

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
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 4),
        role: UserRole.user,
      },
    })
  })

  afterAll(async () => {
    if (app) await app.close()
    await dropTestSchema(database.adminUrl, database.schema)
    process.env.DATABASE_URL = database.baseUrl
  })

  it('login succeeds with correct credentials and sets both cookies', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200)

    expect(res.body).toEqual({ id: expect.any(String), email, role: UserRole.user })
    const cookies = parseSetCookie(res.headers['set-cookie'])
    expect(cookies.get(ACCESS_TOKEN_COOKIE)).toBeTruthy()
    expect(cookies.get(REFRESH_TOKEN_COOKIE)).toBeTruthy()
  })

  it('login rejects bad password with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password-here' })
      .expect(401)
  })

  it('login rejects unknown email with 401 (no user-existence leak)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ghost@trackvest.local', password })
      .expect(401)
  })

  it('GET /auth/me returns the logged-in user', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200)

    const rawSetCookies = login.headers['set-cookie'] as unknown as string[]
    const setCookies = rawSetCookies.map((c) => c.split(';')[0])

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', setCookies.join('; '))
      .expect(200)

    expect(me.body).toEqual({ id: expect.any(String), email, role: UserRole.user })
  })

  it('GET /auth/me without a cookie returns 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401)
  })

  it('refresh rotates both cookies and invalidates the old refresh token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200)
    const loginCookies = parseSetCookie(login.headers['set-cookie'])
    const oldRefresh = loginCookies.get(REFRESH_TOKEN_COOKIE)

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${oldRefresh}`)
      .expect(200)
    const rotated = parseSetCookie(refreshRes.headers['set-cookie'])
    expect(rotated.get(REFRESH_TOKEN_COOKIE)).toBeTruthy()
    expect(rotated.get(REFRESH_TOKEN_COOKIE)).not.toBe(oldRefresh)

    // Reusing the old refresh token is a replay and must be rejected.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${oldRefresh}`)
      .expect(401)
  })

  it('reusing a revoked refresh token revokes the whole active chain', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200)
    const loginCookies = parseSetCookie(login.headers['set-cookie'])
    const oldRefresh = loginCookies.get(REFRESH_TOKEN_COOKIE)!

    const refresh1 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${oldRefresh}`)
      .expect(200)
    const current = parseSetCookie(refresh1.headers['set-cookie']).get(REFRESH_TOKEN_COOKIE)!

    // Attacker replays the old, revoked token. Service treats this as
    // theft and revokes every active refresh token for the user.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${oldRefresh}`)
      .expect(401)

    // Even the legitimate current refresh token should now fail.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${current}`)
      .expect(401)
  })

  it('logout clears cookies and revokes the refresh token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200)
    const loginCookies = parseSetCookie(login.headers['set-cookie'])
    const refreshCookie = loginCookies.get(REFRESH_TOKEN_COOKIE)!

    const logout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${refreshCookie}`)
      .expect(204)

    // Set-Cookie on logout should clear both cookies (value is empty).
    const cleared = parseSetCookie(logout.headers['set-cookie'])
    expect(cleared.get(ACCESS_TOKEN_COOKIE)).toBe('')
    expect(cleared.get(REFRESH_TOKEN_COOKIE)).toBe('')

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${refreshCookie}`)
      .expect(401)
  })
})
