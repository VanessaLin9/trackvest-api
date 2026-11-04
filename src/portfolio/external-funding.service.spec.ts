import { ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ExternalFundingService } from './external-funding.service'

describe('ExternalFundingService', () => {
  function createHarness(accounts: Array<{ id: string; currency: string }>) {
    const tx = {
      account: { findMany: jest.fn().mockResolvedValue(accounts) },
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn(),
      },
      externalFundingCoverage: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn(),
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>, options?: unknown) => {
        expect(options).toEqual({
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        })
        return fn(tx)
      }),
    }
    return { service: new ExternalFundingService(prisma as never), tx }
  }

  it('rejects another user account before reading cashflows', async () => {
    const { service, tx } = createHarness([])

    await expect(service.getAnnualExternalFunding('user-1', {
      accountId: '11111111-1111-4111-8111-111111111111',
    })).rejects.toBeInstanceOf(ForbiddenException)

    expect(tx.transaction.findMany).not.toHaveBeenCalled()
  })

  it('reads deposits and withdrawals only, and does not write or query prices', async () => {
    const { service, tx } = createHarness([{ id: 'account-1', currency: 'TWD' }])
    tx.transaction.findMany.mockResolvedValue([
      {
        id: 'deposit-1',
        accountId: 'account-1',
        type: 'deposit',
        amount: new Prisma.Decimal('10'),
        tradeTime: new Date('2026-01-01T00:00:00.000Z'),
        cashflowOrigin: 'external',
      },
    ])

    const response = await service.getAnnualExternalFunding('user-1', {})

    expect(response.timeZone).toBe('Asia/Taipei')
    expect(response.items.find(item => item.year === 2026)).toMatchObject({
      currency: 'TWD',
      externalDeposit: '10',
      recordedNetContribution: '10',
    })
    expect(tx.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        accountId: { in: ['account-1'] },
        isDeleted: false,
        type: { in: ['deposit', 'withdraw'] },
      },
    }))
    expect(tx.transaction.update).not.toHaveBeenCalled()
    expect(tx.transaction.create).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
})
