import type { CookieOptions, Response } from 'express'
import {
  ACCESS_TOKEN_COOKIE,
  AuthConfig,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
} from './auth.config'

/**
 * Helpers that centralize cookie flag decisions so login / refresh /
 * logout all set (or clear) cookies the same way. The refresh cookie is
 * scoped to `/auth` so it only ships to refresh/logout endpoints.
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
