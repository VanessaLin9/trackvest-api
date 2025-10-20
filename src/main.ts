// src/main.ts
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import fastifyCors from '@fastify/cors'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const port = Number(process.env.PORT || 3000)
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  )

  // 全域驗證（DTO）
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  )

  // CORS（dev 寬鬆；prod 嚴格白名單）
  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  await app.register(fastifyCors, {
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  })

  // Swagger（/docs）
  const swaggerCfg = new DocumentBuilder()
    .setTitle('Trackvest API')
    .setDescription('API for investment bookkeeping')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build()
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerCfg)
  SwaggerModule.setup('docs', app, swaggerDoc, {
    jsonDocumentUrl: 'docs/json',
  })

  await app.listen(port, '0.0.0.0')
  console.log(`🚀 Server running on http://0.0.0.0:${port}`)
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start application:', err)
  process.exit(1)
})

// 優雅關閉處理 - 讓 Ctrl+C 能正確關閉 Fastify server
process.on('SIGINT', async () => {
  console.log('\n📍 Received SIGINT, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n📍 Received SIGTERM, shutting down gracefully...')
  process.exit(0)
})