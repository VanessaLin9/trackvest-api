import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AuthenticatedUser } from '../types/auth-user'

/**
 * Returns the full `AuthenticatedUser` (id + role) attached by `AuthGuard`.
 * Prefer this over `@CurrentUser()` when the handler needs the role for
 * admin-bypass / ownership decisions.
 */
export const AuthUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest()
    const user = request?.user as AuthenticatedUser | undefined
    if (!user) {
      throw new UnauthorizedException('User not authenticated')
    }
    return user
  },
)
