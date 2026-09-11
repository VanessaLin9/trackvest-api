import { adjustLotForSplit } from './split-lot.util';
import { replayScopeLedger } from './position-replay.engine';
import { Prisma } from '@prisma/client';

describe('fractional split entitlements', () => {
  it('preserves fractional shares and cost instead of rounding each lot', () => {
    const lot = { remainingQuantity: 5, originalQuantity: 7, unitCost: 10 };
    adjustLotForSplit(lot, 0.1);
    expect(lot).toEqual({
      remainingQuantity: 0.5,
      originalQuantity: 0.7,
      unitCost: 100,
    });
  });

  it.each(['tw', 'us'] as const)(
    'allows broker-reported fractional disposal after a %s reverse split',
    (market) => {
      const ledger = replayScopeLedger({
        corporateActions: [
          { exDate: new Date('2025-06-18'), market, ratio: 0.1 },
        ],
        transactions: [
          {
            id: 'buy-1',
            type: 'buy',
            quantity: 5,
            amount: 50,
            tradeTime: new Date('2025-06-01'),
          },
          {
            id: 'buy-2',
            type: 'buy',
            quantity: 10,
            amount: 200,
            tradeTime: new Date('2025-06-02'),
          },
          {
            id: 'cash-in-lieu',
            type: 'sell',
            quantity: 0.5,
            amount: 60,
            tradeTime: new Date('2025-06-20'),
          },
        ],
      });
      expect(ledger.position?.quantity.toNumber()).toBe(1);
      expect(ledger.position?.avgCost.toNumber()).toBe(200);
      expect(ledger.sellMatches).toEqual([
        {
          sellTransactionId: 'cash-in-lieu',
          buyLotKey: 'lot-1',
          quantity: new Prisma.Decimal(0.5),
          unitCost: new Prisma.Decimal(100),
        },
      ]);
    },
  );

  it('does not multiply the cash already disposed when replaying a later split', () => {
    const ledger = replayScopeLedger({
      corporateActions: [
        { exDate: new Date('2025-06-18'), market: 'us', ratio: 0.1 },
        { exDate: new Date('2025-07-01'), market: 'us', ratio: 2 },
      ],
      transactions: [
        {
          id: 'buy',
          type: 'buy',
          quantity: 15,
          amount: 150,
          tradeTime: new Date('2025-06-01'),
        },
        {
          id: 'cash',
          type: 'sell',
          quantity: 0.5,
          amount: 60,
          tradeTime: new Date('2025-06-20'),
        },
      ],
    });
    expect(ledger.position?.quantity.toNumber()).toBe(2);
    expect(ledger.position?.avgCost.toNumber()).toBe(50);
    expect(ledger.sellMatches[0]).toMatchObject({
      quantity: new Prisma.Decimal(0.5),
      unitCost: new Prisma.Decimal(100),
    });
  });
});
