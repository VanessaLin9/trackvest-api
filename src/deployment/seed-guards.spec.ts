import { withEnv } from './testing/with-env'
import {
  assertDevSeedAllowed,
  assertProductionDemoSeedAllowed,
  SeedGuardError,
} from './seed-guards'

const LOCAL_DATABASE_URL = 'postgresql://trackvest:trackvest@localhost:5433/trackvest?schema=public'
const REMOTE_DATABASE_URL = 'postgresql://trackvest:trackvest@db.example.com:5432/trackvest?schema=public'

describe('seed guards', () => {
  it('rejects dev seed when NODE_ENV=production', async () => {
    await withEnv({ NODE_ENV: 'production', DATABASE_URL: LOCAL_DATABASE_URL }, () => {
      expect(() => assertDevSeedAllowed()).toThrow(SeedGuardError)
      expect(() => assertDevSeedAllowed()).toThrow(/NODE_ENV=production/)
    })
  })

  it('rejects dev seed when DATABASE_URL points to a remote host', async () => {
    await withEnv({ NODE_ENV: 'development', DATABASE_URL: REMOTE_DATABASE_URL }, () => {
      expect(() => assertDevSeedAllowed()).toThrow(SeedGuardError)
      expect(() => assertDevSeedAllowed()).toThrow(/host "db.example.com"/)
    })

    await withEnv({ NODE_ENV: undefined, DATABASE_URL: REMOTE_DATABASE_URL }, () => {
      expect(() => assertDevSeedAllowed()).toThrow(SeedGuardError)
    })
  })

  it('rejects dev seed when DATABASE_URL is missing or invalid', async () => {
    await withEnv({ NODE_ENV: 'development', DATABASE_URL: undefined }, () => {
      expect(() => assertDevSeedAllowed()).toThrow(SeedGuardError)
      expect(() => assertDevSeedAllowed()).toThrow(/DATABASE_URL is missing/)
    })

    await withEnv({ NODE_ENV: 'development', DATABASE_URL: 'not-a-url' }, () => {
      expect(() => assertDevSeedAllowed()).toThrow(SeedGuardError)
      expect(() => assertDevSeedAllowed()).toThrow(/not a valid URL/)
    })
  })

  it('allows dev seed on localhost when NODE_ENV is not production', async () => {
    await withEnv({ NODE_ENV: 'development', DATABASE_URL: LOCAL_DATABASE_URL }, () => {
      expect(() => assertDevSeedAllowed()).not.toThrow()
    })

    await withEnv({ NODE_ENV: undefined, DATABASE_URL: LOCAL_DATABASE_URL }, () => {
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
