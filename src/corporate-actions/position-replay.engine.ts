import { CorpActionMarket } from './corp-action.types';
import { adjustLotForSplit } from './split-lot.util';
import { Prisma } from '@prisma/client';

type DecimalLike = Prisma.Decimal | number | string;

function decimal(value: DecimalLike): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export type ReplayTransaction = {
  id: string;
  type: 'buy' | 'sell';
  tradeTime: Date;
  quantity: DecimalLike;
  amount: DecimalLike;
};

export type ReplayCorporateAction = {
  exDate: Date;
  ratio: DecimalLike;
  market: CorpActionMarket;
};

export type ReplayScopeInput = {
  transactions: ReplayTransaction[];
  corporateActions: ReplayCorporateAction[];
};

export type ReplayScopeResult = {
  openQuantity: number;
  avgCost: number;
};

export type ReplayLotState = {
  key: string;
  sourceTransactionId: string;
  originalQuantity: Prisma.Decimal;
  remainingQuantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  openedAt: Date;
  closedAt: Date | null;
};

export type ReplaySellLotMatch = {
  sellTransactionId: string;
  buyLotKey: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
};

export type ReplayLedgerResult = {
  lots: ReplayLotState[];
  sellMatches: ReplaySellLotMatch[];
  position: {
    quantity: Prisma.Decimal;
    avgCost: Prisma.Decimal;
    openedAt: Date;
    closedAt: Date | null;
  } | null;
  sellTransactionIds: string[];
};

type ReplayLot = ReplayLotState;

/**
 * 純函式持倉時序引擎（PR #19）：buy／sell／split 排成 timeline。
 * 同日事件：split priority=0 先於交易（ex-date 當日先調股數再買賣）。
 * 分割保留畸零股權益及成本，直到券商回報實際處分。
 */
type TimelineEvent =
  | {
      kind: 'split';
      sortTime: Date;
      priority: 0;
      ratio: Prisma.Decimal;
      market: CorpActionMarket;
    }
  | {
      kind: 'buy';
      sortTime: Date;
      priority: 1;
      sourceTransactionId: string;
      quantity: Prisma.Decimal;
      amount: Prisma.Decimal;
    }
  | {
      kind: 'sell';
      sortTime: Date;
      priority: 1;
      sellTransactionId: string;
      quantity: Prisma.Decimal;
    };

export function replayScope(input: ReplayScopeInput): ReplayScopeResult {
  const ledger = replayScopeLedger(input);
  if (!ledger.position) {
    return { openQuantity: 0, avgCost: 0 };
  }

  return {
    openQuantity: ledger.position.quantity.toNumber(),
    avgCost: ledger.position.avgCost.toNumber(),
  };
}

export function replayScopeLedger(input: ReplayScopeInput): ReplayLedgerResult {
  const lots: ReplayLot[] = [];
  const sellMatches: ReplaySellLotMatch[] = [];
  const sellTransactionIds: string[] = [];
  let lotSequence = 0;
  let positionOpenedAt: Date | null = null;

  for (const event of buildTimeline(input)) {
    if (event.kind === 'split') {
      applySplitToOpenLots(lots, event.ratio);
      continue;
    }

    if (event.kind === 'buy') {
      const quantity = event.quantity;
      const unitCost = event.amount.div(quantity);
      const openedAt = event.sortTime;
      if (sumOpenQuantity(lots).lte(0)) {
        positionOpenedAt = openedAt;
      }

      lots.push({
        key: `lot-${(lotSequence += 1)}`,
        sourceTransactionId: event.sourceTransactionId,
        originalQuantity: quantity,
        remainingQuantity: quantity,
        unitCost,
        openedAt,
        closedAt: null,
      });
      continue;
    }

    sellTransactionIds.push(event.sellTransactionId);
    let remainingToSell = event.quantity;

    for (const lot of lots) {
      if (remainingToSell.lte(0)) {
        break;
      }
      if (lot.remainingQuantity.lte(0)) {
        continue;
      }

      const consumedQuantity = lot.remainingQuantity.lt(remainingToSell)
        ? lot.remainingQuantity
        : remainingToSell;
      lot.remainingQuantity = lot.remainingQuantity.sub(consumedQuantity);
      remainingToSell = remainingToSell.sub(consumedQuantity);

      sellMatches.push({
        sellTransactionId: event.sellTransactionId,
        buyLotKey: lot.key,
        quantity: consumedQuantity,
        unitCost: lot.unitCost,
      });

      if (lot.remainingQuantity.lte(0)) {
        lot.closedAt = event.sortTime;
      }
    }

    if (remainingToSell.gt(0)) {
      throw new Error('sell quantity exceeds open lots during replay');
    }
  }

  const openQuantity = sumOpenQuantity(lots);
  const openCost = sumOpenCost(lots);

  if (openQuantity.lte(0) || !positionOpenedAt) {
    return {
      lots,
      sellMatches,
      position: null,
      sellTransactionIds,
    };
  }

  return {
    lots,
    sellMatches,
    position: {
      quantity: openQuantity,
      avgCost: openCost.div(openQuantity),
      openedAt: positionOpenedAt,
      closedAt: null,
    },
    sellTransactionIds,
  };
}

function sumOpenQuantity(lots: ReplayLot[]): Prisma.Decimal {
  return lots.reduce(
    (sum, lot) =>
      sum.add(lot.remainingQuantity.gt(0) ? lot.remainingQuantity : 0),
    new Prisma.Decimal(0),
  );
}

function sumOpenCost(lots: ReplayLot[]): Prisma.Decimal {
  return lots.reduce(
    (sum, lot) =>
      sum.add(
        lot.remainingQuantity.gt(0)
          ? lot.remainingQuantity.mul(lot.unitCost)
          : 0,
      ),
    new Prisma.Decimal(0),
  );
}

function buildTimeline(input: ReplayScopeInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const action of input.corporateActions) {
    events.push({
      kind: 'split',
      sortTime: action.exDate,
      priority: 0,
      ratio: decimal(action.ratio),
      market: action.market,
    });
  }

  for (const transaction of input.transactions) {
    if (transaction.type === 'buy') {
      events.push({
        kind: 'buy',
        sortTime: transaction.tradeTime,
        priority: 1,
        sourceTransactionId: transaction.id,
        quantity: decimal(transaction.quantity),
        amount: decimal(transaction.amount),
      });
      continue;
    }

    events.push({
      kind: 'sell',
      sortTime: transaction.tradeTime,
      priority: 1,
      sellTransactionId: transaction.id,
      quantity: decimal(transaction.quantity),
    });
  }

  return events.sort((left, right) => {
    const timeDiff = left.sortTime.getTime() - right.sortTime.getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return left.priority - right.priority;
  });
}

function applySplitToOpenLots(lots: ReplayLot[], ratio: Prisma.Decimal): void {
  if (ratio.lte(0) || !ratio.isFinite()) {
    throw new Error('split ratio must be a positive finite number');
  }

  for (const lot of lots) {
    if (lot.remainingQuantity.lte(0)) {
      continue;
    }

    adjustLotForSplit(lot, ratio);
  }
}
