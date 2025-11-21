import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'

/**
 * Decorator to extract current user ID from request
 * For now, reads from header 'X-User-Id' or query param 'userId'
 * Later can be updated to extract from JWT token
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest()
    
    // Priority: header > query param
    const userId = request.headers['x-user-id'] || request.query?.userId
    
    if (!userId) {
      throw new UnauthorizedException('User ID is required. Provide it via X-User-Id header or userId query parameter.')
    }
    
    return userId as string
  },
)

