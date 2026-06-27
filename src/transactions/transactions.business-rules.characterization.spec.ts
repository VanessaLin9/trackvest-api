import { Prisma, type Transaction } from '@prisma/client'
import { TransactionsService } from './transactions.service'
import { TransactionPositionOrchestratorService } from './transaction-position-orchestrator.service'
import { TransactionBusinessRulesValidator } from './transaction-business-rules-validator.service'
import { TransactionRebuildPolicyService } from './transaction-rebuild-policy.service'

describe('TransactionsService business rules (characterization)', () => {
  const userId = 'user-1'
  const accountId = 'account-1'
  const assetId = 'asset-1'
  const tradeTime = '2026-03-25T09:30:00.000Z'

  function createHarness() {
    const txClient = {
      transaction: {
        create: jest.fn(),
        update: jest.fn(),
      },
    }

    const prisma = {
      transaction: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(
        async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          callback(txClient as unknown as Prisma.TransactionClient),
      ),
    }

    const postingService = {
      postTransaction: jest.fn(),
      archiveTransactionEntries: jest.fn(),
    }

    const ownershipService = {
      validateAccountOwnership: jest.fn(),
      validateTransactionOwnership: jest.fn(),
    }

    const positionReplayService = {
      rebuildScope: jest.fn().mockResolvedValue([]),
    }

    const rebuildPolicy = new TransactionRebuildPolicyService()
    const transactionPositionOrchestrator = new TransactionPositionOrchestratorService(
      positionReplayService as never,
      postingService as never,
      rebuildPolicy,
    )

    const transactionBusinessRulesValidator =
      new TransactionBusinessRulesValidator()

    const service = new TransactionsService(
      prisma as never,
      postingService as never,
      ownershipService as never,
      transactionPositionOrchestrator as never,
      transactionBusinessRulesValidator,
    )

    return { service, prisma, txClient }
  }

  function buildDepositTransaction(
    overrides: Record<string, unknown> = {},
  ): Transaction {
    return {
      id: 'tx-deposit-1',
      accountId,
      assetId: null,
      type: 'deposit',
      amount: 1000,
      quantity: null,
      price: null,
      fee: 0,
      tax: 0,
      brokerOrderNo: null,
      tradeTime: new Date(tradeTime),
      note: null,
      isDeleted: false,
      deletedAt: null,
      ...overrides,
    } as unknown as Transaction
  }

  async function expectCreateRejects(
    payload: Record<string, unknown>,
    message: string,
  ): Promise<void> {
    const { service, prisma } = createHarness()

    await expect(
      service.create(
        {
          accountId,
          tradeTime,
          ...payload,
        } as never,
        userId,
      ),
    ).rejects.toThrow(message)

    expect(prisma.$transaction).not.toHaveBeenCalled()
  }

  async function expectUpdateRejects(
    existing: Transaction,
    patch: Record<string, unknown>,
    message: string,
  ): Promise<void> {
    const { service, prisma, txClient } = createHarness()

    prisma.transaction.findUnique.mockResolvedValue(existing)

    await expect(
      service.update(existing.id, patch as never, userId),
    ).rejects.toThrow(message)

    expect(txClient.transaction.update).not.toHaveBeenCalled()
  }

  describe('create', () => {
    describe('common numeric rules', () => {
      it.each([
        ['zero amount', { type: 'buy', assetId, amount: 0, quantity: 10, price: 100 }],
        ['negative amount', { type: 'buy', assetId, amount: -100, quantity: 10, price: 100 }],
      ] as const)('rejects %s', async (_label, payload) => {
        await expectCreateRejects(payload, 'Amount must be a positive number')
      })

      it('rejects negative fee', async () => {
        await expectCreateRejects(
          {
            type: 'buy',
            assetId,
            amount: 1000,
            quantity: 10,
            price: 100,
            fee: -1,
          },
          'Fee must be zero or a positive number',
        )
      })

      it('rejects negative tax', async () => {
        await expectCreateRejects(
          {
            type: 'buy',
            assetId,
            amount: 1000,
            quantity: 10,
            price: 100,
            tax: -1,
          },
          'Tax must be zero or a positive number',
        )
      })
    })

    describe('buy', () => {
      it('rejects missing asset', async () => {
        await expectCreateRejects(
          { type: 'buy', amount: 1000, quantity: 10, price: 100 },
          'Asset is required for buy transactions',
        )
      })

      it('rejects non-positive quantity', async () => {
        await expectCreateRejects(
          { type: 'buy', assetId, amount: 1000, quantity: 0, price: 100 },
          'Quantity must be a positive number for buy transactions',
        )
      })

      it('rejects non-positive price', async () => {
        await expectCreateRejects(
          { type: 'buy', assetId, amount: 1000, quantity: 10, price: 0 },
          'Price must be a positive number for buy transactions',
        )
      })
    })

    describe('sell', () => {
      it('rejects missing asset', async () => {
        await expectCreateRejects(
          { type: 'sell', amount: 500, quantity: 5, price: 100 },
          'Asset is required for sell transactions',
        )
      })

      it('rejects non-positive quantity', async () => {
        await expectCreateRejects(
          { type: 'sell', assetId, amount: 500, quantity: 0, price: 100 },
          'Quantity must be a positive number for sell transactions',
        )
      })

      it('rejects non-positive price', async () => {
        await expectCreateRejects(
          { type: 'sell', assetId, amount: 500, quantity: 5, price: 0 },
          'Price must be a positive number for sell transactions',
        )
      })
    })

    describe('dividend', () => {
      it('rejects missing asset', async () => {
        await expectCreateRejects(
          { type: 'dividend', amount: 120 },
          'Asset is required for dividend transactions',
        )
      })

      it('rejects quantity', async () => {
        await expectCreateRejects(
          { type: 'dividend', assetId, amount: 120, quantity: 1 },
          'Quantity is not allowed for dividend transactions',
        )
      })

      it('rejects price', async () => {
        await expectCreateRejects(
          { type: 'dividend', assetId, amount: 120, price: 100 },
          'Price is not allowed for dividend transactions',
        )
      })
    })

    describe('deposit', () => {
      it('rejects asset', async () => {
        await expectCreateRejects(
          { type: 'deposit', assetId, amount: 3000 },
          'Asset is not allowed for deposit transactions',
        )
      })

      it('rejects quantity', async () => {
        await expectCreateRejects(
          { type: 'deposit', amount: 3000, quantity: 1 },
          'Quantity is not allowed for deposit transactions',
        )
      })

      it('rejects price', async () => {
        await expectCreateRejects(
          { type: 'deposit', amount: 3000, price: 100 },
          'Price is not allowed for deposit transactions',
        )
      })

      it('rejects non-zero fee', async () => {
        await expectCreateRejects(
          { type: 'deposit', amount: 3000, fee: 5 },
          'Fee must be zero for deposit transactions',
        )
      })

      it('rejects non-zero tax', async () => {
        await expectCreateRejects(
          { type: 'deposit', amount: 3000, tax: 3 },
          'Tax must be zero for deposit transactions',
        )
      })
    })
  })

  describe('update', () => {
    it('rejects invalid amount on buy update', async () => {
      await expectUpdateRejects(
        {
          id: 'tx-buy-1',
          accountId,
          assetId,
          type: 'buy',
          amount: 1000,
          quantity: 10,
          price: 100,
          fee: 0,
          tax: 0,
          brokerOrderNo: null,
          tradeTime: new Date(tradeTime),
          note: null,
          isDeleted: false,
          deletedAt: null,
        } as unknown as Transaction,
        { amount: 0 },
        'Amount must be a positive number',
      )
    })

    it('rejects missing asset when changing buy to invalid state', async () => {
      await expectUpdateRejects(
        {
          id: 'tx-buy-1',
          accountId,
          assetId,
          type: 'buy',
          amount: 1000,
          quantity: 10,
          price: 100,
          fee: 0,
          tax: 0,
          brokerOrderNo: null,
          tradeTime: new Date(tradeTime),
          note: null,
          isDeleted: false,
          deletedAt: null,
        } as unknown as Transaction,
        { assetId: '' },
        'Asset is required for buy transactions',
      )
    })

    it('rejects dividend quantity on update', async () => {
      await expectUpdateRejects(
        {
          id: 'tx-div-1',
          accountId,
          assetId,
          type: 'dividend',
          amount: 120,
          quantity: null,
          price: null,
          fee: 0,
          tax: 0,
          brokerOrderNo: null,
          tradeTime: new Date(tradeTime),
          note: null,
          isDeleted: false,
          deletedAt: null,
        } as unknown as Transaction,
        { quantity: 1 },
        'Quantity is not allowed for dividend transactions',
      )
    })

    it('rejects non-zero fee on deposit update', async () => {
      await expectUpdateRejects(
        buildDepositTransaction(),
        { fee: 5 },
        'Fee must be zero for deposit transactions',
      )
    })
  })
})
