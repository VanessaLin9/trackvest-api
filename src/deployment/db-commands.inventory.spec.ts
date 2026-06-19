import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const README_PATH = join(process.cwd(), 'README.md')

function readPackageScripts() {
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
  ) as { scripts: Record<string, string> }

  return packageJson.scripts
}

describe('DB / schema command inventory (CP0)', () => {
  /*
   * Locks the set of commands that can mutate schema or data.
   * CP1 will document production-safe vs dev-only usage in deployment docs.
   */

  it('lists package.json scripts that touch the database or external sync', () => {
    const scripts = readPackageScripts()

    expect(scripts['db:up']).toBeDefined()
    expect(scripts['db:down']).toBeDefined()
    expect(scripts['prisma:migrate']).toContain('migrate dev')
    expect(scripts['db:migrate:deploy']).toContain('migrate deploy')
    expect(scripts['db:migrate:status']).toContain('migrate status')
    expect(scripts['prisma:seed']).toContain('prisma/seed.ts')
    expect(scripts['db:seed']).toContain('prisma db seed')
    expect(scripts['prices:sync-tw']).toBeDefined()
    expect(scripts['prices:sync-us']).toBeDefined()
    expect(scripts['corp-actions:sync-splits']).toBeDefined()
  })

  it('documents dev reset in README and production migrate deploy in deployment runbook', () => {
    const readme = readFileSync(README_PATH, 'utf8')
    const deploymentDoc = readFileSync(join(process.cwd(), 'docs', 'deployment.md'), 'utf8')

    expect(readme).toMatch(/prisma migrate reset/)
    expect(readme).toMatch(/docs\/deployment\.md/)
    expect(deploymentDoc).toMatch(/pnpm db:migrate:deploy/)
    expect(deploymentDoc).toMatch(/prisma migrate reset/)
    expect(deploymentDoc).toMatch(/Forbidden in production/)
  })

  it('does not yet expose production seed or bootstrap scripts (pre-CP2 baseline)', () => {
    const scripts = readPackageScripts()
    const scriptNames = Object.keys(scripts)

    expect(scriptNames).not.toContain('db:bootstrap:prod')
    expect(scriptNames).not.toContain('db:seed:prod-demo')
    expect(scriptNames).not.toContain('db:seed:dev')
  })

  it('does not yet document ENABLE_SCHEDULED_JOBS (pre-CP3 baseline)', () => {
    const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf8')

    expect(envExample).not.toMatch(/ENABLE_SCHEDULED_JOBS/)
  })

  it('registers ScheduleModule.forRoot at AppModule (pre-CP3 baseline)', () => {
    const appModuleSource = readFileSync(join(process.cwd(), 'src', 'app.module.ts'), 'utf8')

    expect(appModuleSource).toMatch(/ScheduleModule\.forRoot\(\)/)
  })
})
