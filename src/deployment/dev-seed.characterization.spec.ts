import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SEED_PATH = join(process.cwd(), 'prisma', 'seed.ts')

function readSeedSource() {
  return readFileSync(SEED_PATH, 'utf8')
}

describe('Dev seed (CP0 characterization)', () => {
  /*
   * Baseline inventory before CP2 seed separation.
   * These tests document current behavior; CP2 will add guards and split entry points.
   */

  it('starts by wiping all application tables via deleteMany', () => {
    const source = readSeedSource()

    expect(source).toMatch(/async function wipeAllData\(\)/)
    expect(source).toMatch(/await prisma\.user\.deleteMany\(\)/)
    expect(source).toMatch(/await prisma\.glLine\.deleteMany\(\)/)
    expect(source).toMatch(/await prisma\.corporateActionApplication\.deleteMany\(\)/)
  })

  it('has no NODE_ENV production guard before writes (pre-CP2 baseline)', () => {
    const source = readSeedSource()

    expect(source).not.toMatch(/NODE_ENV/)
    expect(source).not.toMatch(/ALLOW_PRODUCTION_DEMO_SEED/)
  })

  it('uses a fixed demo user identity suitable for future prod-demo seed', () => {
    const source = readSeedSource()

    expect(source).toContain("DEMO_USER_ID = '5f9b7d4a-69d4-4a78-98f4-bc82eeac1001'")
    expect(source).toContain("DEMO_USER_EMAIL = 'demo@trackvest.local'")
    expect(source).toMatch(/DEMO_USER_PASSWORD = process\.env\.DEMO_USER_PASSWORD/)
  })

  it('creates demo-owned records and global catalog fixtures', () => {
    const source = readSeedSource()

    // User-owned graph (all keyed to demoUser.id or fixed demo account ids)
    expect(source).toMatch(/await prisma\.user\.create\(/)
    expect(source).toMatch(/await prisma\.account\.createMany\(/)
    expect(source).toMatch(/await prisma\.glAccount\.createMany\(/)
    expect(source).toMatch(/await prisma\.transaction\.createMany\(/)
    expect(source).toMatch(/await prisma\.position\.createMany\(/)
    expect(source).toMatch(/await prisma\.positionLot\.createMany\(/)
    expect(source).toMatch(/await prisma\.sellLotMatch\.createMany\(/)
    expect(source).toMatch(/await prisma\.glEntry\.createMany\(/)
    expect(source).toMatch(/await prisma\.glLine\.createMany\(/)

    // Global catalog (no userId — shared across users)
    expect(source).toMatch(/await prisma\.asset\.createMany\(/)
    expect(source).toMatch(/await prisma\.assetAlias\.createMany\(/)

    // Market data fixtures (asset-scoped, not user-scoped)
    expect(source).toMatch(/await prisma\.price\.createMany\(/)
    expect(source).toMatch(/await prisma\.fxRate\.createMany\(/)
  })

  it('is wired as the sole Prisma seed entry in prisma.config.ts', () => {
    const configSource = readFileSync(join(process.cwd(), 'prisma.config.ts'), 'utf8')

    expect(configSource).toContain("seed: 'ts-node prisma/seed.ts'")
  })
})
