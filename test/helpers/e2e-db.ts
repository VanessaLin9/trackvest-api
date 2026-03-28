import { execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

type TestDatabaseConfig = {
  adminUrl: string
  baseUrl: string
  schema: string
  testUrl: string
}

function readDatabaseUrlFromEnvFile() {
  const envPath = join(process.cwd(), '.env')
  const envContent = readFileSync(envPath, 'utf8')
  const line = envContent
    .split('\n')
    .find((entry) => entry.trim().startsWith('DATABASE_URL='))

  if (!line) {
    throw new Error('DATABASE_URL is missing from .env')
  }

  const rawValue = line.slice(line.indexOf('=') + 1).trim()
  return rawValue.replace(/^"(.*)"$/, '$1')
}

function withSchema(databaseUrl: string, schema: string) {
  const url = new URL(databaseUrl)
  url.searchParams.set('schema', schema)
  return url.toString()
}

export function createTestDatabaseConfig(): TestDatabaseConfig {
  const baseUrl = process.env.DATABASE_URL ?? readDatabaseUrlFromEnvFile()
  const schema = `e2e_${randomUUID().replace(/-/g, '')}`

  return {
    baseUrl,
    schema,
    testUrl: withSchema(baseUrl, schema),
    adminUrl: withSchema(baseUrl, 'public'),
  }
}

export function prepareTestDatabase(databaseUrl: string) {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'push', '--skip-generate'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: 'pipe',
  })
}

export async function clearDatabase(prisma: PrismaClient) {
  await prisma.glLine.deleteMany()
  await prisma.glEntry.deleteMany()
  await prisma.sellLotMatch.deleteMany()
  await prisma.positionLot.deleteMany()
  await prisma.position.deleteMany()
  await prisma.txTag.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.price.deleteMany()
  await prisma.fxRate.deleteMany()
  await prisma.assetAlias.deleteMany()
  await prisma.glAccount.deleteMany()
  await prisma.account.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.user.deleteMany()
}

export async function dropTestSchema(adminUrl: string, schema: string) {
  const previousDatabaseUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = adminUrl

  const prisma = new PrismaClient()

  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  } finally {
    await prisma.$disconnect()
    process.env.DATABASE_URL = previousDatabaseUrl
  }
}
