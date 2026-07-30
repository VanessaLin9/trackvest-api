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
 * 全域 request auth guard（PR #15）：驗證 `access_token` cookie JWT，
 * 掛 `{ id, role }` 到 `req.user`。`@Public()` 略過；`@Roles()` 再限角色。
 * 只解 token、不查 DB；角色變更最遲 `accessTtlSec` 後生效（刻意取捨）。
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
