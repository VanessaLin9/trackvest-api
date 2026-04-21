import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AuthenticatedUser } from '../types/auth-user'

/**
 * Returns the id of the authenticated user.
 *
 * Reads from `req.user`, which is populated by `AuthGuard`. Public routes
 * (marked with `@Public()`) will not have `req.user` set; those handlers
 * should not use this decorator.
 *
 * For the full `{ id, role }` object, use `@AuthUser()` instead.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest()
    const user = request?.user as AuthenticatedUser | undefined

    if (!user) {
      throw new UnauthorizedException('User not authenticated')
    }

    return user.id
  },
)
