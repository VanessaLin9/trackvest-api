import { ConfigService } from '@nestjs/config'
import { AuthConfig } from './auth.config'

describe('AuthConfig', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  function buildConfig(values: Record<string, string | undefined>): ConfigService {
    return {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService
  }

  it('rejects sample JWT secrets in production', () => {
    process.env.NODE_ENV = 'production'

    for (const jwtSecret of ['dev_dev_dev_change_me', 'change_me_in_prod']) {
      expect(() => new AuthConfig(buildConfig({ JWT_SECRET: jwtSecret }))).toThrow(
        'JWT_SECRET must be changed from its dev default in production',
      )
    }
  })

  it('allows sample JWT secrets outside production', () => {
    process.env.NODE_ENV = 'test'

    expect(new AuthConfig(buildConfig({ JWT_SECRET: 'change_me_in_prod' })).jwtSecret)
      .toBe('change_me_in_prod')
  })
})
