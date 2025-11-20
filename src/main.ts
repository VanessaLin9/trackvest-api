// src/main.ts
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'


async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = process.env.PORT || 3000
  app.enableShutdownHooks()

  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  })

  // 全域驗證（DTO）
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  )


  // Swagger（/docs）
  const swaggerCfg = new DocumentBuilder()
    .setTitle('Trackvest API')
    .setDescription('API for investment bookkeeping')
    .setVersion('0.1.0')
    .addBearerAuth()
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
  })

  await app.listen(port)
  console.log(`🚀 Server running on http://localhost:${port}`)
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start application:', err)
  process.exit(1)
})
