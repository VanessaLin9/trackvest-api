import { plainToInstance } from 'class-transformer'
import { TransactionsService } from './transactions.service'
import { TransactionResponseDto } from './dto/transaction.response.dto'

describe('TransactionsService.remove response', () => {
  const accountSummarySelect = {
    id: true,
    name: true,
    currency: true,
    userId: true,
  }

  function createHarness() {
    const txClient = {
      transaction: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    }
    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof txClient) => Promise<unknown>) =>
          callback(txClient),
      ),
    }
    const service = new TransactionsService(
      prisma as never,
      { archiveTransactionEntries: jest.fn() } as never,
      { validateTransactionOwnership: jest.fn() } as never,
      { applyRemoveSideEffects: jest.fn() } as never,
      {} as never,
    )
    return { service, txClient }
  }

  it.each([
    ['deposit', null],
    ['sell', 'asset-1'],
  ] as const)(
    'soft-deletes a %s with the full account summary',
    async (type, assetId) => {
      const { service, txClient } = createHarness()
      txClient.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        type,
        assetId,
        account: { userId: 'user-1' },
      })
      txClient.transaction.update.mockResolvedValue({
        id: 'tx-1',
        accountId: 'acc-1',
        assetId,
        type,
        amount: '10',
        isDeleted: true,
        deletedAt: new Date('2026-01-02T00:00:00.000Z'),
        tradeTime: new Date('2026-01-01T00:00:00.000Z'),
        cashInLieuActionId: null,
        account: {
          id: 'acc-1',
          name: 'Broker TWD',
          currency: 'TWD',
          userId: 'user-1',
        },
      })

      const removed = await service.remove('tx-1', 'user-1')
      const serialized = plainToInstance(TransactionResponseDto, removed, {
        excludeExtraneousValues: true,
      })

      expect(txClient.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { account: { select: accountSummarySelect } },
        }),
      )
      expect(serialized.account).toEqual({
        id: 'acc-1',
        name: 'Broker TWD',
        currency: 'TWD',
        userId: 'user-1',
      })
    },
  )
})
