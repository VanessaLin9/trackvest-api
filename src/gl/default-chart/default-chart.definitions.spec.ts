import { BadRequestException } from '@nestjs/common'
import { Currency, GlAccountPurpose, GlAccountType } from '@prisma/client'
import {
  buildDefaultSystemGlAccountCreateData,
  DEFAULT_SYSTEM_GL_PURPOSES,
  getDefaultSystemGlAccountDefinitions,
  TWD_DEFAULT_SYSTEM_GL_ACCOUNT_DEFINITIONS,
} from './default-chart.definitions'

describe('default-chart.definitions', () => {
  const userId = 'user-123'

  it('defines all required TWD system purposes for PostingService', () => {
    expect(DEFAULT_SYSTEM_GL_PURPOSES).toEqual([
      GlAccountPurpose.investment_bucket,
      GlAccountPurpose.equity_contribution,
      GlAccountPurpose.dividend_income,
      GlAccountPurpose.realized_gain_income,
      GlAccountPurpose.fee_expense,
      GlAccountPurpose.realized_loss_expense,
    ])
  })

  it('builds deterministic create data without fixed IDs', () => {
    const rows = buildDefaultSystemGlAccountCreateData(userId, Currency.TWD)

    expect(rows).toHaveLength(6)
    expect(rows.every((row) => row.userId === userId)).toBe(true)
    expect(rows.every((row) => !('id' in row))).toBe(true)
    expect(rows.map((row) => row.purpose)).toEqual(DEFAULT_SYSTEM_GL_PURPOSES)
    expect(rows.map((row) => row.name)).toEqual(
      TWD_DEFAULT_SYSTEM_GL_ACCOUNT_DEFINITIONS.map((definition) => definition.name),
    )
  })

  it('uses unique names per purpose and TWD currency', () => {
    const rows = buildDefaultSystemGlAccountCreateData(userId, Currency.TWD)
    const names = rows.map((row) => row.name)

    expect(new Set(names).size).toBe(names.length)
    expect(rows.every((row) => row.currency === Currency.TWD)).toBe(true)
    expect(rows.find((row) => row.purpose === GlAccountPurpose.investment_bucket)).toEqual({
      userId,
      name: '資產-投資-股票(台幣)',
      type: GlAccountType.asset,
      purpose: GlAccountPurpose.investment_bucket,
      currency: Currency.TWD,
    })
  })

  it('rejects unsupported currencies', () => {
    expect(() => getDefaultSystemGlAccountDefinitions(Currency.USD)).toThrow(
      BadRequestException,
    )
    expect(() => buildDefaultSystemGlAccountCreateData(userId, Currency.USD)).toThrow(
      BadRequestException,
    )
  })
})
