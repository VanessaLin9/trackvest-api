import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import fastifyCors from '@fastify/cors'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  )

  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  await app.register(fastifyCors, {
    origin: (
      origin: string | undefined,
      cb: (error: Error | null, allow: boolean) => void,
    ) => {
      if (!origin) return cb(null, true)
      if (origins.includes(origin)) return cb(null, true)
      return cb(new Error('CORS blocked'), false)
    },
    credentials: true,
  })

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('TrackVest API')
    .setDescription('Investment tracking and portfolio management API')
    .setVersion('1.0')
    .addTag('transactions', 'Transaction management endpoints')
    .addTag('health', 'Health check endpoints')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api', app, document)

  await app.listen(Number(process.env.PORT || 3000), '0.0.0.0')
}
bootstrap().catch((error) => {
  console.error('Error starting the application:', error)
  process.exit(1)
})
