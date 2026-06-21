import { withEnv } from './testing/with-env'
import {
  assertLocalhostDatabaseUrl,
  assertRehearsalDbRecreateAllowed,
  isLocalhostDatabaseUrl,
  RehearsalGuardError,
} from './rehearsal-guards'

describe('rehearsal guards', () => {
  it('accepts localhost and 127.0.0.1 database URLs', () => {
    expect(isLocalhostDatabaseUrl('postgresql://u:p@localhost:5433/trackvest')).toBe(true)
    expect(isLocalhostDatabaseUrl('postgresql://u:p@127.0.0.1:5433/trackvest')).toBe(true)
  })

  it('rejects remote database URLs', () => {
    expect(isLocalhostDatabaseUrl('postgresql://u:p@db.example.com:5432/trackvest')).toBe(false)

    expect(() =>
      assertLocalhostDatabaseUrl('postgresql://u:p@db.example.com:5432/trackvest'),
    ).toThrow(RehearsalGuardError)
  })

  it('requires ALLOW_REHEARSAL_DB_RECREATE=true before database recreate', async () => {
    await withEnv({ ALLOW_REHEARSAL_DB_RECREATE: undefined }, () => {
      expect(() => assertRehearsalDbRecreateAllowed()).toThrow(RehearsalGuardError)
    })

    await withEnv({ ALLOW_REHEARSAL_DB_RECREATE: 'false' }, () => {
      expect(() => assertRehearsalDbRecreateAllowed()).toThrow(RehearsalGuardError)
    })

    await withEnv({ ALLOW_REHEARSAL_DB_RECREATE: 'true' }, () => {
      expect(() => assertRehearsalDbRecreateAllowed()).not.toThrow()
    })
  })
})
