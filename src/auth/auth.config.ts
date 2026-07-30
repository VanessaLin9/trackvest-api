import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const INSECURE_PRODUCTION_JWT_SECRETS = new Set([
  'dev_dev_dev_change_me',
  'change_me_in_prod',
])

/**
 * Auth／cookie 設定集中處（PR #15）。
 * Production 禁止使用已知 insecure 預設 secret（PR #16）。
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
    // 擋掉把 .env.example 預設值直接上 prod（PR #16）。
    if (process.env.NODE_ENV === 'production' && INSECURE_PRODUCTION_JWT_SECRETS.has(secret)) {
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
