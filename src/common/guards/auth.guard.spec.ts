import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import { ACCESS_TOKEN_COOKIE } from '../../auth/auth.config'
import type { AccessTokenPayload, AccessTokenService } from '../../auth/tokens/access-token.service'
import { AuthGuard } from './auth.guard'
import { IS_PUBLIC_KEY, Public } from '../decorators/public.decorator'
import { ROLES_KEY, Roles } from '../decorators/roles.decorator'

type MockReq = {
  cookies?: Record<string, string>
  user?: unknown
}

function buildContext(request: MockReq): { ctx: ExecutionContext; handler: () => unknown; cls: new () => unknown } {
  const handler = () => undefined
  class HandlerClass {}

  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => HandlerClass,
  } as unknown as ExecutionContext

  return { ctx, handler, cls: HandlerClass }
}

function buildAccessTokens(
  payloadFor: Record<string, AccessTokenPayload>,
): AccessTokenService {
  return {
    verify: jest.fn((token: string) => {
      const p = payloadFor[token]
      if (!p) throw new UnauthorizedException('Invalid or expired access token')
      return p
    }),
    sign: jest.fn(),
  } as unknown as AccessTokenService
}

describe('AuthGuard', () => {
  const reflector = new Reflector()

  it('allows public routes without verifying a token', () => {
    const accessTokens = buildAccessTokens({})
    const guard = new AuthGuard(reflector, accessTokens)

    class C {
      @Public()
      handler() {}
    }
    const handler = Object.getOwnPropertyDescriptor(C.prototype, 'handler')!.value
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ cookies: {} }) }),
      getHandler: () => handler,
      getClass: () => C,
    } as unknown as ExecutionContext

    expect(guard.canActivate(ctx)).toBe(true)
    expect(accessTokens.verify).not.toHaveBeenCalled()
  })

  it('rejects requests without an access token cookie', () => {
    const guard = new AuthGuard(reflector, buildAccessTokens({}))
    const { ctx } = buildContext({ cookies: {} })

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException)
  })

  it('rejects requests with an invalid token', () => {
    const accessTokens = buildAccessTokens({})
    const guard = new AuthGuard(reflector, accessTokens)
    const { ctx } = buildContext({ cookies: { [ACCESS_TOKEN_COOKIE]: 'garbage' } })

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException)
  })

  it('attaches req.user when the token is valid', () => {
    const accessTokens = buildAccessTokens({
      'tok-1': { sub: 'u1', role: UserRole.user },
    })
    const guard = new AuthGuard(reflector, accessTokens)
    const request: MockReq = { cookies: { [ACCESS_TOKEN_COOKIE]: 'tok-1' } }
    const { ctx } = buildContext(request)

    expect(guard.canActivate(ctx)).toBe(true)
    expect(request.user).toEqual({ id: 'u1', role: UserRole.user })
  })

  it('enforces @Roles(admin) on non-admin users', () => {
    const accessTokens = buildAccessTokens({
      'tok-1': { sub: 'u1', role: UserRole.user },
    })
    const guard = new AuthGuard(reflector, accessTokens)

    class C {
      @Roles(UserRole.admin)
      handler() {}
    }
    const handler = Object.getOwnPropertyDescriptor(C.prototype, 'handler')!.value
    const request: MockReq = { cookies: { [ACCESS_TOKEN_COOKIE]: 'tok-1' } }
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => C,
    } as unknown as ExecutionContext

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException)
  })

  it('allows @Roles(admin) for admin users', () => {
    const accessTokens = buildAccessTokens({
      'tok-1': { sub: 'u1', role: UserRole.admin },
    })
    const guard = new AuthGuard(reflector, accessTokens)

    class C {
      @Roles(UserRole.admin)
      handler() {}
    }
    const handler = Object.getOwnPropertyDescriptor(C.prototype, 'handler')!.value
    const request: MockReq = { cookies: { [ACCESS_TOKEN_COOKIE]: 'tok-1' } }
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => C,
    } as unknown as ExecutionContext

    expect(guard.canActivate(ctx)).toBe(true)
  })

  it('uses IS_PUBLIC_KEY and ROLES_KEY sentinels', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic')
    expect(ROLES_KEY).toBe('roles')
  })
})
