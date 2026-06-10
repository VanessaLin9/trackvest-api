# Refactoring & architecture notes

> **Document status:** Living notes for refactor backlog and past extractions.  
> Distinguish **implemented (as of repo HEAD)** vs **planned**. When in doubt, verify in `src/` before coding.

## Implemented utilities (stable)

### GL validation (`src/common/utils/gl-validation.util.ts`)

- `validateGlLines`, `ensureBalanced`, `ensureSameCurrency`, debit/credit totals

### Number utils (`src/common/utils/number.util.ts`)

- `toNumber`, `toNumberStrict`, `roundTo`, `isApproximatelyEqual`

### Date utils (`src/common/utils/date.util.ts`)

- `toDate`, `toISOString`, `isValidDateString`

---

## GL account lookup (current code)

**Implemented in `GlService`** (`src/gl/services/gl.service.ts`), not a separate `GlAccountLookupService`.

`PostingService` delegates lookups to `GlService`, for example:

- `getLinkedCashGlAccountId(accountId, db?)`
- `getInvestmentBucketGlAccountId(userId, currency, db?)`
- `getFeeExpenseGlAccountId`, dividend / realized gain / loss / equity helpers

There is **no** `src/gl/services/gl-account-lookup.service.ts` in the repo. Older docs and a stale comment in `posting.service.ts` still mention `GlAccountLookupService`; treat those as drift.

---

## Position / FIFO source of truth (decision, 2026-06)

**Decision:** Position and FIFO lot math should **converge on the chronological replay engine**, not maintain two parallel semantics long term.

| Path | Location | Role today |
|------|----------|------------|
| **Replay (target SoT)** | `src/corporate-actions/position-replay.engine.ts` + `PositionReplayService` | Merge buy/sell txs + `CorporateAction` splits on one timeline; rebuild lots, matches, position; used by scope rebuild and `syncSplits` |
| **Incremental (legacy)** | `TransactionsService` create/update paths | Still updates position/lots inline on some buy/sell flows; overlaps replay semantics |

**Implication for upcoming refactor tasks:** Prefer `PositionReplayService.rebuildScope()` for affected account–asset scopes instead of patching incremental `PositionLot` updates (e.g. buy update without later sells).

`CorporateActionApplication` records that a replay ran for an account; it is **not** a skip gate and does not mean “open lots were directly split-adjusted.”

---

## Portfolio vs Dashboard metrics (different sources)

Numbers can legitimately differ. Do not assume one endpoint is “wrong” without checking which model it uses.

| Surface | Service | Primary inputs | What it approximates |
|---------|---------|----------------|----------------------|
| **Portfolio** | `PortfolioService` | `Position` / open lots, `Price`, `FxRate` | Holdings **market value** and cost basis in display currency |
| **Dashboard investment summary** | `DashboardService` | `GL` lines on investment bucket accounts, `deposit` / `withdraw` txs | **Ledger-based** invested balance and return vs net contributions |

Product/docs should name these explicitly before changing API behavior.

---

## Refactor backlog (from API data-flow review)

Suggested order; each item should become its own small task/PR.

### P1 — Buy update / PositionLot consistency

- **Issue:** `syncPositionOnUpdate` / `rollbackBuyPositionEffect` can update `Position` without matching `PositionLot` when no later sell triggers full scope rebuild.
- **Preferred fix:** Rebuild affected scope via `PositionReplayService.rebuildScope()` (aligns with replay SoT decision).
- **Alternative:** Patch incremental lot sync + regression test (only if explicitly choosing dual-path maintenance).

### P2 — Extract position/FIFO orchestration from `TransactionsService`

- Goal: `TransactionsService` = transaction write orchestration; position mutation details in focused services.
- Preserve `$transaction` + `Prisma.TransactionClient` boundaries; no repository-pattern rewrite in round one.

### P2 — Extract CSV import parser

- Move broker CSV parsing/mapping out of `TransactionsService` (`importTransactions`, header map, row validators).

### P2 — Portfolio / Dashboard naming & docs

- Document metric definitions; decide later whether API shapes change.

### P3 — `ScheduleModule.forRoot()` placement

- Today only `MarketPriceModule` calls `forRoot()`; `CorporateActionsModule` crons depend on it implicitly. Move `forRoot()` to `AppModule`.

### P3 — Portfolio service size

- `portfolio.service.ts` is large; consider splitting valuation / trend / rebalance later.

### P3 — This doc + sibling markdown drift

- Keep `REFACTORING.md`, `PROJECT_OVERVIEW.md`, `GL_ENDPOINTS_OVERVIEW.md` aligned with `GlService` and replay engine.

---

## Refactor task acceptance criteria (all code tasks)

Apply to every refactor sub-task, not only functional correctness:

1. **Readability:** Reduce deep nesting and oversized methods; prefer early returns and small named helpers.
2. **Boundaries:** One clear responsibility per service (no mixing CSV parsing, validation, position math, and GL posting in one layer).
3. **Transactions:** Keep existing Prisma transaction boundaries unless a task explicitly redesigns them.
4. **Regression tests:** Any change to Position / FIFO / sell GL repost must add or extend unit tests; run `pnpm exec jest --runInBand` before/after each step.
5. **Scope discipline:** Each task lists scope, non-scope, data-consistency risk, test plan, and readability checklist in its Notion card / PR.

---

## Historical note: utility extraction (completed)

The sections below describe an **earlier** refactor that moved validation/number/date helpers out of `PostingService`. GL lookups were consolidated into `GlService` afterward; they were **not** shipped as a standalone `GlAccountLookupService` file.

### What moved out of `PostingService`

- Validation → `gl-validation.util.ts`
- Number conversion → `number.util.ts`
- GL account discovery → **`GlService`** (not a separate lookup service file)

### Example (current style)

```typescript
import { validateGlLines, GlLineInput } from '../common/utils/gl-validation.util'
import { toNumber } from '../common/utils/number.util'
import { GlService } from './services/gl.service'

validateGlLines(lines)
const amount = toNumber(tx.amount)
const cashGlId = await this.glService.getLinkedCashGlAccountId(account.id, prisma)
```
