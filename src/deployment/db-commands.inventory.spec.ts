import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const README_PATH = join(process.cwd(), 'README.md')

function readPackageScripts() {
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
  ) as { scripts: Record<string, string> }

  return packageJson.scripts
}

describe('DB / schema command inventory (CP2)', () => {
  it('lists package.json scripts that touch the database or external sync', () => {
    const scripts = readPackageScripts()

    expect(scripts['db:up']).toBeDefined()
    expect(scripts['db:down']).toBeDefined()
    expect(scripts['prisma:migrate']).toContain('migrate dev')
    expect(scripts['db:migrate:deploy']).toContain('migrate deploy')
    expect(scripts['db:migrate:status']).toContain('migrate status')
    expect(scripts['prisma:seed']).toContain('prisma/seed-dev.ts')
    expect(scripts['db:seed']).toContain('prisma db seed')
    expect(scripts['db:seed:dev']).toBe('ts-node prisma/seed-dev.ts')
    expect(scripts['db:bootstrap:prod']).toBe('ts-node prisma/bootstrap-prod.ts')
    expect(scripts['db:seed:prod-demo']).toBe('ts-node prisma/seed-prod-demo.ts')
    expect(scripts['prices:sync-tw']).toBeDefined()
    expect(scripts['prices:sync-us']).toBeDefined()
    expect(scripts['corp-actions:sync-splits']).toBeDefined()
  })

  it('documents dev reset in README and production migrate deploy in deployment runbook', () => {
    const readme = readFileSync(README_PATH, 'utf8')
    const deploymentDoc = readFileSync(join(process.cwd(), 'docs', 'deployment.md'), 'utf8')

    expect(readme).toMatch(/prisma migrate reset/)
    expect(readme).toMatch(/docs\/deployment\.md/)
    expect(readme).toMatch(/db:seed:dev/)
    expect(deploymentDoc).toMatch(/pnpm db:migrate:deploy/)
    expect(deploymentDoc).toMatch(/pnpm db:bootstrap:prod/)
    expect(deploymentDoc).toMatch(/ALLOW_PRODUCTION_DEMO_SEED=true pnpm db:seed:prod-demo/)
    expect(deploymentDoc).toMatch(/Forbidden in production/)
    expect(deploymentDoc).toMatch(/ENABLE_SCHEDULED_JOBS=true/)
  })

  it('documents ALLOW_PRODUCTION_DEMO_SEED in .env.example', () => {
    const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf8')

    expect(envExample).toMatch(/ALLOW_PRODUCTION_DEMO_SEED/)
    expect(envExample).toMatch(/DEMO_USER_PASSWORD/)
  })

  it('documents ENABLE_SCHEDULED_JOBS in .env.example', () => {
    const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf8')

    expect(envExample).toMatch(/ENABLE_SCHEDULED_JOBS/)
  })

  it('registers ScheduleModule.forRoot at AppModule (pre-CP3 baseline)', () => {
    const appModuleSource = readFileSync(join(process.cwd(), 'src', 'app.module.ts'), 'utf8')

    expect(appModuleSource).toMatch(/ScheduleModule\.forRoot\(\)/)
  })
})
