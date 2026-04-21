import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import { Account, Currency, GlAccountPurpose, GlAccountType, Prisma } from '@prisma/client'
import { GetAccountDto } from '../dto/get-account.dto'
import { GlEntryDto } from '../dto/get-entry.dto'

/**
 * Sentinel value used by the GET /gl/entries endpoint to indicate "no
 * account filter; return every entry for the user".
 */
export const ALL_GL_ACCOUNTS = 'All'

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
   * List a user's GL accounts filtered by {@link GlAccountType}.
   */
  async findByType(userId: string, type: GlAccountType): Promise<GetAccountDto[]> {
    const accounts = await this.prisma.glAccount.findMany({
      where: { userId, type },
      orderBy: { name: 'asc' },
    })
    return accounts.map(GetAccountDto.fromEntity)
  }

  /**
   * List GL entries for a user, optionally scoped to a single GL account.
   *
   * Pass {@link ALL_GL_ACCOUNTS} (or an empty value) to skip the account
   * filter. Results are ordered by entry date descending at the database
   * level.
   */
  async getEntriesByAccountId(userId: string, accountId: string): Promise<GlEntryDto[]> {
    const hasAccountFilter = accountId && accountId !== ALL_GL_ACCOUNTS

    const entries = await this.prisma.glEntry.findMany({
      where: {
        userId,
        isDeleted: false,
        ...(hasAccountFilter
          ? { lines: { some: { glAccountId: accountId } } }
          : {}),
      },
      include: {
        lines: {
          include: {
            glAccount: {
              select: { id: true, name: true, type: true, currency: true },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    })
    return entries.map(GlEntryDto.fromEntity)
  }
}
