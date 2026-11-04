import { Prisma } from '@prisma/client'
import { normalizeAssetCurrencyInput } from '../common/utils/asset-input.util'
import {
  AnnualExternalFundingCoverage,
  AnnualExternalFundingIssue,
  PortfolioAnnualExternalFundingItemResponseDto,
  PortfolioAnnualExternalFundingResponseDto,
} from './dto/portfolio-annual-external-funding.response.dto'

/** Asia/Taipei 無日光節約。年份用 UTC+8，不用主機時區；UTC 12/31 16:00 算下一個台北年。 */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000
const OUTPUT_SCALE = 8

export const ANNUAL_EXTERNAL_FUNDING_TIME_ZONE = 'Asia/Taipei'

export type FundingCashflow = {
  id: string
  accountId: string
  type: 'deposit' | 'withdraw'
  amount: Prisma.Decimal
  tradeTime: Date
  origin: 'unknown' | 'external' | 'internal'
}

export type AnnualExternalFundingSource = {
  accounts: Array<{ id: string; currency: string }>
  cashflows: FundingCashflow[]
  coveredYears: Array<{ currency: string; year: number }>
}

type MoneyTotals = {
  externalDeposit: Prisma.Decimal
  externalWithdrawal: Prisma.Decimal
  unknownDeposit: Prisma.Decimal
  unknownWithdrawal: Prisma.Decimal
  internalIn: Prisma.Decimal
  internalOut: Prisma.Decimal
}

/**
 * 年度外部入金、出金與已記錄淨投入。
 * 範圍是這位使用者在 Trackvest 的帳戶。買賣、股利、費用不在這份來源裡。
 * unknown 不當成外部本金，也不當成 0。沒有確認涵蓋的年份不回完整結果。
 * asOf 之後的入出金不進總額。
 */
export function buildAnnualExternalFunding(
  source: AnnualExternalFundingSource,
  asOf: Date,
  scopeAccountId?: string,
): PortfolioAnnualExternalFundingResponseDto {
  const currentYear = taipeiYear(asOf)
  const reported = source.cashflows.filter(cashflow => cashflow.tradeTime.getTime() <= asOf.getTime())
  const currencyByAccount = new Map(
    source.accounts.map(account => [account.id, normalizeAssetCurrencyInput(account.currency)]),
  )
  const scopeCurrency = scopeAccountId ? currencyByAccount.get(scopeAccountId) : undefined
  const currencies = new Set<string>()
  for (const account of source.accounts) {
    const currency = currencyByAccount.get(account.id)
    if (!currency) continue
    if (scopeCurrency && currency !== scopeCurrency) continue
    currencies.add(currency)
  }
  for (const covered of source.coveredYears) {
    const currency = normalizeAssetCurrencyInput(covered.currency)
    if (scopeCurrency && currency !== scopeCurrency) continue
    currencies.add(currency)
  }

  const items: PortfolioAnnualExternalFundingItemResponseDto[] = []
  for (const currency of currencies) {
    const accountIds = [...currencyByAccount.entries()]
      .filter(([, accountCurrency]) => accountCurrency === currency)
      .map(([accountId]) => accountId)
    const scopedIds = new Set(scopeAccountId ? [scopeAccountId] : accountIds)
    const currencyFlows = reported.filter(cashflow => accountIds.includes(cashflow.accountId))
    const covered = new Set(
      source.coveredYears
        .filter(entry => normalizeAssetCurrencyInput(entry.currency) === currency && entry.year <= currentYear)
        .map(entry => entry.year),
    )
    const firstYear = earliestYear(currencyFlows, covered)
    if (firstYear == null || firstYear > currentYear) continue
    for (let year = firstYear; year <= currentYear; year += 1) {
      const yearFlows = currencyFlows.filter(cashflow => taipeiYear(cashflow.tradeTime) === year)
      items.push(buildYear(year, currency, yearFlows, scopedIds, covered.has(year)))
    }
  }

  items.sort(compareRows)
  return {
    generatedAt: asOf.toISOString(),
    timeZone: ANNUAL_EXTERNAL_FUNDING_TIME_ZONE,
    items,
  }
}

export function taipeiYear(instant: Date): number {
  return new Date(instant.getTime() + TAIPEI_OFFSET_MS).getUTCFullYear()
}

