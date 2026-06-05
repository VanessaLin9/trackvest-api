import { SplitLedgerService } from './split-ledger.service'
import { toNumber } from '../common/utils/number.util'

describe('SplitLedgerService', () => {
  const service = new SplitLedgerService()
  const accountId = 'broker-account'
  const assetId = 'yuanta50-asset'

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
    return {
      positionLot: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      position: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      corporateActionApplication: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    }
  }

  it('recomputes position from open lots', async () => {
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
