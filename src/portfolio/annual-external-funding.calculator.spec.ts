import { Prisma } from '@prisma/client'
import {
  AnnualExternalFundingSource,
  FundingCashflow,
  buildAnnualExternalFunding,
  taipeiYear,
} from './annual-external-funding.calculator'
import {
  AnnualExternalFundingCoverage,
  AnnualExternalFundingIssue,
} from './dto/portfolio-annual-external-funding.response.dto'

const AS_OF = new Date('2026-06-15T04:00:00.000Z')

function flow(partial: Partial<FundingCashflow> & Pick<FundingCashflow, 'id' | 'type' | 'tradeTime'>): FundingCashflow {
  return {
    accountId: 'account-twd',
    amount: new Prisma.Decimal('0'),
    origin: 'external',
    ...partial,
  }
}

function source(
  cashflows: FundingCashflow[],
  coveredYears: AnnualExternalFundingSource['coveredYears'] = [],
): AnnualExternalFundingSource {
  return {
    accounts: [
      { id: 'account-twd', currency: 'TWD' },
      { id: 'account-twd-2', currency: 'twd' },
      { id: 'account-usd', currency: 'USD' },
    ],
    cashflows,
    coveredYears,
  }
}

describe('buildAnnualExternalFunding', () => {
  it('uses the Asia/Taipei year, including the UTC new-year boundary', () => {
    expect(taipeiYear(new Date('2025-12-31T15:59:59.000Z'))).toBe(2025)
    expect(taipeiYear(new Date('2025-12-31T16:00:00.000Z'))).toBe(2026)
  })

  it('keeps unknown cash out of external principal and withholds the net', () => {
    const result = buildAnnualExternalFunding(source([
      flow({ id: 'in', type: 'deposit', amount: new Prisma.Decimal('1000'), tradeTime: new Date('2026-01-15T00:00:00.000Z') }),
      flow({ id: 'out', type: 'withdraw', amount: new Prisma.Decimal('200'), tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
      flow({ id: 'mystery', type: 'deposit', amount: new Prisma.Decimal('50'), origin: 'unknown', tradeTime: new Date('2026-03-01T00:00:00.000Z') }),
    ]), AS_OF)

    expect(result.items[0]).toMatchObject({
      year: 2026,
      currency: 'TWD',
      coverage: AnnualExternalFundingCoverage.Partial,
      externalDeposit: '1000',
      externalWithdrawal: '200',
      recordedNetContribution: null,
      unknownDeposit: '50',
      unknownWithdrawal: '0',
      internalIn: '0',
      internalOut: '0',
      issues: [
        AnnualExternalFundingIssue.UnknownCashflow,
        AnnualExternalFundingIssue.CoverageUnconfirmed,
      ],
    })
  })

  it('does not treat an in-scope transfer or an FX pair as new principal', () => {
    const result = buildAnnualExternalFunding(source([
      flow({ id: 'ext', type: 'deposit', amount: new Prisma.Decimal('1000'), tradeTime: new Date('2026-01-01T00:00:00.000Z') }),
      flow({ id: 'out', type: 'withdraw', accountId: 'account-twd', amount: new Prisma.Decimal('300'), origin: 'internal', tradeTime: new Date('2026-04-01T00:00:00.000Z') }),
      flow({ id: 'in', type: 'deposit', accountId: 'account-twd-2', amount: new Prisma.Decimal('300'), origin: 'internal', tradeTime: new Date('2026-04-01T00:00:00.000Z') }),
      flow({ id: 'fx-out', type: 'withdraw', accountId: 'account-twd', amount: new Prisma.Decimal('100'), origin: 'internal', tradeTime: new Date('2025-12-31T16:00:00.000Z') }),
      flow({ id: 'fx-in', type: 'deposit', accountId: 'account-usd', amount: new Prisma.Decimal('3'), origin: 'internal', tradeTime: new Date('2025-12-31T16:00:00.000Z') }),
    ]), AS_OF)

    const twd = result.items.find(item => item.year === 2026 && item.currency === 'TWD')
    const usd = result.items.find(item => item.year === 2026 && item.currency === 'USD')
    expect(twd).toMatchObject({
      externalDeposit: '1000',
      externalWithdrawal: '0',
      recordedNetContribution: '1000',
      internalIn: '300',
      internalOut: '400',
    })
    expect(usd).toMatchObject({
      externalDeposit: '0',
      recordedNetContribution: '0',
      internalIn: '3',
    })

    const oneAccount = buildAnnualExternalFunding(source([
      flow({ id: 'ext', type: 'deposit', amount: new Prisma.Decimal('1000'), tradeTime: new Date('2026-01-01T00:00:00.000Z') }),
      flow({ id: 'in', type: 'deposit', accountId: 'account-twd-2', amount: new Prisma.Decimal('300'), origin: 'internal', tradeTime: new Date('2026-04-01T00:00:00.000Z') }),
    ]), AS_OF, 'account-twd-2')
    expect(oneAccount.items).toEqual([
      expect.objectContaining({
        currency: 'TWD',
        externalDeposit: '0',
        recordedNetContribution: '0',
        internalIn: '300',
      }),
    ])
  })

  it('withholds the net when another account in the same currency is still unknown', () => {
    const result = buildAnnualExternalFunding(source([
      flow({ id: 'ext', type: 'deposit', accountId: 'account-twd', amount: new Prisma.Decimal('10'), tradeTime: new Date('2026-01-01T00:00:00.000Z') }),
      flow({ id: 'mystery', type: 'deposit', accountId: 'account-twd-2', amount: new Prisma.Decimal('5'), origin: 'unknown', tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
    ]), AS_OF, 'account-twd')

    expect(result.items[0]).toMatchObject({
      externalDeposit: '10',
      unknownDeposit: '0',
      recordedNetContribution: null,
      issues: expect.arrayContaining([AnnualExternalFundingIssue.UnknownCashflow]),
    })
  })

  it('distinguishes a missing year, a confirmed zero, and a future cashflow', () => {
    const result = buildAnnualExternalFunding(source([
      flow({ id: 'old', type: 'deposit', amount: new Prisma.Decimal('8'), tradeTime: new Date('2024-02-01T00:00:00.000Z') }),
      flow({ id: 'later', type: 'deposit', amount: new Prisma.Decimal('99'), tradeTime: new Date('2026-12-01T00:00:00.000Z') }),
    ], [{ currency: 'TWD', year: 2026 }]), AS_OF)

    expect(result.items.map(item => [item.year, item.coverage, item.externalDeposit, item.recordedNetContribution])).toEqual([
      [2026, AnnualExternalFundingCoverage.Complete, '0', '0'],
      [2025, AnnualExternalFundingCoverage.NotRecorded, null, null],
      [2024, AnnualExternalFundingCoverage.Partial, '8', '8'],
    ])
  })

  it('rounds the summed decimal half up and keeps a negative recorded net', () => {
    const result = buildAnnualExternalFunding(source([
      flow({ id: 'a', type: 'deposit', amount: new Prisma.Decimal('0.000000004'), tradeTime: new Date('2026-01-01T00:00:00.000Z') }),
      flow({ id: 'b', type: 'deposit', amount: new Prisma.Decimal('0.000000004'), tradeTime: new Date('2026-01-02T00:00:00.000Z') }),
      flow({ id: 'out', type: 'withdraw', amount: new Prisma.Decimal('1'), tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
    ], [{ currency: 'TWD', year: 2026 }]), AS_OF)

    expect(result.items[0]).toMatchObject({
      coverage: AnnualExternalFundingCoverage.Complete,
      externalDeposit: '0.00000001',
      externalWithdrawal: '1',
      recordedNetContribution: '-0.99999999',
      issues: [],
    })
  })

  it('returns no rows when the only cashflow is still after the reporting time', () => {
    const result = buildAnnualExternalFunding(source([
      flow({ id: 'later', type: 'deposit', amount: new Prisma.Decimal('100'), tradeTime: new Date('2026-12-01T00:00:00.000Z') }),
    ]), AS_OF)

    expect(result.items).toEqual([])
  })
})
