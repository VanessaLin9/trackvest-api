import type { INestApplication } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { ACCESS_TOKEN_COOKIE } from '../../src/auth/auth.config'
import { AccessTokenService } from '../../src/auth/tokens/access-token.service'

/**
 * Mint a real JWT and return a `Cookie` header value so e2e tests can
 * authenticate without going through the full login flow (no bcrypt work
 * per test). Pair with `.set('Cookie', authCookieFor(app, user))`.
 */
export function authCookieFor(
  app: INestApplication,
  user: { id: string; role?: UserRole },
): string {
  const access = app.get(AccessTokenService)
  const token = access.sign(user.id, user.role ?? UserRole.user)
  return `${ACCESS_TOKEN_COOKIE}=${token}`
}
