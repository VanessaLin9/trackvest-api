import { withEnv } from './testing/with-env'
import {
  assertDevSeedAllowed,
  assertProductionDemoSeedAllowed,
  SeedGuardError,
} from './seed-guards'

describe('seed guards', () => {
  it('rejects dev seed when NODE_ENV=production', async () => {
    await withEnv({ NODE_ENV: 'production' }, () => {
      expect(() => assertDevSeedAllowed()).toThrow(SeedGuardError)
      expect(() => assertDevSeedAllowed()).toThrow(/NODE_ENV=production/)
    })
  })

  it('allows dev seed when NODE_ENV is not production', async () => {
    await withEnv({ NODE_ENV: 'development' }, () => {
      expect(() => assertDevSeedAllowed()).not.toThrow()
    })

    await withEnv({ NODE_ENV: undefined }, () => {
      expect(() => assertDevSeedAllowed()).not.toThrow()
    })
  })

  it('rejects production demo seed without ALLOW_PRODUCTION_DEMO_SEED=true', async () => {
    await withEnv({ ALLOW_PRODUCTION_DEMO_SEED: undefined }, () => {
      expect(() => assertProductionDemoSeedAllowed()).toThrow(SeedGuardError)
    })

    await withEnv({ ALLOW_PRODUCTION_DEMO_SEED: 'false' }, () => {
      expect(() => assertProductionDemoSeedAllowed()).toThrow(SeedGuardError)
    })

    await withEnv({ ALLOW_PRODUCTION_DEMO_SEED: 'yes' }, () => {
      expect(() => assertProductionDemoSeedAllowed()).toThrow(SeedGuardError)
    })
  })

  it('allows production demo seed when ALLOW_PRODUCTION_DEMO_SEED=true', async () => {
    await withEnv({ ALLOW_PRODUCTION_DEMO_SEED: 'true' }, () => {
      expect(() => assertProductionDemoSeedAllowed()).not.toThrow()
    })
  })
})
