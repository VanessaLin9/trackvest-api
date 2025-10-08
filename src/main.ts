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
  const isProd = process.env.NODE_ENV === 'production'
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
    origin: origins.length > 0 ? origins : true, // dev 沒設就允許全部
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
}
bootstrap()
