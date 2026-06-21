import { execFileSync } from 'child_process'
import { assertRehearsalDbRecreateAllowed } from '../src/deployment/rehearsal-guards'
import {
  createNamedRehearsalDatabaseUrl,
  createPrismaClient,
  deployMigrations,
  migrateStatusExitCode,
  recreateNamedRehearsalDatabase,
  REHEARSAL_DATABASE_NAME,
} from '../src/deployment/rehearsal-db'
import { runProductionBootstrap } from '../prisma/seed/bootstrap-runner'
import { runProductionDemoSeed } from '../prisma/seed/prod-demo-seed-runner'

const REHEARSAL_PASSWORD = process.env.DEMO_USER_PASSWORD?.trim() || 'rehearsal-local-secret'

async function runWithRehearsalEnv<T>(
  databaseUrl: string,
  extraEnv: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
) {
  const previous = new Map<string, string | undefined>()
  const overrides = {
    NODE_ENV: 'production',
    DATABASE_URL: databaseUrl,
    ENABLE_SCHEDULED_JOBS: undefined,
    ...extraEnv,
  }

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return await fn()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

async function snapshotDemoGraphCounts(databaseUrl: string) {
  const prisma = createPrismaClient(databaseUrl)

  try {
    return {
      users: await prisma.user.count(),
      accounts: await prisma.account.count(),
      transactions: await prisma.transaction.count(),
      positions: await prisma.position.count(),
      assets: await prisma.asset.count(),
      assetAliases: await prisma.assetAlias.count(),
      prices: await prisma.price.count(),
      fxRates: await prisma.fxRate.count(),
    }
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  assertRehearsalDbRecreateAllowed()
  console.log(`Recreating rehearsal database "${REHEARSAL_DATABASE_NAME}"...`)
  const rehearsalUrl = await recreateNamedRehearsalDatabase()

  console.log('Deploying migrations with NODE_ENV=production...')
  await runWithRehearsalEnv(rehearsalUrl, {}, () => {
    deployMigrations(rehearsalUrl)
    const statusCode = migrateStatusExitCode(rehearsalUrl)
    if (statusCode !== 0) {
      throw new Error(`pnpm db:migrate:status exited ${statusCode}; expected 0 after deploy`)
    }
  })

  console.log('Running production bootstrap...')
  await runWithRehearsalEnv(rehearsalUrl, {}, async () => {
    const prisma = createPrismaClient(rehearsalUrl)
    try {
      await runProductionBootstrap(prisma)
    } finally {
      await prisma.$disconnect()
    }
  })

  console.log('Running production demo seed...')
  await runWithRehearsalEnv(
    rehearsalUrl,
    {
      ALLOW_PRODUCTION_DEMO_SEED: 'true',
      DEMO_USER_PASSWORD: REHEARSAL_PASSWORD,
    },
    async () => {
      const prisma = createPrismaClient(rehearsalUrl)
      try {
        await runProductionDemoSeed(prisma)
      } finally {
        await prisma.$disconnect()
      }
    },
  )

  const afterFirstRun = await snapshotDemoGraphCounts(rehearsalUrl)

  console.log('Re-running bootstrap and prod-demo seed to verify idempotency...')
  await runWithRehearsalEnv(rehearsalUrl, {}, async () => {
    const prisma = createPrismaClient(rehearsalUrl)
    try {
      await runProductionBootstrap(prisma)
    } finally {
      await prisma.$disconnect()
    }
  })

  await runWithRehearsalEnv(
    rehearsalUrl,
    {
      ALLOW_PRODUCTION_DEMO_SEED: 'true',
      DEMO_USER_PASSWORD: REHEARSAL_PASSWORD,
    },
    async () => {
      const prisma = createPrismaClient(rehearsalUrl)
      try {
        await runProductionDemoSeed(prisma)
      } finally {
        await prisma.$disconnect()
      }
    },
  )

  const afterSecondRun = await snapshotDemoGraphCounts(rehearsalUrl)
  if (JSON.stringify(afterFirstRun) !== JSON.stringify(afterSecondRun)) {
    throw new Error(
      `Idempotency check failed.\nFirst run: ${JSON.stringify(afterFirstRun)}\nSecond run: ${JSON.stringify(afterSecondRun)}`,
    )
  }

  console.log('Verifying dev seed entrypoint is refused under NODE_ENV=production...')
  try {
    const output = execFileSync('pnpm', ['exec', 'ts-node', 'prisma/seed-dev.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: rehearsalUrl,
      },
      encoding: 'utf8',
    })
    throw new Error(
      `pnpm db:seed:dev should fail under NODE_ENV=production, but exited 0 with:\n${output}`,
    )
  } catch (error) {
    if (!(error && typeof error === 'object' && 'status' in error)) {
      throw error
    }

    const execError = error as { status?: number; stdout?: string; stderr?: string }
    if (execError.status === 0) {
      throw error
    }

    const combinedOutput = `${execError.stderr ?? ''}${execError.stdout ?? ''}`
    if (!combinedOutput.includes('Dev seed refused') || !combinedOutput.includes('NODE_ENV=production')) {
      throw new Error(
        'Expected dev seed guard refusal, but seed-dev.ts failed for another reason:\n' +
          combinedOutput,
      )
    }
  }

  console.log('Production-like rehearsal completed successfully.')
  console.log(`Database: ${REHEARSAL_DATABASE_NAME}`)
  console.log(`Counts: ${JSON.stringify(afterSecondRun)}`)
  console.log(`Rehearsal URL: ${createNamedRehearsalDatabaseUrl()}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
