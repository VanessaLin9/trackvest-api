import { execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

export type RehearsalDatabaseConfig = {
  adminUrl: string
  baseUrl: string
  schema: string
  rehearsalUrl: string
}

export const REHEARSAL_DATABASE_NAME = 'trackvest_rehearsal'

export function readDatabaseUrlFromEnvFile() {
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

export function withSchema(databaseUrl: string, schema: string) {
  const url = new URL(databaseUrl)
  url.searchParams.set('schema', schema)
  return url.toString()
}

export function withDatabaseName(databaseUrl: string, databaseName: string) {
  const url = new URL(databaseUrl)
  url.pathname = `/${databaseName}`
  return url.toString()
}

export function resolveBaseDatabaseUrl() {
  return process.env.DATABASE_URL ?? readDatabaseUrlFromEnvFile()
}

export function createEphemeralRehearsalConfig(): RehearsalDatabaseConfig {
  const baseUrl = resolveBaseDatabaseUrl()
  const schema = `rehearsal_${randomUUID().replace(/-/g, '')}`

  return {
    baseUrl,
    schema,
    rehearsalUrl: withSchema(baseUrl, schema),
    adminUrl: withSchema(baseUrl, 'public'),
  }
}

export function createNamedRehearsalDatabaseUrl(databaseName = REHEARSAL_DATABASE_NAME) {
  return withDatabaseName(resolveBaseDatabaseUrl(), databaseName)
}

export function postgresAdminUrl() {
  return withDatabaseName(resolveBaseDatabaseUrl(), 'postgres')
}

export function deployMigrations(databaseUrl: string) {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: 'inherit',
  })
}

export function migrateStatusExitCode(databaseUrl: string) {
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'status'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: 'pipe',
    })
    return 0
  } catch (error) {
    const status = (error as { status?: number }).status
    return typeof status === 'number' ? status : 1
  }
}

export function createPrismaClient(databaseUrl: string) {
  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  })
}

export async function dropRehearsalSchema(adminUrl: string, schema: string) {
  const prisma = createPrismaClient(adminUrl)

  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  } finally {
    await prisma.$disconnect()
  }
}

export async function recreateNamedRehearsalDatabase(databaseName = REHEARSAL_DATABASE_NAME) {
  const adminUrl = postgresAdminUrl()
  const admin = createPrismaClient(adminUrl)

  try {
    await admin.$executeRawUnsafe(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${databaseName}' AND pid <> pg_backend_pid()
    `)
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`)
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
  } finally {
    await admin.$disconnect()
  }

  return createNamedRehearsalDatabaseUrl(databaseName)
}
