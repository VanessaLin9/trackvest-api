import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import { Currency, GlAccountType, GlEntry } from '@prisma/client'
import { GetAccountDto } from '../dto/get-account.dto'
import { GlEntryDto } from '../dto/get-entry.dto'

/**
 * Service for looking up GL accounts by various criteria
 * Centralizes GL account discovery logic
 */
@Injectable()
export class GlService {
  constructor(private prisma: PrismaService) {}

  /**
   * Find GL account linked to a regular account
   */
  async getLinkedCashGlAccountId(accountId: string): Promise<string> {
    const gl = await this.prisma.glAccount.findFirst({
      where: { linkedAccountId: accountId },
    })
    if (!gl) {
      throw new BadRequestException(
        `No GL account linked to Account(${accountId}). Seed it first.`,
      )
    }
    return gl.id
  }

  /**
   * Find GL account by name pattern (contains search)
   */
  async getNamedGlAccountId(
    userId: string,
    nameContains: string,
  ): Promise<string> {
    const gl = await this.prisma.glAccount.findFirst({
      where: {
        userId,
        name: { contains: nameContains },
      },
    })
    if (!gl) {
      throw new BadRequestException(
        `GL account not found by name contains "${nameContains}"`,
      )
    }
    return gl.id
  }

  /**
   * Find investment bucket GL account for a currency
   */
  async getInvestmentBucketGlAccountId(
    userId: string,
    currency: Currency,
  ): Promise<string> {
    const gl = await this.prisma.glAccount.findFirst({
      where: {
        userId,
        type: 'asset',
        currency,
        name: { contains: '投資' },
      },
    })
    if (!gl) {
      throw new BadRequestException(
        `Investment bucket GL account not found for ${currency}`,
      )
    }
    return gl.id
  }

  /**
   * Find fee expense GL account
   */
  async getFeeExpenseGlAccountId(userId: string): Promise<string> {
    return this.getNamedGlAccountId(userId, '手續費')
  }

  /**
   * Find dividend income GL account
   */
  async getDividendIncomeGlAccountId(userId: string): Promise<string> {
    return this.getNamedGlAccountId(userId, '股利')
  }

  /**
   * Find realized gain income GL account
   */
  async getRealizedGainIncomeGlAccountId(userId: string): Promise<string> {
    return this.getNamedGlAccountId(userId, '已實現損益-收益')
  }

  /**
   * Find realized loss expense GL account
   */
  async getRealizedLossExpenseGlAccountId(userId: string): Promise<string> {
    return this.getNamedGlAccountId(userId, '已實現損益-損失')
  }

  /**
   * Find equity GL account
   */
  async getEquityGlAccountId(userId: string): Promise<string> {
    return this.getNamedGlAccountId(userId, '權益')
  }

  /**
   * Generic GL account lookup by type and optional name pattern
   */
  async findByTypeAndName(
    userId: string,
    type: GlAccountType,
  ): Promise<GetAccountDto[]> {
    const gl = await this.prisma.glAccount.findMany({
      where: {
        userId : { equals: userId },
      },
    })

    const accounts = gl.filter((gl) => gl.type === type)
    return accounts.map(GetAccountDto.fromEntity)
  }

  async getEntriesByAccountId(userId: string, accountId: string): Promise<GlEntryDto[]> {
    let entries: GlEntry[] | undefined = undefined
    if (accountId === 'All') {
      entries = await this.prisma.glEntry.findMany({
        where: {
          userId: { equals: userId },
        },
        include: {
          lines: true,
        },
      })
    } else {
    entries = await this.prisma.glEntry.findMany({
      where: {
        userId: { equals: userId },
        lines: {
          some: {
            glAccountId: { equals: accountId },
          },
        },
      },
      include: {
        lines: true,
        },
      })
    }
    if (entries) {
      const filteredEntries = entries.filter((entry) => !entry.isDeleted)
      return filteredEntries.map(GlEntryDto.fromEntity).sort((a, b) => b.date.localeCompare(a.date))
    }
    return []
  }
}
