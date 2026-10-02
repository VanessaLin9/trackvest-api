// src/main.ts
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { buildSwaggerConfig } from './swagger'


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
  const swaggerDoc = SwaggerModule.createDocument(app, buildSwaggerConfig())
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
