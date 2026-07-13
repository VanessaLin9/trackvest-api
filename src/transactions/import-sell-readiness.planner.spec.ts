import { planImportSellReadiness } from './import-sell-readiness.planner'
import {
  PlannerHistoryTransaction,
  PlannerImportCandidate,
  SELL_READINESS_BLOCK_REASONS,
} from './import-sell-readiness.planner.types'

const accountId = 'acct-1'
const assetId = 'asset-1'

function candidate(
  overrides: Partial<PlannerImportCandidate> &
    Pick<PlannerImportCandidate, 'rowNumber' | 'type' | 'tradeCalendarDate' | 'quantity'>,
): PlannerImportCandidate {
  return {
    accountId,
    assetId,
    ...overrides,
  }
}

function history(
  overrides: Partial<PlannerHistoryTransaction> &
    Pick<PlannerHistoryTransaction, 'id' | 'type' | 'tradeCalendarDate' | 'quantity'>,
): PlannerHistoryTransaction {
  return {
    accountId,
    assetId,
    ...overrides,
  }
}

describe('planImportSellReadiness', () => {
  it('plans newest-first cross-date buy/sell chronologically and marks both ready', () => {
    // CSV display order would be sell (row 2) before older buy (row 3).
    const plan = planImportSellReadiness({
      history: [],
      candidates: [
        candidate({
          rowNumber: 2,
          type: 'sell',
          tradeCalendarDate: '2022-01-04',
          quantity: 10,
        }),
        candidate({
          rowNumber: 3,
          type: 'buy',
          tradeCalendarDate: '2021-06-01',
          quantity: 10,
        }),
      ],
    })

    expect(plan.scopes).toHaveLength(1)
    expect(plan.scopes[0].entries).toEqual([
      expect.objectContaining({ rowNumber: 2, type: 'sell', status: 'ready' }),
      expect.objectContaining({ rowNumber: 3, type: 'buy', status: 'ready' }),
    ])
    expect(plan.writeOrderRowNumbers).toEqual([3, 2])
  })

  it('does not use CSV row order as write order when dates differ', () => {
    const plan = planImportSellReadiness({
      history: [],
      candidates: [
        candidate({
          rowNumber: 5,
          type: 'buy',
          tradeCalendarDate: '2024-01-01',
          quantity: 5,
        }),
        candidate({
          rowNumber: 6,
          type: 'sell',
          tradeCalendarDate: '2022-01-04',
          quantity: 3,
        }),
        candidate({
          rowNumber: 7,
          type: 'buy',
          tradeCalendarDate: '2021-01-01',
          quantity: 10,
        }),
      ],
    })

    expect(plan.writeOrderRowNumbers).toEqual([7, 6, 5])
    expect(plan.scopes[0].entries.every((entry) => entry.status === 'ready')).toBe(true)
  })

  it('lets DB history outside the file fund a later imported sell', () => {
    const plan = planImportSellReadiness({
      history: [
        history({
          id: 'db-buy-1',
          type: 'buy',
          tradeCalendarDate: '2020-01-01',
          quantity: 20,
        }),
      ],
      candidates: [
        candidate({
          rowNumber: 2,
          type: 'sell',
          tradeCalendarDate: '2022-01-04',
          quantity: 15,
        }),
      ],
    })

    expect(plan.scopes[0].entries).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        status: 'ready',
      }),
    ])
    expect(plan.writeOrderRowNumbers).toEqual([2])
  })

  it('blocks a sell with no prior history as SELL_HISTORY_REQUIRED', () => {
    const plan = planImportSellReadiness({
      history: [],
      candidates: [
        candidate({
          rowNumber: 2,
          type: 'sell',
          tradeCalendarDate: '2022-01-04',
          quantity: 5,
        }),
      ],
    })

    expect(plan.scopes[0].entries).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        status: 'blocked',
        blockReason: SELL_READINESS_BLOCK_REASONS.SELL_HISTORY_REQUIRED,
      }),
    ])
    expect(plan.writeOrderRowNumbers).toEqual([])
  })

  it('blocks a genuine oversell as SELL_INSUFFICIENT_LOTS', () => {
    const plan = planImportSellReadiness({
      history: [
        history({
          id: 'db-buy-small',
          type: 'buy',
          tradeCalendarDate: '2021-01-01',
          quantity: 3,
        }),
      ],
      candidates: [
        candidate({
          rowNumber: 2,
          type: 'sell',
          tradeCalendarDate: '2022-01-04',
          quantity: 5,
        }),
      ],
    })

    expect(plan.scopes[0].entries).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        status: 'blocked',
        blockReason: SELL_READINESS_BLOCK_REASONS.SELL_INSUFFICIENT_LOTS,
      }),
    ])
  })

  it('blocks a same-day sell that depends only on same-day buy as ambiguous', () => {
    const plan = planImportSellReadiness({
      history: [],
      candidates: [
        candidate({
          rowNumber: 2,
          type: 'sell',
          tradeCalendarDate: '2022-01-04',
          quantity: 10,
        }),
        candidate({
          rowNumber: 3,
          type: 'buy',
          tradeCalendarDate: '2022-01-04',
          quantity: 10,
        }),
      ],
    })

    expect(plan.scopes[0].entries).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        type: 'sell',
        status: 'blocked',
        blockReason: SELL_READINESS_BLOCK_REASONS.SELL_SAME_DAY_ORDER_AMBIGUOUS,
      }),
      expect.objectContaining({
        rowNumber: 3,
        type: 'buy',
        status: 'ready',
      }),
    ])
    expect(plan.writeOrderRowNumbers).toEqual([3])
  })

  it('keeps a same-day sell ready when earlier-date holdings fully cover it', () => {
    const plan = planImportSellReadiness({
      history: [
        history({
          id: 'db-buy-prior',
          type: 'buy',
          tradeCalendarDate: '2021-12-01',
          quantity: 10,
        }),
      ],
      candidates: [
        candidate({
          rowNumber: 2,
          type: 'sell',
          tradeCalendarDate: '2022-01-04',
          quantity: 8,
        }),
        candidate({
          rowNumber: 3,
          type: 'buy',
          tradeCalendarDate: '2022-01-04',
          quantity: 5,
        }),
      ],
    })

    expect(plan.scopes[0].entries).toEqual([
      expect.objectContaining({ rowNumber: 2, type: 'sell', status: 'ready' }),
      expect.objectContaining({ rowNumber: 3, type: 'buy', status: 'ready' }),
    ])
    expect(plan.writeOrderRowNumbers).toEqual([3, 2])
  })

  it('does not let same-day buys cover a shortfall that earlier holdings leave', () => {
    const plan = planImportSellReadiness({
      history: [
        history({
          id: 'db-buy-partial',
          type: 'buy',
          tradeCalendarDate: '2021-12-01',
          quantity: 4,
        }),
      ],
      candidates: [
        candidate({
          rowNumber: 2,
          type: 'sell',
          tradeCalendarDate: '2022-01-04',
          quantity: 10,
        }),
        candidate({
          rowNumber: 3,
          type: 'buy',
          tradeCalendarDate: '2022-01-04',
          quantity: 6,
        }),
      ],
    })

    expect(plan.scopes[0].entries.find((entry) => entry.rowNumber === 2)).toEqual(
      expect.objectContaining({
        status: 'blocked',
        blockReason: SELL_READINESS_BLOCK_REASONS.SELL_SAME_DAY_ORDER_AMBIGUOUS,
      }),
    )
  })

  it('plans independent scopes separately', () => {
    const plan = planImportSellReadiness({
      history: [],
      candidates: [
        candidate({
          rowNumber: 2,
          assetId: 'asset-a',
          type: 'sell',
          tradeCalendarDate: '2022-01-04',
          quantity: 5,
        }),
        candidate({
          rowNumber: 3,
          assetId: 'asset-a',
          type: 'buy',
          tradeCalendarDate: '2021-01-01',
          quantity: 5,
        }),
        candidate({
          rowNumber: 4,
          assetId: 'asset-b',
          type: 'sell',
          tradeCalendarDate: '2022-01-04',
          quantity: 1,
        }),
      ],
    })

    expect(plan.scopes).toHaveLength(2)
    const scopeA = plan.scopes.find((scope) => scope.assetId === 'asset-a')
    const scopeB = plan.scopes.find((scope) => scope.assetId === 'asset-b')
    expect(scopeA?.writeOrderRowNumbers).toEqual([3, 2])
    expect(scopeB?.entries[0]).toEqual(
      expect.objectContaining({
        status: 'blocked',
        blockReason: SELL_READINESS_BLOCK_REASONS.SELL_HISTORY_REQUIRED,
      }),
    )
  })

  it('ignores later-date buys when funding an earlier sell', () => {
    const plan = planImportSellReadiness({
      history: [],
      candidates: [
        candidate({
          rowNumber: 2,
          type: 'sell',
          tradeCalendarDate: '2022-01-04',
          quantity: 10,
        }),
        candidate({
          rowNumber: 3,
          type: 'buy',
          tradeCalendarDate: '2023-01-01',
          quantity: 10,
        }),
      ],
    })

    expect(plan.scopes[0].entries.find((entry) => entry.rowNumber === 2)).toEqual(
      expect.objectContaining({
        status: 'blocked',
        blockReason: SELL_READINESS_BLOCK_REASONS.SELL_HISTORY_REQUIRED,
      }),
    )
    expect(plan.writeOrderRowNumbers).toEqual([3])
  })
})
