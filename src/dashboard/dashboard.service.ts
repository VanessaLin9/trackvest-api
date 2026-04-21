import { Injectable } from '@nestjs/common'
import { GlAccountPurpose } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { OwnershipService } from '../common/services/ownership.service'
import { DashboardActivityDto, DashboardRecentActivityItemDto } from './dto/dashboard-activity.dto'
import { GetDashboardActivityDto } from './dto/get-dashboard-activity.dto'
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

  private getActivityLabel(type: 'expense' | 'income' | 'transfer'): string {
    switch (type) {
      case 'expense':
        return 'Expense'
      case 'income':
        return 'Income'
      case 'transfer':
        return 'Transfer'
    }
  }

  private getTransactionLabel(
    type: 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend' | 'fee',
  ): string {
    switch (type) {
      case 'buy':
        return 'Buy'
      case 'sell':
        return 'Sell'
      case 'deposit':
        return 'Deposit'
      case 'withdraw':
        return 'Withdraw'
      case 'dividend':
        return 'Dividend'
      case 'fee':
        return 'Fee'
    }
  }

  private getTransactionDirection(
    type: 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend' | 'fee',
  ): 'in' | 'out' {
    switch (type) {
      case 'sell':
      case 'deposit':
      case 'dividend':
        return 'in'
      case 'buy':
      case 'withdraw':
      case 'fee':
        return 'out'
    }
  }

  private buildCashbookActivity(entry: {
    id: string
    date: Date
    memo: string | null
    source: string | null
    lines: Array<{
      amount: unknown
      currency: string
      side: 'debit' | 'credit'
      glAccount: {
        name: string
        type: string
      }
    }>
  }): DashboardRecentActivityItemDto | null {
    if (
      entry.source !== 'manual:expense' &&
      entry.source !== 'manual:income' &&
      entry.source !== 'manual:transfer'
    ) {
      return null
    }

    const assetLines = entry.lines.filter((line) => line.glAccount.type === 'asset')
    const debitAssetLine = assetLines.find((line) => line.side === 'debit')
    const creditAssetLine = assetLines.find((line) => line.side === 'credit')

    if (entry.source === 'manual:expense') {
      const cashLine = creditAssetLine ?? assetLines[0]
      return {
        id: `cashbook-${entry.id}`,
        kind: 'cashbook',
        date: entry.date.toISOString(),
        title: entry.memo || this.getActivityLabel('expense'),
        subtitle: cashLine
          ? `${this.getActivityLabel('expense')} · ${cashLine.glAccount.name}`
          : this.getActivityLabel('expense'),
        amount: cashLine ? Number(cashLine.amount) : null,
        currency: cashLine?.currency ?? null,
        direction: 'out',
      }
    }

    if (entry.source === 'manual:income') {
      const cashLine = debitAssetLine ?? assetLines[0]
      return {
        id: `cashbook-${entry.id}`,
        kind: 'cashbook',
        date: entry.date.toISOString(),
        title: entry.memo || this.getActivityLabel('income'),
        subtitle: cashLine
          ? `${this.getActivityLabel('income')} · ${cashLine.glAccount.name}`
          : this.getActivityLabel('income'),
        amount: cashLine ? Number(cashLine.amount) : null,
        currency: cashLine?.currency ?? null,
        direction: 'in',
      }
    }

    const amountLine = debitAssetLine ?? creditAssetLine ?? assetLines[0]
    const fromName = creditAssetLine?.glAccount.name
    const toName = debitAssetLine?.glAccount.name
    const subtitle =
      fromName && toName
        ? `Transfer · ${fromName} -> ${toName}`
        : fromName
        ? `Transfer · From ${fromName}`
        : toName
        ? `Transfer · To ${toName}`
        : 'Transfer'

    return {
      id: `cashbook-${entry.id}`,
      kind: 'cashbook',
      date: entry.date.toISOString(),
      title: entry.memo || this.getActivityLabel('transfer'),
      subtitle,
      amount: amountLine ? Number(amountLine.amount) : null,
      currency: amountLine?.currency ?? null,
      direction: 'neutral',
    }
  }

  private buildInvestmentActivity(transaction: {
    id: string
    type: 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend' | 'fee'
    amount: unknown
    tradeTime: Date
    note: string | null
    account: {
      name: string
      currency: string
    }
    asset: {
      symbol: string
      name: string
    } | null
  }): DashboardRecentActivityItemDto {
    const label = this.getTransactionLabel(transaction.type)
    return {
      id: `investment-${transaction.id}`,
      kind: 'investment',
      date: transaction.tradeTime.toISOString(),
      title: transaction.asset?.symbol || transaction.note || label,
      subtitle: `${label} · ${transaction.account.name}`,
      amount: Number(transaction.amount),
      currency: transaction.account.currency,
      direction: this.getTransactionDirection(transaction.type),
    }
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
              { purpose: GlAccountPurpose.investment_bucket },
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

  async getActivity(
    userId: string,
    query: GetDashboardActivityDto,
  ): Promise<DashboardActivityDto> {
    await this.ownershipService.validateUserExists(userId)

    const take = query.take ?? 10
    const candidateTake = Math.min(Math.max(take * 4, 20), 100)

    const assetAccounts = await this.prisma.glAccount.findMany({
      where: {
        userId,
        type: 'asset',
        archivedAt: null,
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        currency: true,
        linked: {
          select: {
            type: true,
          },
        },
      },
    })

    const assetAccountIds = assetAccounts.map((account) => account.id)

    const [accountLines, cashbookEntries, investmentTransactions] = await Promise.all([
      assetAccountIds.length
        ? this.prisma.glLine.findMany({
            where: {
              glAccountId: { in: assetAccountIds },
              entry: {
                userId,
                isDeleted: false,
              },
            },
            select: {
              glAccountId: true,
              amount: true,
              side: true,
            },
          })
        : Promise.resolve([]),
      this.prisma.glEntry.findMany({
        where: {
          userId,
          isDeleted: false,
          source: {
            in: ['manual:expense', 'manual:income', 'manual:transfer'],
          },
        },
        orderBy: { date: 'desc' },
        take: candidateTake,
        select: {
          id: true,
          date: true,
          memo: true,
          source: true,
          lines: {
            select: {
              amount: true,
              currency: true,
              side: true,
              glAccount: {
                select: {
                  name: true,
                  type: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          isDeleted: false,
          account: {
            userId,
          },
        },
        orderBy: { tradeTime: 'desc' },
        take: candidateTake,
        select: {
          id: true,
          type: true,
          amount: true,
          tradeTime: true,
          note: true,
          account: {
            select: {
              name: true,
              currency: true,
            },
          },
          asset: {
            select: {
              symbol: true,
              name: true,
            },
          },
        },
      }),
    ])

    const balanceByAccountId = new Map<string, number>()
    for (const line of accountLines) {
      balanceByAccountId.set(
        line.glAccountId,
        (balanceByAccountId.get(line.glAccountId) ?? 0) +
          this.toSignedAmount(line.side, line.amount),
      )
    }

    const accountOverview = assetAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.linked?.type ?? 'asset',
      currency: account.currency,
      balance: balanceByAccountId.get(account.id) ?? 0,
    }))

    const recentActivity = [
      ...cashbookEntries
        .map((entry) => this.buildCashbookActivity(entry))
        .filter((entry): entry is DashboardRecentActivityItemDto => Boolean(entry)),
      ...investmentTransactions.map((transaction) =>
        this.buildInvestmentActivity(transaction),
      ),
    ]
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, take)

    return {
      accountOverview,
      recentActivity,
    }
  }
}
