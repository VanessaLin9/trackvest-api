import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import { Account, Currency, GlAccountType, GlEntry } from '@prisma/client'
import { GetAccountDto } from '../dto/get-account.dto'
import { GlEntryDto } from '../dto/get-entry.dto'

/**
 * Service for looking up GL accounts by various criteria
 * Centralizes GL account discovery logic
 */
@Injectable()
export class GlService {
  constructor(private prisma: PrismaService) {}

  private formatCurrencyLabel(currency: Currency): string {
    switch (currency) {
      case 'TWD':
        return '台幣'
      case 'USD':
        return '美元'
      case 'JPY':
        return '日圓'
      case 'EUR':
        return '歐元'
      default:
        return currency
    }
  }

  private buildLinkedGlAccountName(account: Pick<Account, 'id' | 'name' | 'type' | 'currency'>): string {
    const accountTypeLabel =
      account.type === 'broker'
        ? '券商現金'
        : account.type === 'bank'
        ? '銀行'
        : '現金'

    return `資產-${accountTypeLabel}-${account.name}-${account.id.slice(0, 8)}(${this.formatCurrencyLabel(account.currency)})`
  }

  /**
   * Find GL account linked to a regular account
   */
  async getLinkedCashGlAccountId(accountId: string): Promise<string> {
    const gl = await this.prisma.glAccount.findFirst({
      where: { linkedAccountId: accountId },
    })
    if (!gl) {
      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
      })
      if (!account) {
        throw new BadRequestException(`Account(${accountId}) not found.`)
      }

      const createdGl = await this.prisma.glAccount.create({
        data: {
          userId: account.userId,
          name: this.buildLinkedGlAccountName(account),
          type: GlAccountType.asset,
          currency: account.currency,
          linkedAccountId: account.id,
        },
      })
      return createdGl.id
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
          isDeleted: false,
          ...(accountId !== 'All' ? {
            lines: {
              some: {
                glAccountId: { equals: accountId },
              },
            },
          } : {}),
        },
        include: {
          lines: {
            include: {
              glAccount: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  currency: true,
                },
              },
            },
          },
        },
      })
    } else {
    entries = await this.prisma.glEntry.findMany({
      where: {
        userId: { equals: userId },
        isDeleted: false,
        lines: {
          some: {
            glAccountId: { equals: accountId },
          },
        },
      },
      include: {
        lines: {
          include: {
            glAccount: {
              select: {
                id: true,
                name: true,
                type: true,
                currency: true,
              },
            },
          },
          },
        },
      })
    }
    return entries?.map(GlEntryDto.fromEntity).sort((a, b) => b.date.localeCompare(a.date)) ?? []
  }
}
