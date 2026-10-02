import { writeFileSync } from 'fs'
import { resolve } from 'path'
import { Test } from '@nestjs/testing'
import { SwaggerModule } from '@nestjs/swagger'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma.service'
import { buildSwaggerConfig } from '../src/swagger'

export const OPENAPI_PATH = resolve(__dirname, '../openapi.json')

/** 不連資料庫。規格只來自 controller / DTO（PR #46）。 */
export async function createOpenApiDocument() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      onModuleInit: async () => undefined,
      onModuleDestroy: async () => undefined,
      $connect: async () => undefined,
      $disconnect: async () => undefined,
    })
    .compile()

  const app = moduleRef.createNestApplication({ logger: false })
  await app.init()
  try {
    return SwaggerModule.createDocument(app, buildSwaggerConfig())
  } finally {
    await app.close()
  }
}

async function main() {
  const document = await createOpenApiDocument()
  writeFileSync(OPENAPI_PATH, `${JSON.stringify(document, null, 2)}\n`)
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
