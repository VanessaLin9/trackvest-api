import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { OwnershipService } from './ownership.service'
import { AuthenticatedUser } from '../types/auth-user'

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
    },
    glAccount: {
      findUnique: jest.fn(),
    },
    glEntry: {
      findUnique: jest.fn(),
    },
    tag: {
      findUnique: jest.fn(),
    },
    ...overrides,
  }
}

const adminUser: AuthenticatedUser = { id: 'admin-1', role: UserRole.admin }
const regularUser: AuthenticatedUser = { id: 'user-1', role: UserRole.user }

describe('OwnershipService', () => {
  describe('assertSameUserOrAdmin', () => {
    it('passes when the DTO targets the current user', () => {
      const svc = new OwnershipService(buildPrisma() as never)
      expect(() => svc.assertSameUserOrAdmin('user-1', regularUser)).not.toThrow()
    })

    it('passes for admins acting on behalf of other users', () => {
      const svc = new OwnershipService(buildPrisma() as never)
      expect(() => svc.assertSameUserOrAdmin('user-1', adminUser)).not.toThrow()
    })

    it('throws ForbiddenException on cross-user requests by regular users', () => {
      const svc = new OwnershipService(buildPrisma() as never)
      expect(() => svc.assertSameUserOrAdmin('user-2', regularUser)).toThrow(ForbiddenException)
    })
  })

  describe('resolveUser', () => {
    it('returns the role from AuthenticatedUser without hitting the DB', async () => {
      const prisma = buildPrisma()
      const svc = new OwnershipService(prisma as never)
      const result = await svc.resolveUser(regularUser)

      expect(result).toEqual({ userId: 'user-1', isAdmin: false })
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('looks up the role when a plain string is passed', async () => {
      const prisma = buildPrisma()
      prisma.user.findUnique.mockResolvedValueOnce({ role: UserRole.admin })
      const svc = new OwnershipService(prisma as never)

      const result = await svc.resolveUser('user-1')

      expect(result).toEqual({ userId: 'user-1', isAdmin: true })
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { role: true },
      })
    })
  })

  describe('validateAccountOwnership', () => {
    it('skips the isAdmin query when the caller is a regular user', async () => {
      const prisma = buildPrisma()
      prisma.account.findUnique.mockResolvedValueOnce({ userId: 'user-1' })
      const svc = new OwnershipService(prisma as never)

      await svc.validateAccountOwnership('acc-1', regularUser)

      expect(prisma.user.findUnique).not.toHaveBeenCalled()
      expect(prisma.account.findUnique).toHaveBeenCalledTimes(1)
    })

    it('allows admins to access any account', async () => {
      const prisma = buildPrisma()
      prisma.account.findUnique.mockResolvedValueOnce({ userId: 'someone-else' })
      const svc = new OwnershipService(prisma as never)

      await expect(svc.validateAccountOwnership('acc-1', adminUser)).resolves.toBeUndefined()
    })

    it('throws NotFoundException when the account does not exist', async () => {
      const prisma = buildPrisma()
      prisma.account.findUnique.mockResolvedValueOnce(null)
      const svc = new OwnershipService(prisma as never)

      await expect(svc.validateAccountOwnership('missing', regularUser)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws ForbiddenException when the account belongs to a different user', async () => {
      const prisma = buildPrisma()
      prisma.account.findUnique.mockResolvedValueOnce({ userId: 'user-2' })
      const svc = new OwnershipService(prisma as never)

      await expect(svc.validateAccountOwnership('acc-1', regularUser)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('still works when called with a plain string (MCP path)', async () => {
      const prisma = buildPrisma()
      prisma.user.findUnique.mockResolvedValueOnce({ role: UserRole.user })
      prisma.account.findUnique.mockResolvedValueOnce({ userId: 'user-1' })
      const svc = new OwnershipService(prisma as never)

      await svc.validateAccountOwnership('acc-1', 'user-1')

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1)
      expect(prisma.account.findUnique).toHaveBeenCalledTimes(1)
    })
  })

  describe('validateUserExists', () => {
    it('throws NotFoundException when the user is missing', async () => {
      const prisma = buildPrisma()
      prisma.user.findUnique.mockResolvedValueOnce(null)
      const svc = new OwnershipService(prisma as never)

      await expect(svc.validateUserExists('missing')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
