import { BadRequestException } from '@nestjs/common'
import type { Transaction } from '@prisma/client'
import { PostingService } from './posting.service'

describe('PostingService', () => {
  const userId = 'user-1'
  const accountId = 'account-1'
  const cashGlId = 'gl-cash'
  const investGlId = 'gl-invest'
  const feeGlId = 'gl-fee'
  const gainGlId = 'gl-gain'
  const lossGlId = 'gl-loss'

  function buildTransaction(
    overrides: Record<string, unknown> = {},
  ): Transaction {
    return {
      id: 'tx-sell-1',
      accountId,
      assetId: 'asset-1',
      type: 'sell',
      amount: 508,
      quantity: 4,
      price: 130,
      fee: 10,
      tax: 2,
      brokerOrderNo: null,
      tradeTime: new Date('2026-03-26T09:30:00.000Z'),
      note: 'Sell transaction',
      isDeleted: false,
      deletedAt: null,
      ...overrides,
    } as unknown as Transaction
  }

  function createHarness() {
    const prisma = {
      account: {
        findUniqueOrThrow: jest.fn(),
      },
      glEntry: {
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      sellLotMatch: {
        findMany: jest.fn(),
      },
    }

    const ownershipService = {
      validateGlAccountOwnership: jest.fn(),
    }

    const glService = {
      getLinkedCashGlAccountId: jest.fn(),
      getInvestmentBucketGlAccountId: jest.fn(),
      getFeeExpenseGlAccountId: jest.fn(),
      getRealizedGainIncomeGlAccountId: jest.fn(),
      getRealizedLossExpenseGlAccountId: jest.fn(),
      getDividendIncomeGlAccountId: jest.fn(),
      getEquityGlAccountId: jest.fn(),
    }

    prisma.account.findUniqueOrThrow.mockResolvedValue({
      id: accountId,
      currency: 'TWD',
    })
    prisma.glEntry.updateMany.mockResolvedValue({ count: 0 })
    prisma.glEntry.create.mockImplementation(async ({ data }) => ({
      id: 'entry-1',
      ...data,
      lines: data.lines.create,
    }))
    prisma.sellLotMatch.findMany.mockResolvedValue([
      {
        id: 'match-1',
        sellTransactionId: 'tx-sell-1',
        buyLotId: 'lot-1',
        quantity: 4,
        unitCost: 100,
      },
    ])

    glService.getLinkedCashGlAccountId.mockResolvedValue(cashGlId)
    glService.getInvestmentBucketGlAccountId.mockResolvedValue(investGlId)
    glService.getFeeExpenseGlAccountId.mockResolvedValue(feeGlId)
    glService.getRealizedGainIncomeGlAccountId.mockResolvedValue(gainGlId)
    glService.getRealizedLossExpenseGlAccountId.mockResolvedValue(lossGlId)

    const service = new PostingService(
      prisma as never,
      ownershipService as never,
      glService as never,
    )

    return {
      service,
      prisma,
      glService,
    }
  }

  it('posts a sell with fee and tax as expense and credits realized gain', async () => {
    const { service, prisma } = createHarness()
    const transaction = buildTransaction({
      amount: 508,
      fee: 10,
      tax: 2,
    })

    await service.postTransaction({ userId, transaction, db: prisma as never })

    expect(prisma.sellLotMatch.findMany).toHaveBeenCalledWith({
      where: { sellTransactionId: 'tx-sell-1' },
    })
    expect(prisma.glEntry.create).toHaveBeenCalledWith({
      data: {
        userId,
        date: transaction.tradeTime,
        memo: transaction.note,
        source: 'auto:transaction:sell',
        refTxId: transaction.id,
        lines: {
          create: [
            { glAccountId: cashGlId, side: 'debit', amount: 508, currency: 'TWD', note: 'sell proceeds in' },
            { glAccountId: investGlId, side: 'credit', amount: 400, currency: 'TWD', note: 'sell cost basis out' },
            { glAccountId: feeGlId, side: 'debit', amount: 12, currency: 'TWD', note: 'sell fee and tax' },
            { glAccountId: gainGlId, side: 'credit', amount: 120, currency: 'TWD', note: 'realized gain' },
          ],
        },
      },
      include: { lines: true },
    })
  })

  it('posts a sell loss as a debit to realized loss without a fee line when charges are zero', async () => {
    const { service, prisma } = createHarness()
    const transaction = buildTransaction({
      id: 'tx-sell-loss',
      amount: 380,
      fee: 0,
      tax: 0,
    })

    prisma.sellLotMatch.findMany.mockResolvedValue([
      {
        id: 'match-1',
        sellTransactionId: 'tx-sell-loss',
        buyLotId: 'lot-1',
        quantity: 4,
        unitCost: 100,
      },
    ])

    await service.postTransaction({ userId, transaction, db: prisma as never })

    expect(prisma.glEntry.create).toHaveBeenCalledWith({
      data: {
        userId,
        date: transaction.tradeTime,
        memo: transaction.note,
        source: 'auto:transaction:sell',
        refTxId: transaction.id,
        lines: {
          create: [
            { glAccountId: cashGlId, side: 'debit', amount: 380, currency: 'TWD', note: 'sell proceeds in' },
            { glAccountId: investGlId, side: 'credit', amount: 400, currency: 'TWD', note: 'sell cost basis out' },
            { glAccountId: lossGlId, side: 'debit', amount: 20, currency: 'TWD', note: 'realized loss' },
          ],
        },
      },
      include: { lines: true },
    })
  })

  it('rejects a sell posting when FIFO lot matches are missing', async () => {
    const { service, prisma } = createHarness()
    const transaction = buildTransaction()

    prisma.sellLotMatch.findMany.mockResolvedValue([])

    await expect(
      service.postTransaction({ userId, transaction, db: prisma as never }),
    ).rejects.toThrow(
      new BadRequestException('Sell transaction is missing FIFO lot matches'),
    )

    expect(prisma.glEntry.create).not.toHaveBeenCalled()
  })
})
