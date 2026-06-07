import { Prisma } from '@prisma/client'
import { TransactionRebuildPolicyService } from './transaction-rebuild-policy.service'

describe('TransactionRebuildPolicyService', () => {
  const accountId = 'account-1'
  const assetId = 'asset-1'
  const tradeTime = new Date('2026-03-25T09:30:00.000Z')

  function createHarness() {
    const txClient = {
      transaction: {
        findFirst: jest.fn(),
      },
    }

    const policy = new TransactionRebuildPolicyService()

    txClient.transaction.findFirst.mockResolvedValue(null)

    return {
      policy,
      txClient,
    }
  }

  it('returns no replay for non-position create mutations', async () => {
    const { policy, txClient } = createHarness()

    const decision = await policy.resolveCreateMutation(
      txClient as unknown as Prisma.TransactionClient,
      {
        accountId,
        assetId: null,
        type: 'deposit',
        tradeTime,
      },
    )

    expect(decision).toEqual({
      scope: null,
      needsFullScopeReplay: false,
      canUseIncrementalSellPlan: false,
      shouldPostCurrentTransaction: true,
    })
    expect(txClient.transaction.findFirst).not.toHaveBeenCalled()
  })

  it('requires full scope replay when creating a backdated buy before future sells', async () => {
    const { policy, txClient } = createHarness()
    txClient.transaction.findFirst.mockResolvedValue({ id: 'sell-later' })

    const decision = await policy.resolveCreateMutation(
      txClient as unknown as Prisma.TransactionClient,
      {
        accountId,
        assetId,
        type: 'buy',
        tradeTime,
      },
    )

    expect(decision).toEqual({
      scope: { accountId, assetId },
      needsFullScopeReplay: true,
      canUseIncrementalSellPlan: false,
      shouldPostCurrentTransaction: true,
    })
  })

  it('allows incremental sell plan when creating a sell without later scoped activity', async () => {
    const { policy, txClient } = createHarness()

    const decision = await policy.resolveCreateMutation(
      txClient as unknown as Prisma.TransactionClient,
      {
        accountId,
        assetId,
        type: 'sell',
        tradeTime,
      },
    )

    expect(decision).toEqual({
      scope: { accountId, assetId },
      needsFullScopeReplay: false,
      canUseIncrementalSellPlan: true,
      shouldPostCurrentTransaction: true,
    })
  })

  it('requires full scope replay when creating a backdated sell before later scoped activity', async () => {
    const { policy, txClient } = createHarness()
    txClient.transaction.findFirst.mockResolvedValue({ id: 'buy-later' })

    const decision = await policy.resolveCreateMutation(
      txClient as unknown as Prisma.TransactionClient,
      {
        accountId,
        assetId,
        type: 'sell',
        tradeTime,
      },
    )

    expect(decision).toEqual({
      scope: { accountId, assetId },
      needsFullScopeReplay: true,
      canUseIncrementalSellPlan: false,
      shouldPostCurrentTransaction: false,
    })
  })

  it('rebuilds affected scopes on sell update and skips posting the current sell entry', () => {
    const { policy } = createHarness()

    const decision = policy.resolveUpdateMutation(
      {
        id: 'sell-1',
        accountId,
        assetId,
        type: 'sell',
      } as never,
      {
        id: 'sell-1',
        accountId,
        assetId,
        type: 'sell',
      } as never,
    )

    expect(decision).toEqual({
      affectedScopes: [{ accountId, assetId }],
      needsFullScopeReplay: true,
      shouldPostCurrentTransaction: false,
    })
  })

  it('rebuilds affected scopes on buy update and still posts the current buy entry', () => {
    const { policy } = createHarness()

    const decision = policy.resolveUpdateMutation(
      {
        id: 'buy-1',
        accountId,
        assetId,
        type: 'buy',
      } as never,
      {
        id: 'buy-1',
        accountId,
        assetId,
        type: 'buy',
      } as never,
    )

    expect(decision).toEqual({
      affectedScopes: [{ accountId, assetId }],
      needsFullScopeReplay: true,
      shouldPostCurrentTransaction: true,
    })
  })

  it('does not rebuild when updating a non-position transaction', () => {
    const { policy } = createHarness()

    const decision = policy.resolveUpdateMutation(
      {
        id: 'deposit-1',
        accountId,
        assetId: null,
        type: 'deposit',
      } as never,
      {
        id: 'deposit-1',
        accountId,
        assetId: null,
        type: 'deposit',
      } as never,
    )

    expect(decision).toEqual({
      affectedScopes: [],
      needsFullScopeReplay: false,
      shouldPostCurrentTransaction: true,
    })
  })

  it('rebuilds scoped delete mutations for buy and sell transactions', () => {
    const { policy } = createHarness()

    expect(
      policy.resolveDeleteMutation({
        accountId,
        assetId,
        type: 'buy',
      }),
    ).toEqual({
      affectedScopes: [{ accountId, assetId }],
      needsFullScopeReplay: true,
    })

    expect(
      policy.resolveDeleteMutation({
        accountId,
        assetId,
        type: 'sell',
      }),
    ).toEqual({
      affectedScopes: [{ accountId, assetId }],
      needsFullScopeReplay: true,
    })
  })

  it('does not rebuild when deleting a non-position transaction', () => {
    const { policy } = createHarness()

    expect(
      policy.resolveDeleteMutation({
        accountId,
        assetId: null,
        type: 'withdraw',
      }),
    ).toEqual({
      affectedScopes: [],
      needsFullScopeReplay: false,
    })
  })

  it('collects both scopes when a buy update moves to another account and asset', () => {
    const { policy } = createHarness()

    const decision = policy.resolveUpdateMutation(
      {
        id: 'buy-1',
        accountId,
        assetId,
        type: 'buy',
      } as never,
      {
        id: 'buy-1',
        accountId: 'account-2',
        assetId: 'asset-2',
        type: 'buy',
      } as never,
    )

    expect(decision.affectedScopes).toEqual([
      { accountId, assetId },
      { accountId: 'account-2', assetId: 'asset-2' },
    ])
    expect(decision.needsFullScopeReplay).toBe(true)
    expect(decision.shouldPostCurrentTransaction).toBe(true)
  })
})
