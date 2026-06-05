import { CorpActionService } from './corp-action.service'
import { SplitLedgerService } from './split-ledger.service'
import { FinmindTwSplitProvider } from './providers/finmind-tw-split.provider'
import { UsSplitInferProvider } from './providers/us-split-infer.provider'

describe('CorpActionService', () => {
  const assetId = 'yuanta50-asset'
  const accountId = 'broker-account'
  const exDate = new Date('2025-06-18T00:00:00.000Z')
  const ratio = 4

  function createHarness() {
    const splitLedgerService = new SplitLedgerService()
    const twSplitProvider = new FinmindTwSplitProvider()
    const usSplitProvider = new UsSplitInferProvider()

    const prisma = {
      asset: {
        findMany: jest.fn(),
      },
      corporateAction: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      positionLot: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(prisma),
      ),
    }

    const service = new CorpActionService(
      prisma as never,
      splitLedgerService,
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

    jest.spyOn(splitLedgerService, 'applyCorporateAction').mockResolvedValue(true)
    jest.spyOn(splitLedgerService, 'isAlreadyApplied').mockResolvedValue(false)
    jest.spyOn(splitLedgerService, 'markApplied').mockResolvedValue()

    return { service, prisma, splitLedgerService, twSplitProvider }
  }

  it('syncs TW split events and applies them to eligible accounts once', async () => {
    const { service, prisma, splitLedgerService } = createHarness()

    prisma.asset.findMany.mockResolvedValue([{ id: assetId, symbol: '0050' }])
    prisma.corporateAction.upsert.mockResolvedValue({
      id: 'corp-action-1',
      assetId,
      exDate,
      ratio,
    })
    prisma.positionLot.findMany.mockResolvedValue([{ accountId }])

    const result = await service.syncSplits({ market: 'tw', startDate: '2025-06-01', endDate: '2025-07-31' })

    expect(result).toEqual({
      market: 'tw',
      assetsProcessed: 1,
      eventsUpserted: 1,
      applicationsCreated: 1,
      applicationsSkipped: 0,
    })
    expect(splitLedgerService.applyCorporateAction).toHaveBeenCalledTimes(1)
    expect(splitLedgerService.markApplied).toHaveBeenCalledWith(
      prisma,
      'corp-action-1',
      accountId,
    )
  })

  it('skips already-applied accounts on subsequent sync runs', async () => {
    const { service, prisma, splitLedgerService } = createHarness()

    prisma.asset.findMany.mockResolvedValue([{ id: assetId, symbol: '0050' }])
    prisma.corporateAction.upsert.mockResolvedValue({
      id: 'corp-action-1',
      assetId,
      exDate,
      ratio,
    })
    prisma.positionLot.findMany.mockResolvedValue([{ accountId }])
    jest.spyOn(splitLedgerService, 'isAlreadyApplied').mockResolvedValue(true)

    const result = await service.syncSplits({ market: 'tw', startDate: '2025-06-01', endDate: '2025-07-31' })

    expect(result.applicationsCreated).toBe(0)
    expect(result.applicationsSkipped).toBe(1)
    expect(splitLedgerService.applyCorporateAction).not.toHaveBeenCalled()
  })

  it('replays recorded splits after scope rebuild without idempotency guard', async () => {
    const { service, prisma, splitLedgerService } = createHarness()

    prisma.corporateAction.findMany.mockResolvedValue([
      { id: 'corp-action-1', assetId, exDate, ratio, market: 'tw' },
    ])

    await service.reapplySplitsForScope(prisma as never, { accountId, assetId })

    expect(splitLedgerService.applyCorporateAction).toHaveBeenCalledWith(
      prisma,
      { id: 'corp-action-1', assetId, exDate, ratio, market: 'tw' },
      accountId,
    )
    expect(splitLedgerService.markApplied).toHaveBeenCalledWith(
      prisma,
      'corp-action-1',
      accountId,
    )
  })
})
