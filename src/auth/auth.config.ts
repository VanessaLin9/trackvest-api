import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * Centralized auth/cookie settings. Keeping this thin wrapper makes it
 * easier to swap implementations or defaults without touching every
 * consumer, and gives us one place to fail-fast if a required secret is
 * missing in production.
 */
@Injectable()
export class AuthConfig {
  readonly jwtSecret: string
  readonly accessTtlSec: number
  readonly refreshTtlSec: number
  readonly cookieSecure: boolean
  readonly cookieSameSite: 'lax' | 'strict' | 'none'
  readonly cookieDomain?: string

  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET')
    if (!secret) {
      throw new Error('JWT_SECRET is required')
    }
    if (process.env.NODE_ENV === 'production' && secret === 'dev_dev_dev_change_me') {
      throw new Error('JWT_SECRET must be changed from its dev default in production')
    }
    this.jwtSecret = secret
    this.accessTtlSec = Number(config.get<string>('JWT_ACCESS_TTL_SEC') ?? 900)
    this.refreshTtlSec = Number(config.get<string>('JWT_REFRESH_TTL_SEC') ?? 7 * 24 * 3600)

    const secureRaw = config.get<string>('COOKIE_SECURE')
    this.cookieSecure =
      secureRaw !== undefined
        ? secureRaw.toLowerCase() === 'true'
        : process.env.NODE_ENV === 'production'

    const sameSiteRaw = (config.get<string>('COOKIE_SAMESITE') ?? 'lax').toLowerCase()
    this.cookieSameSite = (['lax', 'strict', 'none'].includes(sameSiteRaw)
      ? sameSiteRaw
      : 'lax') as 'lax' | 'strict' | 'none'

    this.cookieDomain = config.get<string>('COOKIE_DOMAIN') || undefined
  }
}

export const ACCESS_TOKEN_COOKIE = 'access_token'
export const REFRESH_TOKEN_COOKIE = 'refresh_token'

/** Path on which the refresh cookie is exposed. Limits exfiltration surface. */
export const REFRESH_COOKIE_PATH = '/auth'
