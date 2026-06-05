import { CorpActionService } from './corp-action.service'
import { FinmindTwSplitProvider } from './providers/finmind-tw-split.provider'
import { UsSplitInferProvider } from './providers/us-split-infer.provider'

describe('CorpActionService', () => {
  const assetId = 'yuanta50-asset'
  const exDate = new Date('2025-06-18T00:00:00.000Z')
  const ratio = 4

  function createHarness() {
    const twSplitProvider = new FinmindTwSplitProvider()
    const usSplitProvider = new UsSplitInferProvider()

    const prisma = {
      asset: {
        findMany: jest.fn(),
      },
      corporateAction: {
        upsert: jest.fn(),
      },
    }

    const service = new CorpActionService(
      prisma as never,
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

    return { service, prisma, twSplitProvider }
  }

  it('syncSplits upserts corporate actions without mutating position lots', async () => {
    const { service, prisma } = createHarness()

    prisma.asset.findMany.mockResolvedValue([{ id: assetId, symbol: '0050' }])
    prisma.corporateAction.upsert.mockResolvedValue({
      id: 'corp-action-1',
      assetId,
      exDate,
      ratio,
    })

    const result = await service.syncSplits({
      market: 'tw',
      startDate: '2025-06-01',
      endDate: '2025-07-31',
    })

    expect(result).toEqual({
      market: 'tw',
      assetsProcessed: 1,
      eventsUpserted: 1,
      replayPending: true,
    })
    expect(prisma.corporateAction.upsert).toHaveBeenCalledTimes(1)
  })
})
