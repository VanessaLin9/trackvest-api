import { Prisma } from '@prisma/client';

type DecimalLike = Prisma.Decimal | number | string;

/** Preserve fractional entitlements until the broker reports an actual disposal. */
export function adjustLotForSplit(
  lot: {
    remainingQuantity: DecimalLike;
    unitCost: DecimalLike;
    originalQuantity?: DecimalLike;
  },
  ratio: DecimalLike,
): void {
  const factor =
    ratio instanceof Prisma.Decimal ? ratio : new Prisma.Decimal(ratio);
  if (!factor.isFinite() || factor.lte(0)) {
    throw new Error('split ratio must be a positive finite number');
  }
  const remaining =
    lot.remainingQuantity instanceof Prisma.Decimal
      ? lot.remainingQuantity
      : new Prisma.Decimal(lot.remainingQuantity);
  if (remaining.lte(0)) return;
  const adjustedQuantity = remaining.mul(factor);
  const adjustedCost = (
    lot.unitCost instanceof Prisma.Decimal
      ? lot.unitCost
      : new Prisma.Decimal(lot.unitCost)
  ).div(factor);
  lot.remainingQuantity =
    lot.remainingQuantity instanceof Prisma.Decimal
      ? adjustedQuantity
      : adjustedQuantity.toNumber();
  lot.unitCost =
    lot.unitCost instanceof Prisma.Decimal
      ? adjustedCost
      : adjustedCost.toNumber();
  if (lot.originalQuantity != null) {
    const original = (
      lot.originalQuantity instanceof Prisma.Decimal
        ? lot.originalQuantity
        : new Prisma.Decimal(lot.originalQuantity)
    ).mul(factor);
    lot.originalQuantity =
      lot.originalQuantity instanceof Prisma.Decimal
        ? original
        : original.toNumber();
  }
}
