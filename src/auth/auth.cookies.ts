import type { CookieOptions, Response } from 'express'
import {
  ACCESS_TOKEN_COOKIE,
  AuthConfig,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
} from './auth.config'

/**
 * Cookie flag 集中設定（PR #15）：login／refresh／logout 行為一致。
 * Refresh cookie path=`/auth`，縮小外洩面。
 */
export function buildAccessCookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    domain: config.cookieDomain,
    maxAge: config.accessTtlSec * 1000,
  }
}

export function buildRefreshCookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: REFRESH_COOKIE_PATH,
    domain: config.cookieDomain,
    maxAge: config.refreshTtlSec * 1000,
  }
}

export function setSessionCookies(
  res: Response,
  config: AuthConfig,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, buildAccessCookieOptions(config))
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, buildRefreshCookieOptions(config))
}

export function clearSessionCookies(res: Response, config: AuthConfig): void {
  const accessOpts = buildAccessCookieOptions(config)
  const refreshOpts = buildRefreshCookieOptions(config)
  // `clearCookie` ignores maxAge, but must otherwise match the original
  // options (path/domain/sameSite/secure) or browsers won't remove it.
  delete (accessOpts as { maxAge?: number }).maxAge
  delete (refreshOpts as { maxAge?: number }).maxAge
  res.clearCookie(ACCESS_TOKEN_COOKIE, accessOpts)
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshOpts)
}