function buildYear(
  year: number,
  currency: string,
  flows: FundingCashflow[],
  scopedIds: Set<string>,
  covered: boolean,
): PortfolioAnnualExternalFundingItemResponseDto {
  if (flows.length === 0 && !covered) {
    return emptyYear(year, currency, AnnualExternalFundingCoverage.NotRecorded, [])
  }

  const scoped = flows.filter(cashflow => scopedIds.has(cashflow.accountId))
  const totals = sumFlows(scoped)
  const unknownAnywhere = flows.some(cashflow => cashflow.origin === 'unknown')
  const issues: AnnualExternalFundingIssue[] = []
  if (unknownAnywhere) issues.push(AnnualExternalFundingIssue.UnknownCashflow)
  if (!covered) issues.push(AnnualExternalFundingIssue.CoverageUnconfirmed)
  const coverage = covered && !unknownAnywhere
    ? AnnualExternalFundingCoverage.Complete
    : AnnualExternalFundingCoverage.Partial

  return {
    year,
    currency,
    coverage,
    externalDeposit: formatDecimal(totals.externalDeposit),
    externalWithdrawal: formatDecimal(totals.externalWithdrawal),
    recordedNetContribution: unknownAnywhere
      ? null
      : formatDecimal(totals.externalDeposit.sub(totals.externalWithdrawal)),
    unknownDeposit: formatDecimal(totals.unknownDeposit),
    unknownWithdrawal: formatDecimal(totals.unknownWithdrawal),
    internalIn: formatDecimal(totals.internalIn),
    internalOut: formatDecimal(totals.internalOut),
    issues,
  }
}

function emptyYear(
  year: number,
  currency: string,
  coverage: AnnualExternalFundingCoverage,
  issues: AnnualExternalFundingIssue[],
): PortfolioAnnualExternalFundingItemResponseDto {
  return {
    year,
    currency,
    coverage,
    externalDeposit: null,
    externalWithdrawal: null,
    recordedNetContribution: null,
    unknownDeposit: null,
    unknownWithdrawal: null,
    internalIn: null,
    internalOut: null,
    issues,
  }
}

function sumFlows(flows: FundingCashflow[]): MoneyTotals {
  const totals: MoneyTotals = {
    externalDeposit: new Prisma.Decimal(0),
    externalWithdrawal: new Prisma.Decimal(0),
    unknownDeposit: new Prisma.Decimal(0),
    unknownWithdrawal: new Prisma.Decimal(0),
    internalIn: new Prisma.Decimal(0),
    internalOut: new Prisma.Decimal(0),
  }
  for (const flow of flows) {
    if (flow.origin === 'external' && flow.type === 'deposit') totals.externalDeposit = totals.externalDeposit.add(flow.amount)
    else if (flow.origin === 'external' && flow.type === 'withdraw') totals.externalWithdrawal = totals.externalWithdrawal.add(flow.amount)
    else if (flow.origin === 'unknown' && flow.type === 'deposit') totals.unknownDeposit = totals.unknownDeposit.add(flow.amount)
    else if (flow.origin === 'unknown' && flow.type === 'withdraw') totals.unknownWithdrawal = totals.unknownWithdrawal.add(flow.amount)
    else if (flow.origin === 'internal' && flow.type === 'deposit') totals.internalIn = totals.internalIn.add(flow.amount)
    else if (flow.origin === 'internal' && flow.type === 'withdraw') totals.internalOut = totals.internalOut.add(flow.amount)
  }
  return totals
}

function earliestYear(flows: FundingCashflow[], covered: Set<number>): number | null {
  const years = [...covered, ...flows.map(flow => taipeiYear(flow.tradeTime))]
  if (years.length === 0) return null
  return Math.min(...years)
}

function compareRows(
  left: PortfolioAnnualExternalFundingItemResponseDto,
  right: PortfolioAnnualExternalFundingItemResponseDto,
): number {
  if (left.year !== right.year) return right.year - left.year
  if (left.currency !== right.currency) return left.currency < right.currency ? -1 : 1
  return 0
}

function formatDecimal(value: Prisma.Decimal): string {
  const fixed = value.toDecimalPlaces(OUTPUT_SCALE, Prisma.Decimal.ROUND_HALF_UP).toFixed(OUTPUT_SCALE)
  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed === '-0' ? '0' : trimmed
}
