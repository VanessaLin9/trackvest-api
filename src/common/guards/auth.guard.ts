import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { AuthenticatedUser } from '../types/auth-user'

/**
 * Global request-level authentication guard.
 *
 * Current implementation (dev-mode):
 *   - Reads the user id from the `X-User-Id` header (or `userId` query
 *     parameter as a fallback, kept for parity with the legacy
 *     `CurrentUser` decorator).
 *   - Looks up the user once and attaches `{ id, role }` to `req.user`.
 *
 * This is a deliberate seam: when real authentication (JWT / session) is
 * added, only this guard needs to change. Downstream controllers/services
 * keep relying on `req.user`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (isPublic) return true

    const request = ctx.switchToHttp().getRequest()
    const userId = this.extractUserId(request)
    if (!userId) {
      throw new UnauthorizedException(
        'User ID is required. Provide it via X-User-Id header or userId query parameter.',
      )
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    })
    if (!user) {
      throw new UnauthorizedException('Invalid user')
    }

    const authenticatedUser: AuthenticatedUser = { id: user.id, role: user.role }
    request.user = authenticatedUser

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    )
    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Requires role(s): ${requiredRoles.join(', ')}`,
      )
    }

    return true
  }

  private extractUserId(request: { headers?: Record<string, unknown>; query?: Record<string, unknown> } | undefined): string | null {
    if (!request) return null
    const headerValue = request.headers?.['x-user-id']
    const queryValue = request.query?.userId
    const raw = headerValue ?? queryValue
    if (Array.isArray(raw)) {
      return typeof raw[0] === 'string' ? raw[0] : null
    }
    return typeof raw === 'string' ? raw : null
  }
}
