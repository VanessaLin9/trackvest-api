import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import { Account, Currency, GlAccountPurpose, GlAccountType, GlEntry, Prisma } from '@prisma/client'
import { GetAccountDto } from '../dto/get-account.dto'
import { GlEntryDto } from '../dto/get-entry.dto'

type DbClient = Prisma.TransactionClient | PrismaService

/**
 * Service for looking up GL accounts by various criteria
 * Centralizes GL account discovery logic
 */
@Injectable()
export class GlService {
  constructor(private prisma: PrismaService) {}

  private getDb(db?: DbClient) {
    return db ?? this.prisma
  }

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
  async getLinkedCashGlAccountId(accountId: string, db?: DbClient): Promise<string> {
    const prisma = this.getDb(db)
    const gl = await prisma.glAccount.findFirst({
      where: { linkedAccountId: accountId },
    })
    if (!gl) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
      })
      if (!account) {
        throw new BadRequestException(`Account(${accountId}) not found.`)
      }

      const createdGl = await prisma.glAccount.create({
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
   * Look up a GL account by its system-defined purpose.
   *
   * - `investment_bucket` is treated as currency-scoped; callers pass `currency`
   *   so the correct per-currency bucket is returned.
   * - Other purposes (equity / fee / dividend / realized gain|loss) are
   *   currency-agnostic today; callers may pass `currency` to narrow down if
   *   the user has multiple currency variants.
   */
  async getByPurpose(
    userId: string,
    purpose: GlAccountPurpose,
    currency?: Currency,
    db?: DbClient,
  ): Promise<string> {
    const gl = await this.getDb(db).glAccount.findFirst({
      where: {
        userId,
        purpose,
        ...(currency ? { currency } : {}),
      },
    })
    if (!gl) {
      const suffix = currency ? ` (${currency})` : ''
      throw new BadRequestException(
        `GL account with purpose "${purpose}"${suffix} not found for user`,
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
    db?: DbClient,
  ): Promise<string> {
    return this.getByPurpose(userId, GlAccountPurpose.investment_bucket, currency, db)
  }

  /**
   * Find fee expense GL account
   */
  async getFeeExpenseGlAccountId(userId: string, db?: DbClient): Promise<string> {
    return this.getByPurpose(userId, GlAccountPurpose.fee_expense, undefined, db)
  }

  /**
   * Find dividend income GL account
   */
  async getDividendIncomeGlAccountId(userId: string, db?: DbClient): Promise<string> {
    return this.getByPurpose(userId, GlAccountPurpose.dividend_income, undefined, db)
  }

  /**
   * Find realized gain income GL account
   */
  async getRealizedGainIncomeGlAccountId(userId: string, db?: DbClient): Promise<string> {
    return this.getByPurpose(userId, GlAccountPurpose.realized_gain_income, undefined, db)
  }

  /**
   * Find realized loss expense GL account
   */
  async getRealizedLossExpenseGlAccountId(userId: string, db?: DbClient): Promise<string> {
    return this.getByPurpose(userId, GlAccountPurpose.realized_loss_expense, undefined, db)
  }

  /**
   * Find equity GL account
   */
  async getEquityGlAccountId(userId: string, db?: DbClient): Promise<string> {
    return this.getByPurpose(userId, GlAccountPurpose.equity_contribution, undefined, db)
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
