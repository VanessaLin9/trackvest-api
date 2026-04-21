import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import { AuthGuard } from './auth.guard'
import { IS_PUBLIC_KEY, Public } from '../decorators/public.decorator'
import { ROLES_KEY, Roles } from '../decorators/roles.decorator'

type MockReq = {
  headers?: Record<string, unknown>
  query?: Record<string, unknown>
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

describe('AuthGuard', () => {
  const reflector = new Reflector()
  const buildPrisma = (user: { id: string; role: UserRole } | null) => ({
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
    },
  })

  it('allows public routes without looking up the user', async () => {
    const prisma = buildPrisma(null)
    const guard = new AuthGuard(reflector, prisma as never)

    class C {
      @Public()
      handler() {}
    }
    const handler = Object.getOwnPropertyDescriptor(C.prototype, 'handler')!.value
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      getHandler: () => handler,
      getClass: () => C,
    } as unknown as ExecutionContext

    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('rejects requests without a user id', async () => {
    const prisma = buildPrisma(null)
    const guard = new AuthGuard(reflector, prisma as never)
    const { ctx } = buildContext({ headers: {}, query: {} })

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects unknown users', async () => {
    const prisma = buildPrisma(null)
    const guard = new AuthGuard(reflector, prisma as never)
    const { ctx } = buildContext({ headers: { 'x-user-id': 'ghost' } })

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('attaches req.user for authenticated calls', async () => {
    const prisma = buildPrisma({ id: 'u1', role: UserRole.user })
    const guard = new AuthGuard(reflector, prisma as never)
    const request: MockReq = { headers: { 'x-user-id': 'u1' }, query: {} }
    const { ctx } = buildContext(request)

    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(request.user).toEqual({ id: 'u1', role: UserRole.user })
  })

  it('reads userId from the query param as a fallback', async () => {
    const prisma = buildPrisma({ id: 'u1', role: UserRole.user })
    const guard = new AuthGuard(reflector, prisma as never)
    const request: MockReq = { headers: {}, query: { userId: 'u1' } }
    const { ctx } = buildContext(request)

    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(request.user).toEqual({ id: 'u1', role: UserRole.user })
  })

  it('enforces @Roles(admin) on non-admin users', async () => {
    const prisma = buildPrisma({ id: 'u1', role: UserRole.user })
    const guard = new AuthGuard(reflector, prisma as never)

    class C {
      @Roles(UserRole.admin)
      handler() {}
    }
    const handler = Object.getOwnPropertyDescriptor(C.prototype, 'handler')!.value
    const request: MockReq = { headers: { 'x-user-id': 'u1' } }
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => C,
    } as unknown as ExecutionContext

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('allows @Roles(admin) for admin users', async () => {
    const prisma = buildPrisma({ id: 'u1', role: UserRole.admin })
    const guard = new AuthGuard(reflector, prisma as never)

    class C {
      @Roles(UserRole.admin)
      handler() {}
    }
    const handler = Object.getOwnPropertyDescriptor(C.prototype, 'handler')!.value
    const request: MockReq = { headers: { 'x-user-id': 'u1' } }
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => C,
    } as unknown as ExecutionContext

    await expect(guard.canActivate(ctx)).resolves.toBe(true)
  })

  it('uses IS_PUBLIC_KEY and ROLES_KEY sentinels', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic')
    expect(ROLES_KEY).toBe('roles')
  })
})
