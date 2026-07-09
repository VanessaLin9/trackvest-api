import { BadRequestException } from '@nestjs/common'
import {
  Currency,
  GlAccountPurpose,
  GlAccountType,
  Prisma,
} from '@prisma/client'

export type DefaultSystemGlAccountDefinition = {
  name: string
  type: GlAccountType
  purpose: GlAccountPurpose
  currency: Currency
}

export const TWD_DEFAULT_SYSTEM_GL_ACCOUNT_DEFINITIONS: readonly DefaultSystemGlAccountDefinition[] =
  [
    {
      name: '資產-投資-股票(台幣)',
      type: GlAccountType.asset,
      purpose: GlAccountPurpose.investment_bucket,
      currency: Currency.TWD,
    },
    {
      name: '權益-投入資本',
      type: GlAccountType.equity,
      purpose: GlAccountPurpose.equity_contribution,
      currency: Currency.TWD,
    },
    {
      name: '收入-股利',
      type: GlAccountType.income,
      purpose: GlAccountPurpose.dividend_income,
      currency: Currency.TWD,
    },
    {
      name: '收入-已實現損益-收益',
      type: GlAccountType.income,
      purpose: GlAccountPurpose.realized_gain_income,
      currency: Currency.TWD,
    },
    {
      name: '費用-手續費',
      type: GlAccountType.expense,
      purpose: GlAccountPurpose.fee_expense,
      currency: Currency.TWD,
    },
    {
      name: '費用-已實現損益-損失',
      type: GlAccountType.expense,
      purpose: GlAccountPurpose.realized_loss_expense,
      currency: Currency.TWD,
    },
  ] as const

export const DEFAULT_SYSTEM_GL_PURPOSES: readonly GlAccountPurpose[] =
  TWD_DEFAULT_SYSTEM_GL_ACCOUNT_DEFINITIONS.map((definition) => definition.purpose)

export function getDefaultSystemGlAccountDefinitions(
  currency: Currency,
): readonly DefaultSystemGlAccountDefinition[] {
  if (currency !== Currency.TWD) {
    throw new BadRequestException(
      `Default system GL chart is not supported for currency "${currency}" yet`,
    )
  }

  return TWD_DEFAULT_SYSTEM_GL_ACCOUNT_DEFINITIONS
}

export function buildDefaultSystemGlAccountCreateData(
  userId: string,
  currency: Currency = Currency.TWD,
): Prisma.GlAccountCreateManyInput[] {
  return getDefaultSystemGlAccountDefinitions(currency).map((definition) => ({
    userId,
    name: definition.name,
    type: definition.type,
    purpose: definition.purpose,
    currency: definition.currency,
  }))
}
