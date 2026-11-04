import { ForbiddenException, Injectable } from '@nestjs/common'
import { CashflowOrigin, Prisma, TxType } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import {
  AnnualExternalFundingSource,
  FundingCashflow,
  buildAnnualExternalFunding,
} from './annual-external-funding.calculator'
import { GetPortfolioAnnualExternalFundingDto } from './dto/get-portfolio-annual-external-funding.dto'
import { PortfolioAnnualExternalFundingResponseDto } from './dto/portfolio-annual-external-funding.response.dto'

const CASH_TYPES = [TxType.deposit, TxType.withdraw] as const

/**
 * 年度外部入出金讀取。
 * 範圍是呼叫者自己的帳戶，admin 也不讀別人。不讀總帳、報價或買賣。
 * 既有入出金維持 unknown，這條 GET 不回填來源。
 */
@Injectable()
export class ExternalFundingService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnnualExternalFunding(
    userId: string,
    query: GetPortfolioAnnualExternalFundingDto,
  ): Promise<PortfolioAnnualExternalFundingResponseDto> {
    const generatedAt = new Date()
    const source = await this.prisma.$transaction(
      tx => this.loadSource(tx, userId, query.accountId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
    return buildAnnualExternalFunding(source, generatedAt, query.accountId)
  }

  private async loadSource(
    tx: Prisma.TransactionClient,
    userId: string,
    accountId?: string,
  ): Promise<AnnualExternalFundingSource> {
    const accounts = await tx.account.findMany({
      where: { userId },
      select: { id: true, currency: true },
    })
    if (accountId && !accounts.some(account => account.id === accountId)) {
      throw new ForbiddenException('You do not have access to this account')
    }
    if (accounts.length === 0) return { accounts, cashflows: [], coveredYears: [] }

    const [transactions, coveredYears] = await Promise.all([
      tx.transaction.findMany({
        where: {
          accountId: { in: accounts.map(account => account.id) },
          isDeleted: false,
          type: { in: [...CASH_TYPES] },
        },
        select: {
          id: true,
          accountId: true,
          type: true,
          amount: true,
          tradeTime: true,
          cashflowOrigin: true,
        },
      }),
      tx.externalFundingCoverage.findMany({
        where: { userId },
        select: { currency: true, year: true },
      }),
    ])

    const cashflows = transactions.flatMap(transaction => {
      if (transaction.type !== TxType.deposit && transaction.type !== TxType.withdraw) return []
      const mapped: FundingCashflow = {
        id: transaction.id,
        accountId: transaction.accountId,
        type: transaction.type,
        amount: transaction.amount,
        tradeTime: transaction.tradeTime,
        origin: originOf(transaction.cashflowOrigin),
      }
      return [mapped]
    })

    return {
      accounts,
      cashflows,
      coveredYears: coveredYears.map(coverage => ({ currency: coverage.currency, year: coverage.year })),
    }
  }
}

function originOf(origin: CashflowOrigin): FundingCashflow['origin'] {
  if (origin === CashflowOrigin.external) return 'external'
  if (origin === CashflowOrigin.internal) return 'internal'
  return 'unknown'
}
