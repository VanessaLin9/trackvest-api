import { Injectable } from '@nestjs/common'
import { CorporateAction, Prisma } from '@prisma/client'
import { toNumber } from '../common/utils/number.util'
import { roundTwShareQuantity } from './corp-action-ratio.util'

type SplitLedgerAction = Pick<
  CorporateAction,
  'id' | 'assetId' | 'exDate' | 'ratio' | 'market'
>

@Injectable()
export class SplitLedgerService {
  async applyCorporateAction(
    prisma: Prisma.TransactionClient,
    action: SplitLedgerAction,
    accountId: string,
  ): Promise<boolean> {
    const ratio = toNumber(action.ratio)
    if (ratio <= 0 || !Number.isFinite(ratio)) {
      return false
    }

    const eligibleLots = await prisma.positionLot.findMany({
      where: {
        accountId,
        assetId: action.assetId,
        openedAt: { lt: action.exDate },
        remainingQuantity: { gt: 0 },
      },
      orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
    })

    if (eligibleLots.length === 0) {
      return false
    }

    for (const lot of eligibleLots) {
      let remainingQuantity = toNumber(lot.remainingQuantity) * ratio
      let originalQuantity = toNumber(lot.originalQuantity) * ratio
      if (action.market === 'tw') {
        remainingQuantity = roundTwShareQuantity(remainingQuantity)
        originalQuantity = roundTwShareQuantity(originalQuantity)
      }
      const unitCost = toNumber(lot.unitCost) / ratio

      await prisma.positionLot.update({
        where: { id: lot.id },
        data: {
          remainingQuantity,
          originalQuantity,
          unitCost,
        },
      })
    }

    await this.recomputePositionFromLots(prisma, accountId, action.assetId)
    return true
  }

  async recomputePositionFromLots(
    prisma: Prisma.TransactionClient,
    accountId: string,
    assetId: string,
  ): Promise<void> {
    const openLots = await prisma.positionLot.findMany({
      where: {
        accountId,
        assetId,
        remainingQuantity: { gt: 0 },
      },
    })

    const nextQuantity = openLots.reduce(
      (sum, lot) => sum + toNumber(lot.remainingQuantity),
      0,
    )
    const nextCost = openLots.reduce(
      (sum, lot) => sum + toNumber(lot.remainingQuantity) * toNumber(lot.unitCost),
      0,
    )
    const nextAvgCost = nextQuantity > 0 ? nextCost / nextQuantity : 0

    const position = await prisma.position.findFirst({
      where: { accountId, assetId },
    })

    if (!position) {
      return
    }

    await prisma.position.update({
      where: { id: position.id },
      data: {
        quantity: nextQuantity,
        avgCost: nextAvgCost,
        closedAt: nextQuantity > 0 ? null : position.closedAt,
      },
    })
  }

  /** Returns true when the account already has this action applied (sync idempotency). */
  async isAlreadyApplied(
    prisma: Prisma.TransactionClient,
    corporateActionId: string,
    accountId: string,
  ): Promise<boolean> {
    const existing = await prisma.corporateActionApplication.findUnique({
      where: {
        corporateActionId_accountId: {
          corporateActionId,
          accountId,
        },
      },
    })
    return Boolean(existing)
  }

  async markApplied(
    prisma: Prisma.TransactionClient,
    corporateActionId: string,
    accountId: string,
  ): Promise<void> {
    await prisma.corporateActionApplication.upsert({
      where: {
        corporateActionId_accountId: {
          corporateActionId,
          accountId,
        },
      },
      create: {
        corporateActionId,
        accountId,
      },
      update: {},
    })
  }
}
