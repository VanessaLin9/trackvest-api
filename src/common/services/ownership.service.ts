import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { AuthenticatedUser, UserContext } from '../types/auth-user'

/**
 * Centralised ownership / admin-bypass validation.
 *
 * Callers may pass either a plain user id (string) or an `AuthenticatedUser`.
 * Passing the full object avoids an extra `isAdmin` database round-trip
 * (the role is already known from `AuthGuard`).
 */
@Injectable()
export class OwnershipService {
  constructor(private prisma: PrismaService) {}

  /** Resolve `{ userId, isAdmin }` from the caller context, querying the DB only when role is unknown. */
  async resolveUser(ctx: UserContext): Promise<{ userId: string; isAdmin: boolean }> {
    if (typeof ctx === 'string') {
      return { userId: ctx, isAdmin: await this.isAdmin(ctx) }
    }
    return { userId: ctx.id, isAdmin: ctx.role === UserRole.admin }
  }

  /** Check whether a user has the admin role (DB lookup). Prefer passing `AuthenticatedUser` when available. */
  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    return user?.role === UserRole.admin
  }

  /**
   * Guard used by endpoints that accept a `userId` in the request body.
   * Admins may act on behalf of any user; everyone else may only act on their own id.
   */
  assertSameUserOrAdmin(targetUserId: string, currentUser: AuthenticatedUser): void {
    if (currentUser.role === UserRole.admin) return
    if (currentUser.id !== targetUserId) {
      throw new ForbiddenException('You do not have permission to act on behalf of this user')
    }
  }

  async validateAccountOwnership(accountId: string, ctx: UserContext): Promise<void> {
    const { userId, isAdmin } = await this.resolveUser(ctx)

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { userId: true },
    })

    if (!account) {
      throw new NotFoundException('Account not found')
    }

    if (!isAdmin && account.userId !== userId) {
      throw new ForbiddenException('You do not have access to this account')
    }
  }

  async validateTransactionOwnership(transactionId: string, ctx: UserContext): Promise<void> {
    const { userId, isAdmin } = await this.resolveUser(ctx)

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        account: {
          select: { userId: true },
        },
      },
    })

    if (!transaction) {
      throw new NotFoundException('Transaction not found')
    }

    if (!isAdmin && transaction.account.userId !== userId) {
      throw new ForbiddenException('You do not have access to this transaction')
    }
  }

  async validateGlAccountOwnership(glAccountId: string, ctx: UserContext): Promise<void> {
    const { userId, isAdmin } = await this.resolveUser(ctx)

    const glAccount = await this.prisma.glAccount.findUnique({
      where: { id: glAccountId },
      select: { userId: true },
    })

    if (!glAccount) {
      throw new NotFoundException('GL Account not found')
    }

    if (!isAdmin && glAccount.userId !== userId) {
      throw new ForbiddenException('You do not have access to this GL account')
    }
  }

  async validateGlEntryOwnership(glEntryId: string, ctx: UserContext): Promise<void> {
    const { userId, isAdmin } = await this.resolveUser(ctx)

    const glEntry = await this.prisma.glEntry.findUnique({
      where: { id: glEntryId },
      select: { userId: true },
    })

    if (!glEntry) {
      throw new NotFoundException('GL Entry not found')
    }

    if (!isAdmin && glEntry.userId !== userId) {
      throw new ForbiddenException('You do not have access to this GL entry')
    }
  }

  async validateTagOwnership(tagId: string, ctx: UserContext): Promise<void> {
    const { userId, isAdmin } = await this.resolveUser(ctx)

    const tag = await this.prisma.tag.findUnique({
      where: { id: tagId },
      select: { userId: true },
    })

    if (!tag) {
      throw new NotFoundException('Tag not found')
    }

    if (!isAdmin && tag.userId !== userId) {
      throw new ForbiddenException('You do not have access to this tag')
    }
  }

  async validateUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }
  }
}
