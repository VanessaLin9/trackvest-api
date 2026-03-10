import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { OwnershipService } from '../common/services/ownership.service'
import { DashboardSummaryDto } from './dto/dashboard-summary.dto'

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownershipService: OwnershipService,
  ) {}

  private getTodayStart(): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }

  private getMonthStart(): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }

  private toSignedAmount(side: 'debit' | 'credit', amount: unknown): number {
    const numericAmount = Number(amount)
    return side === 'debit' ? numericAmount : -numericAmount
  }

  private getSingleCurrency(values: Array<string | null | undefined>): string | null {
    const unique = [...new Set(values.filter((value): value is string => Boolean(value)))]
    if (unique.length === 1) {
      return unique[0]
    }
    return unique.length === 0 ? null : 'MIXED'
  }

  async getSummary(userId: string): Promise<DashboardSummaryDto> {
    await this.ownershipService.validateUserExists(userId)

    const todayStart = this.getTodayStart()
    const monthStart = this.getMonthStart()

    const [expenseLines, investmentGlAccounts, contributionTransactions] =
      await Promise.all([
        this.prisma.glLine.findMany({
          where: {
            side: 'credit',
            glAccount: {
              type: 'asset',
              userId,
            },
            entry: {
              userId,
              isDeleted: false,
              source: 'manual:expense',
              date: { gte: monthStart },
            },
          },
          select: {
            amount: true,
            currency: true,
            entry: {
              select: { date: true },
            },
          },
        }),
        this.prisma.glAccount.findMany({
          where: {
            userId,
            type: 'asset',
            archivedAt: null,
            OR: [
              { name: { contains: '投資' } },
              {
                linked: {
                  type: 'broker',
                },
              },
            ],
          },
          select: {
            id: true,
            currency: true,
          },
        }),
        this.prisma.transaction.findMany({
          where: {
            isDeleted: false,
            type: { in: ['deposit', 'withdraw'] },
            account: {
              userId,
              type: 'broker',
            },
          },
          select: {
            type: true,
            amount: true,
            account: {
              select: { currency: true },
            },
          },
        }),
      ])

    const todayExpenseAmount = expenseLines.reduce((total, line) => {
      return line.entry.date >= todayStart ? total + Number(line.amount) : total
    }, 0)

    const monthExpenseAmount = expenseLines.reduce((total, line) => {
      return total + Number(line.amount)
    }, 0)

    const investmentAccountIds = investmentGlAccounts.map((account) => account.id)

    const investmentLines = investmentAccountIds.length
      ? await this.prisma.glLine.findMany({
          where: {
            glAccountId: { in: investmentAccountIds },
            entry: {
              userId,
              isDeleted: false,
            },
          },
          select: {
            amount: true,
            side: true,
            currency: true,
          },
        })
      : []

    const totalInvestmentAssetsAmount = investmentLines.reduce((total, line) => {
      return total + this.toSignedAmount(line.side, line.amount)
    }, 0)

    const netContributionAmount = contributionTransactions.reduce((total, transaction) => {
      const signedAmount =
        transaction.type === 'deposit'
          ? Number(transaction.amount)
          : -Number(transaction.amount)
      return total + signedAmount
    }, 0)

    const totalReturnAmount = totalInvestmentAssetsAmount - netContributionAmount
    const totalReturnRate =
      netContributionAmount > 0
        ? (totalReturnAmount / netContributionAmount) * 100
        : 0

    return {
      todayExpense: {
        amount: todayExpenseAmount,
        currency: this.getSingleCurrency(expenseLines.map((line) => line.currency)),
      },
      monthExpense: {
        amount: monthExpenseAmount,
        currency: this.getSingleCurrency(expenseLines.map((line) => line.currency)),
      },
      investment: {
        totalAssets: {
          amount: totalInvestmentAssetsAmount,
          currency: this.getSingleCurrency(
            investmentLines.map((line) => line.currency ?? null),
          ),
        },
        totalReturn: {
          amount: totalReturnAmount,
          currency: this.getSingleCurrency(
            contributionTransactions.map((transaction) => transaction.account.currency),
          ),
          rate: totalReturnRate,
        },
      },
    }
  }
}
