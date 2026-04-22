// src/main.ts
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { REFRESH_TOKEN_COOKIE } from './auth/auth.config'


async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = process.env.PORT || 3000
  app.enableShutdownHooks()

  app.use(cookieParser())

  // Cookie-based auth requires credentials and an explicit origin list.
  // Supports `CORS_ORIGINS` (comma-separated) with `FRONTEND_URL` as the
  // single-origin fallback for parity with older configs.
  const origins = (process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? 'http://localhost:3001')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  app.enableCors({
    origin: origins,
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  )


  // Swagger（/docs）— cookie-based auth. Users can login via POST /auth/login
  // and the browser's cookie jar will carry the httpOnly access_token on
  // subsequent Try-it-out requests (same-origin).
  const swaggerCfg = new DocumentBuilder()
    .setTitle('Trackvest API')
    .setDescription('API for investment bookkeeping')
    .setVersion('0.2.0')
    .addCookieAuth('access_token', { type: 'apiKey', in: 'cookie', name: 'access_token' })
    .addCookieAuth(REFRESH_TOKEN_COOKIE, { type: 'apiKey', in: 'cookie', name: REFRESH_TOKEN_COOKIE })
    .addTag('auth', 'Login / refresh / logout / me')
    .addTag('health', 'Health check')
    .addTag('users', 'User management')
    .addTag('accounts', 'Cash/Broker/Bank accounts')
    .addTag('assets', 'Tradable assets catalog')
    .addTag('transactions', 'Transaction records')
    .addTag('gl', 'Double-entry ledger(entries & postings)')
    .build()
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerCfg)
  SwaggerModule.setup('docs', app, swaggerDoc, {
    jsonDocumentUrl: 'docs/json',
    swaggerOptions: { withCredentials: true },
  })

  await app.listen(port)
  console.log(`🚀 Server running on http://localhost:${port}`)
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start application:', err)
  process.exit(1)
})
