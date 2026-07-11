import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DEV_SEED_RUNNER_PATH = join(process.cwd(), 'prisma', 'seed', 'dev-seed-runner.ts')
const DEMO_USER_GRAPH_UPSERT_PATH = join(
  process.cwd(),
  'prisma',
  'seed',
  'demo-user-graph-upsert.ts',
)
const PROD_DEMO_RUNNER_PATH = join(process.cwd(), 'prisma', 'seed', 'prod-demo-seed-runner.ts')
const CATALOG_BOOTSTRAP_PATH = join(process.cwd(), 'prisma', 'seed', 'catalog-bootstrap.ts')

function readSource(path: string) {
  return readFileSync(path, 'utf8')
}

describe('Dev seed (CP2 layout)', () => {
  it('wipes all application tables via deleteMany in dev-seed-runner', () => {
    const source = readSource(DEV_SEED_RUNNER_PATH)

    expect(source).toMatch(/export async function wipeAllData\(prisma: PrismaClient\)/)
    expect(source).toMatch(/await prisma\.user\.deleteMany\(\)/)
    expect(source).toMatch(/await prisma\.glLine\.deleteMany\(\)/)
    expect(source).toMatch(/await prisma\.corporateActionApplication\.deleteMany\(\)/)
  })

  it('calls assertDevSeedAllowed before any database write', () => {
    const source = readSource(DEV_SEED_RUNNER_PATH)

    expect(source).toMatch(/assertDevSeedAllowed\(\)/)
    const guardIndex = source.indexOf('assertDevSeedAllowed()')
    const wipeIndex = source.indexOf('wipeAllData(prisma)')
    expect(guardIndex).toBeGreaterThan(-1)
    expect(wipeIndex).toBeGreaterThan(guardIndex)
  })

  it('uses shared demo identity from demo-identity.ts', () => {
    const source = readSource(DEV_SEED_RUNNER_PATH)

    expect(source).toContain("from './demo-identity'")
    expect(source).toContain('resolveDevDemoUserPassword()')
    expect(source).not.toMatch(/const DEMO_USER_ID = '/)
  })

  it('seeds global catalog separately from demo user graph', () => {
    const devSource = readSource(DEV_SEED_RUNNER_PATH)
    const upsertSource = readSource(DEMO_USER_GRAPH_UPSERT_PATH)

    expect(devSource).toMatch(/export async function seedGlobalCatalog\(prisma: PrismaClient\)/)
    expect(devSource).toMatch(/await prisma\.asset\.createMany\(/)
    expect(devSource).toMatch(/await prisma\.price\.createMany\(/)
    expect(devSource).toMatch(/runTwCatalogBootstrapSeed\(prisma\)/)

    const globalCatalogIndex = devSource.indexOf('seedGlobalCatalog(prisma)')
    const twBootstrapIndex = devSource.indexOf('runTwCatalogBootstrapSeed(prisma)')
    const demoGraphIndex = devSource.indexOf('seedDemoUserGraphCreate(prisma)')
    expect(twBootstrapIndex).toBeGreaterThan(globalCatalogIndex)
    expect(demoGraphIndex).toBeGreaterThan(twBootstrapIndex)

    expect(upsertSource).not.toMatch(/prisma\.asset\./)
    expect(upsertSource).not.toMatch(/prisma\.price\./)
    expect(upsertSource).not.toMatch(/prisma\.fxRate\./)
    expect(upsertSource).toMatch(/\$transaction/)
    expect(upsertSource).toMatch(/assertDemoOwnershipGraphSafeForUpsert/)
    expect(upsertSource).toMatch(/resolveDemoUserPasswordHash/)
    expect(upsertSource).toMatch(/await db\.transaction\.upsert\(/)
  })

  it('bootstrap catalog uses preflight and transaction before upsert', () => {
    const source = readSource(CATALOG_BOOTSTRAP_PATH)
    const bootstrapRunner = readSource(join(process.cwd(), 'prisma', 'seed', 'bootstrap-runner.ts'))

    expect(source).toMatch(/assertCatalogBootstrapSafeForUpsert/)
    expect(source).toMatch(/\$transaction/)
    expect(source).toMatch(/asset\.upsert/)
    expect(bootstrapRunner).toMatch(/runTwCatalogBootstrapSeed\(prisma\)/)
  })

  it('prod-demo runner requires ALLOW_PRODUCTION_DEMO_SEED and catalog assets', () => {
    const source = readSource(PROD_DEMO_RUNNER_PATH)

    expect(source).toMatch(/assertProductionDemoSeedAllowed\(\)/)
    expect(source).toMatch(/resolveProductionDemoUserPassword\(\)/)
    expect(source).toMatch(/assertDemoCatalogAssetsExist\(prisma\)/)
    expect(source).toMatch(/seedDemoUserGraphUpsert\(prisma\)/)
    expect(source).not.toMatch(/wipeAllData/)
  })

  it('wires dev seed through prisma.config.ts seed-dev entry', () => {
    const configSource = readFileSync(join(process.cwd(), 'prisma.config.ts'), 'utf8')

    expect(configSource).toContain("seed: 'ts-node prisma/seed-dev.ts'")
  })
})
