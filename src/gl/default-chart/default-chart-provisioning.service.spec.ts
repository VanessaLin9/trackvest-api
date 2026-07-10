import { ConflictException } from '@nestjs/common'
import { Currency, GlAccountPurpose, GlAccountType } from '@prisma/client'
import { DefaultChartProvisioningService } from './default-chart-provisioning.service'

function buildPrismaMock(existing: Array<{ id: string; purpose: GlAccountPurpose | null }> = []) {
  const created: Array<{
    id: string
    userId: string
    name: string
    type: GlAccountType
    purpose: GlAccountPurpose | null
    currency: Currency | null
  }> = []

  const glAccount = {
    findMany: jest.fn().mockResolvedValue(existing),
    create: jest.fn().mockImplementation(async ({ data }) => {
      const row = {
        id: `gl-${created.length + 1}`,
        ...data,
      }
      created.push(row)
      return row
    }),
  }

  return {
    prisma: { glAccount },
    created,
  }
}

describe('DefaultChartProvisioningService', () => {
  const userId = 'user-123'

  it('creates all required TWD system GL accounts', async () => {
    const { prisma, created } = buildPrismaMock()
    const service = new DefaultChartProvisioningService(prisma as never)

    const result = await service.provisionSystemAccounts(userId, Currency.TWD)

    expect(result).toHaveLength(6)
    expect(created.map((row) => row.purpose)).toEqual([
      GlAccountPurpose.investment_bucket,
      GlAccountPurpose.equity_contribution,
      GlAccountPurpose.dividend_income,
      GlAccountPurpose.realized_gain_income,
      GlAccountPurpose.fee_expense,
      GlAccountPurpose.realized_loss_expense,
    ])
    expect(prisma.glAccount.create).toHaveBeenCalledTimes(6)
  })

  it('uses the provided transaction client without opening a nested transaction', async () => {
    const { prisma, created } = buildPrismaMock()
    const service = new DefaultChartProvisioningService({ glAccount: { create: jest.fn() } } as never)

    await service.provisionSystemAccounts(userId, Currency.TWD, prisma as never)

    expect(created).toHaveLength(6)
  })

  it('rejects duplicate provisioning for the same user', async () => {
    const { prisma } = buildPrismaMock([
      { id: 'existing-1', purpose: GlAccountPurpose.equity_contribution },
    ])
    const service = new DefaultChartProvisioningService(prisma as never)

    await expect(service.provisionSystemAccounts(userId, Currency.TWD)).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(prisma.glAccount.create).not.toHaveBeenCalled()
  })
})
