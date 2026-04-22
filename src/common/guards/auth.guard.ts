import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import type { Request } from 'express'
import { ACCESS_TOKEN_COOKIE } from '../../auth/auth.config'
import { AccessTokenService } from '../../auth/tokens/access-token.service'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { AuthenticatedUser } from '../types/auth-user'

/**
 * Global request-level authentication guard.
 *
 * Verifies a JWT access token carried in the `access_token` httpOnly
 * cookie and attaches `{ id, role }` to `req.user`. Routes marked with
 * `@Public()` bypass this, and `@Roles()` further restricts to specific
 * roles.
 *
 * The guard only decodes the token — no DB round-trip — so requests cost
 * one signature verification plus whatever downstream Prisma calls the
 * handler makes. Fresh role changes take effect at most `accessTtlSec`
 * later, which is an explicit trade-off.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (isPublic) return true

    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>()
    const token = this.extractAccessToken(request)
    if (!token) {
      throw new UnauthorizedException('Authentication required')
    }

    const payload = this.accessTokens.verify(token)
    const authenticatedUser: AuthenticatedUser = { id: payload.sub, role: payload.role }
    request.user = authenticatedUser

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    )
    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(payload.role)) {
      throw new ForbiddenException(
        `Requires role(s): ${requiredRoles.join(', ')}`,
      )
    }

    return true
  }

  private extractAccessToken(request: Request): string | null {
    const fromCookie = request.cookies?.[ACCESS_TOKEN_COOKIE]
    if (typeof fromCookie === 'string' && fromCookie.length > 0) {
      return fromCookie
    }
    // Bearer is intentionally not accepted in this iteration: clients
    // must use the httpOnly cookie flow. If we ever need programmatic
    // access (CLI, webhooks), add a dedicated token type here rather
    // than reusing the user access token.
    return null
  }
}
