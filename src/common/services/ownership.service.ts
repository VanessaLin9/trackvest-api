import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import { UserRole } from '@prisma/client'

/**
 * Service to validate resource ownership
 * Centralized ownership validation logic
 * Admins can bypass ownership checks
 */
@Injectable()
export class OwnershipService {
  constructor(private prisma: PrismaService) {}

  /**
   * Check if a user is an admin
   */
  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    return user?.role === UserRole.admin
  }

  /**
   * Validate that an account belongs to a user
   * Admins can access any account
   */
  async validateAccountOwnership(accountId: string, userId: string): Promise<void> {
    // Admins can access all resources
    if (await this.isAdmin(userId)) {
      // Still validate that account exists
      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { id: true },
      })
      if (!account) {
        throw new NotFoundException('Account not found')
      }
      return
    }

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { userId: true },
    })

    if (!account) {
      throw new NotFoundException('Account not found')
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('You do not have access to this account')
    }
  }

  /**
   * Validate that a transaction belongs to a user (via account)
   * Admins can access any transaction
   */
  async validateTransactionOwnership(transactionId: string, userId: string): Promise<void> {
    // Admins can access all resources
    if (await this.isAdmin(userId)) {
      // Still validate that transaction exists
      const transaction = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { id: true },
      })
      if (!transaction) {
        throw new NotFoundException('Transaction not found')
      }
      return
    }

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

    if (transaction.account.userId !== userId) {
      throw new ForbiddenException('You do not have access to this transaction')
    }
  }

  /**
   * Validate that a GL account belongs to a user
   * Admins can access any GL account
   */
  async validateGlAccountOwnership(glAccountId: string, userId: string): Promise<void> {
    // Admins can access all resources
    if (await this.isAdmin(userId)) {
      // Still validate that GL account exists
      const glAccount = await this.prisma.glAccount.findUnique({
        where: { id: glAccountId },
        select: { id: true },
      })
      if (!glAccount) {
        throw new NotFoundException('GL Account not found')
      }
      return
    }

    const glAccount = await this.prisma.glAccount.findUnique({
      where: { id: glAccountId },
      select: { userId: true },
    })

    if (!glAccount) {
      throw new NotFoundException('GL Account not found')
    }

    if (glAccount.userId !== userId) {
      throw new ForbiddenException('You do not have access to this GL account')
    }
  }

  /**
   * Validate that a GL entry belongs to a user
   * Admins can access any GL entry
   */
  async validateGlEntryOwnership(glEntryId: string, userId: string): Promise<void> {
    // Admins can access all resources
    if (await this.isAdmin(userId)) {
      // Still validate that GL entry exists
      const glEntry = await this.prisma.glEntry.findUnique({
        where: { id: glEntryId },
        select: { id: true },
      })
      if (!glEntry) {
        throw new NotFoundException('GL Entry not found')
      }
      return
    }

    const glEntry = await this.prisma.glEntry.findUnique({
      where: { id: glEntryId },
      select: { userId: true },
    })

    if (!glEntry) {
      throw new NotFoundException('GL Entry not found')
    }

    if (glEntry.userId !== userId) {
      throw new ForbiddenException('You do not have access to this GL entry')
    }
  }

  /**
   * Validate that a tag belongs to a user
   * Admins can access any tag
   */
  async validateTagOwnership(tagId: string, userId: string): Promise<void> {
    // Admins can access all resources
    if (await this.isAdmin(userId)) {
      // Still validate that tag exists
      const tag = await this.prisma.tag.findUnique({
        where: { id: tagId },
        select: { id: true },
      })
      if (!tag) {
        throw new NotFoundException('Tag not found')
      }
      return
    }

    const tag = await this.prisma.tag.findUnique({
      where: { id: tagId },
      select: { userId: true },
    })

    if (!tag) {
      throw new NotFoundException('Tag not found')
    }

    if (tag.userId !== userId) {
      throw new ForbiddenException('You do not have access to this tag')
    }
  }

  /**
   * Validate that a user exists
   */
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

