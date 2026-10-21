import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.config'
import type { AccessTokenPayload, AccessTokenService } from '../auth/tokens/access-token.service'
import { AuthGuard } from '../common/guards/auth.guard'
import { TransactionsController } from '../transactions/transactions.controller'
import { AssetsController } from './assets.controller'

describe('catalog write and hard delete roles', () => {
  const reflector = new Reflector()

  function buildAccessTokens(
    payloadFor: Record<string, AccessTokenPayload>,
  ): AccessTokenService {
    return {
      verify: jest.fn((token: string) => {
        const payload = payloadFor[token]
        if (!payload) throw new UnauthorizedException('Invalid or expired access token')
        return payload
      }),
      sign: jest.fn(),
    } as unknown as AccessTokenService
  }

  function buildContext(
    controller: new (...args: never[]) => object,
    handlerName: string,
    request: { cookies?: Record<string, string> },
  ): ExecutionContext {
    const handler = Object.getOwnPropertyDescriptor(controller.prototype, handlerName)!.value
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => controller,
    } as unknown as ExecutionContext
  }

  function guardFor(role: UserRole) {
    return new AuthGuard(
      reflector,
      buildAccessTokens({ token: { sub: 'u1', role } }),
    )
  }

  const request = { cookies: { [ACCESS_TOKEN_COOKIE]: 'token' } }

  it.each(['create', 'update', 'remove'] as const)(
    'rejects a regular user on assets %s',
    (handlerName) => {
      expect(() =>
        guardFor(UserRole.user).canActivate(
          buildContext(AssetsController, handlerName, request),
        ),
      ).toThrow(ForbiddenException)
    },
  )

  it.each(['create', 'update', 'remove'] as const)(
    'allows an admin on assets %s',
    (handlerName) => {
      expect(
        guardFor(UserRole.admin).canActivate(
          buildContext(AssetsController, handlerName, request),
        ),
      ).toBe(true)
    },
  )

  it('still lets a regular user create an asset alias', () => {
    expect(
      guardFor(UserRole.user).canActivate(
        buildContext(AssetsController, 'createAlias', request),
      ),
    ).toBe(true)
  })

  it('rejects a regular user on transaction hard delete', () => {
    expect(() =>
      guardFor(UserRole.user).canActivate(
        buildContext(TransactionsController, 'hardDelete', request),
      ),
    ).toThrow(ForbiddenException)
  })

  it('allows an admin on transaction hard delete', () => {
    expect(
      guardFor(UserRole.admin).canActivate(
        buildContext(TransactionsController, 'hardDelete', request),
      ),
    ).toBe(true)
  })

  it('still lets a regular user soft-delete a transaction', () => {
    expect(
      guardFor(UserRole.user).canActivate(
        buildContext(TransactionsController, 'remove', request),
      ),
    ).toBe(true)
  })
})
