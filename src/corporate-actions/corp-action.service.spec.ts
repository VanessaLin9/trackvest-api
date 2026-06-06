import { CorpActionService } from './corp-action.service'
import { FinmindTwSplitProvider } from './providers/finmind-tw-split.provider'
import { UsSplitInferProvider } from './providers/us-split-infer.provider'

describe('CorpActionService', () => {
  const assetId = 'yuanta50-asset'
  const accountWithOpenLots = 'acct-open'
  const accountWithHistoryOnly = 'acct-history'
  const corporateActionId = 'corp-action-1'
  const exDate = new Date('2025-06-18T00:00:00.000Z')
  const ratio = 4

  function createHarness() {
    const twSplitProvider = new FinmindTwSplitProvider()
    const usSplitProvider = new UsSplitInferProvider()

    const txClient = {
      transaction: {
        findMany: jest.fn(),
      },
      corporateActionApplication: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
    }

    const prisma = {
      asset: {
        findMany: jest.fn(),
      },
      corporateAction: {
        upsert: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
      },
      corporateActionApplication: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: typeof txClient) => Promise<void>) =>
        callback(txClient),
      ),
    }

    const positionReplayService = {
      rebuildScope: jest.fn().mockResolvedValue([]),
    }

    const postingService = {
      postTransaction: jest.fn(),
    }

    const service = new CorpActionService(
      prisma as never,
      positionReplayService as never,
      postingService as never,
      twSplitProvider,
      usSplitProvider,
    )

    jest.spyOn(twSplitProvider, 'fetchSplitEvents').mockResolvedValue([
      {
        stockId: '0050',
        exDate: '2025-06-18',
        direction: 'split',
        ratio,
        beforePrice: 188.65,
        afterPrice: 47.16,
        sourceKey: '0050:2025-06-18:分割',
      },
    ])

    return { service, prisma, txClient, positionReplayService, postingService }
  }

  it('syncSplits upserts corporate actions without mutating position lots directly', async () => {
    const { service, prisma } = createHarness()

    prisma.asset.findMany.mockResolvedValue([{ id: assetId, symbol: '0050' }])
    prisma.corporateAction.upsert.mockResolvedValue({
      id: corporateActionId,
      assetId,
      exDate,
      ratio,
    })
    prisma.transaction.findMany.mockResolvedValue([])

    const result = await service.syncSplits({
      market: 'tw',
      startDate: '2025-06-01',
      endDate: '2025-07-31',
    })

    expect(result).toEqual({
      market: 'tw',
      assetsProcessed: 1,
      eventsUpserted: 1,
      scopesReplayed: 0,
      replayPending: true,
    })
    expect(prisma.corporateAction.upsert).toHaveBeenCalledTimes(1)
  })

  it('replays affected scopes from buy/sell transactions instead of open lots only', async () => {
    const { service, prisma, txClient, positionReplayService } = createHarness()

    prisma.asset.findMany.mockResolvedValue([{ id: assetId, symbol: '0050' }])
    prisma.corporateAction.upsert.mockResolvedValue({
      id: corporateActionId,
      assetId,
      exDate,
      ratio,
    })
    prisma.transaction.findMany.mockResolvedValue([
      { accountId: accountWithOpenLots, assetId },
      { accountId: accountWithHistoryOnly, assetId },
    ])

    const result = await service.syncSplits({
      market: 'tw',
      startDate: '2025-06-01',
      endDate: '2025-07-31',
    })

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        assetId: { in: [assetId] },
        type: { in: ['buy', 'sell'] },
        isDeleted: false,
      },
      distinct: ['accountId', 'assetId'],
      select: {
        accountId: true,
        assetId: true,
      },
    })
    expect(result.scopesReplayed).toBe(2)
    expect(result.replayPending).toBe(false)
    expect(positionReplayService.rebuildScope).toHaveBeenCalledTimes(2)
    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId: accountWithOpenLots,
      assetId,
    })
    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId: accountWithHistoryOnly,
      assetId,
    })
  })

  it('reposts sell GL from rebuilt SellLotMatch after scope replay', async () => {
    const { service, prisma, txClient, positionReplayService, postingService } = createHarness()
    const userId = 'user-1'
    const sellTransaction = {
      id: 'sell-post-split',
      accountId: accountWithHistoryOnly,
      assetId,
      type: 'sell',
      amount: 1919,
      quantity: 40,
      price: 47.98,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2025-07-02T09:00:00.000Z'),
      isDeleted: false,
      account: { userId },
    }

    prisma.asset.findMany.mockResolvedValue([{ id: assetId, symbol: '0050' }])
    prisma.corporateAction.upsert.mockResolvedValue({
      id: corporateActionId,
      assetId,
      exDate,
      ratio,
    })
    prisma.transaction.findMany.mockResolvedValue([
      { accountId: accountWithHistoryOnly, assetId },
    ])
    positionReplayService.rebuildScope.mockResolvedValue(['sell-post-split'])
    txClient.transaction.findMany.mockResolvedValue([sellTransaction])

    await service.syncSplits({
      market: 'tw',
      startDate: '2025-06-01',
      endDate: '2025-07-31',
    })

    expect(txClient.transaction.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['sell-post-split'] },
        type: 'sell',
        isDeleted: false,
      },
      include: {
        account: {
          select: { userId: true },
        },
      },
    })
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: sellTransaction,
      db: txClient,
    })
  })

  it('records CorporateActionApplication after replay without using it as a skip gate', async () => {
    const { service, prisma, txClient } = createHarness()

    prisma.asset.findMany.mockResolvedValue([{ id: assetId, symbol: '0050' }])
    prisma.corporateAction.upsert.mockResolvedValue({
      id: corporateActionId,
      assetId,
      exDate,
      ratio,
    })
    prisma.transaction.findMany.mockResolvedValue([
      { accountId: accountWithHistoryOnly, assetId },
    ])
    prisma.corporateActionApplication.findUnique.mockResolvedValue({
      id: 'existing-application',
      corporateActionId,
      accountId: accountWithHistoryOnly,
    })

    await service.syncSplits({
      market: 'tw',
      startDate: '2025-06-01',
      endDate: '2025-07-31',
    })

    expect(prisma.corporateActionApplication.findUnique).not.toHaveBeenCalled()
    expect(txClient.corporateActionApplication.upsert).toHaveBeenCalledWith({
      where: {
        corporateActionId_accountId: {
          corporateActionId,
          accountId: accountWithHistoryOnly,
        },
      },
      create: {
        corporateActionId,
        accountId: accountWithHistoryOnly,
      },
      update: {
        appliedAt: expect.any(Date),
      },
    })
  })
})
