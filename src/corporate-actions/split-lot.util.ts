import { Prisma } from '@prisma/client';

/** Preserve fractional entitlements until the broker reports an actual disposal. */
export function adjustLotForSplit(
  lot: {
    remainingQuantity: number;
    unitCost: number;
    originalQuantity?: number;
  },
  ratio: number,
): void {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error('split ratio must be a positive finite number');
  }
  if (lot.remainingQuantity <= 0) return;
  const factor = new Prisma.Decimal(ratio);
  lot.remainingQuantity = new Prisma.Decimal(lot.remainingQuantity)
    .mul(factor)
    .toNumber();
  lot.unitCost = new Prisma.Decimal(lot.unitCost).div(factor).toNumber();
  if (lot.originalQuantity != null) {
    lot.originalQuantity = new Prisma.Decimal(lot.originalQuantity)
      .mul(factor)
      .toNumber();
  }
}
