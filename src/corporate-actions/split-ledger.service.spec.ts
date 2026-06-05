import { SplitLedgerService } from './split-ledger.service'
import { isApproximatelyEqual, toNumber } from '../common/utils/number.util'

describe('SplitLedgerService', () => {
  const service = new SplitLedgerService()
  const accountId = 'broker-account'
  const assetId = 'yuanta50-asset'
  const exDate = new Date('2025-06-18T00:00:00.000Z')
  const ratio = 4

  const lot2 = {
    id: 'lot-2',
    accountId,
    assetId,
    sourceTransactionId: 'tx-lot-2',
    originalQuantity: 50,
    remainingQuantity: 30,
    unitCost: 185.45,
    openedAt: new Date('2025-03-10T09:00:00.000Z'),
    closedAt: null,
  }

  const lot3 = {
    id: 'lot-3',
    accountId,
    assetId,
    sourceTransactionId: 'tx-lot-3',
    originalQuantity: 20,
    remainingQuantity: 20,
    unitCost: 49.91,
    openedAt: new Date('2025-07-10T09:00:00.000Z'),
    closedAt: null,
  }

  const position = {
    id: 'position-1',
    accountId,
    assetId,
    quantity: 50,
    avgCost: 131.23,
    openedAt: new Date('2025-03-03T09:00:00.000Z'),
    closedAt: null,
  }

  function createPrismaMock() {
    const positionLot = {
      findMany: jest.fn(),
      update: jest.fn(),
    }
    const positionModel = {
      findFirst: jest.fn(),
      update: jest.fn(),
    }
    const corporateActionApplication = {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    }

    return {
      positionLot,
      position: positionModel,
      corporateActionApplication,
    }
  }

  it('adjusts only pre-split open lots and recomputes position (0050 fixture)', async () => {
    const prisma = createPrismaMock()
    prisma.positionLot.findMany
      .mockResolvedValueOnce([lot2])
      .mockResolvedValueOnce([
        {
          ...lot2,
          remainingQuantity: lot2.remainingQuantity * ratio,
          originalQuantity: lot2.originalQuantity * ratio,
          unitCost: lot2.unitCost / ratio,
        },
        lot3,
      ])
    prisma.position.findFirst.mockResolvedValue(position)

    const action = {
      id: 'corp-action-1',
      assetId,
      exDate,
      ratio,
      market: 'tw',
    } as never

    const adjusted = await service.applyCorporateAction(prisma as never, action, accountId)

    expect(adjusted).toBe(true)
    expect(prisma.positionLot.update).toHaveBeenCalledWith({
      where: { id: lot2.id },
      data: {
        remainingQuantity: lot2.remainingQuantity * ratio,
        originalQuantity: lot2.originalQuantity * ratio,
        unitCost: lot2.unitCost / ratio,
      },
    })
    expect(prisma.positionLot.update).toHaveBeenCalledTimes(1)

    const expectedQuantity = lot2.remainingQuantity * ratio + lot3.remainingQuantity
    const expectedAvgCost =
      (lot2.remainingQuantity * ratio * (lot2.unitCost / ratio) +
        lot3.remainingQuantity * lot3.unitCost) /
      expectedQuantity

    expect(prisma.position.update).toHaveBeenCalledWith({
      where: { id: position.id },
      data: {
        quantity: expectedQuantity,
        avgCost: expectedAvgCost,
        closedAt: null,
      },
    })

    expect(expectedQuantity).toBe(140)
    expect(isApproximatelyEqual(expectedAvgCost, 46.87, 0.05)).toBe(true)
  })

  it('is idempotent when sync application marker already exists', async () => {
    const prisma = createPrismaMock()
    prisma.corporateActionApplication.findUnique.mockResolvedValue({ id: 'app-1' })

    const alreadyApplied = await service.isAlreadyApplied(prisma as never, 'corp-action-1', accountId)

    expect(alreadyApplied).toBe(true)
    expect(prisma.corporateActionApplication.findUnique).toHaveBeenCalledWith({
      where: {
        corporateActionId_accountId: {
          corporateActionId: 'corp-action-1',
          accountId,
        },
      },
    })
  })

  it('recomputes position from open lots after split replay', async () => {
    const prisma = createPrismaMock()
    const adjustedLot2 = {
      ...lot2,
      remainingQuantity: 120,
      unitCost: 46.3625,
    }
    prisma.positionLot.findMany.mockResolvedValue([adjustedLot2, lot3])
    prisma.position.findFirst.mockResolvedValue(position)

    await service.recomputePositionFromLots(prisma as never, accountId, assetId)

    const expectedQuantity = toNumber(adjustedLot2.remainingQuantity) + lot3.remainingQuantity
    const expectedAvgCost =
      (toNumber(adjustedLot2.remainingQuantity) * toNumber(adjustedLot2.unitCost) +
        lot3.remainingQuantity * lot3.unitCost) /
      expectedQuantity

    expect(prisma.position.update).toHaveBeenCalledWith({
      where: { id: position.id },
      data: {
        quantity: expectedQuantity,
        avgCost: expectedAvgCost,
        closedAt: null,
      },
    })
  })
})
