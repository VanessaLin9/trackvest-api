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

There is **no** `src/gl/services/gl-account-lookup.service.ts` in the repo. Older markdown may still mention `GlAccountLookupService`; treat that as drift.

---

## Position / FIFO source of truth (decision, 2026-06)

**Decision:** Position and FIFO lot math should **converge on the chronological replay engine**, not maintain two parallel semantics long term.

| Layer | Location | Role today |
|-------|----------|------------|
| **Replay (SoT)** | `position-replay.engine.ts` + `PositionReplayService` | Chronological merge of buy/sell + splits; rebuild lots, matches, position |
| **Orchestration** | `TransactionPositionOrchestratorService` | Transaction side effects: incremental create paths, scope rebuild, sell GL repost |
| **Rebuild policy** | `TransactionRebuildPolicyService` | Centralizes when a mutation needs full scope replay vs incremental sell plan |
| **CRUD entry** | `TransactionsService` | Transaction write orchestration; delegates position work to orchestrator |

Buy update/delete/hardDelete high-risk paths now rebuild via `rebuildScope()` (P1). Some create paths still use incremental lot updates when policy allows.

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

## Refactor task status (P1–P7)

Last aligned with `main` after corp-actions replay merge and refactor PRs #20–#24.

| Task | Status | Outcome (verify in `src/`) |
|------|--------|----------------------------|
| **P1** Buy mutation replay fix | ✅ Completed | Buy update/delete/hardDelete rebuild scope via `PositionReplayService.rebuildScope()` |
| **P2** Transaction position orchestrator | ✅ Completed | `TransactionPositionOrchestratorService` owns position/FIFO side effects |
| **P3** Rebuild decision policy | ✅ Completed | `TransactionRebuildPolicyService` centralizes scope-replay vs incremental decisions |
| **P4** CSV import extraction | ✅ Completed | `TransactionImportService`; controller routes import |
| **P5** ScheduleModule ownership | ✅ Completed | `ScheduleModule.forRoot()` in `AppModule` (`app.module.ts`) |
| **P6** Refactor docs alignment | ✅ Completed | `REFACTORING.md`, `PROJECT_OVERVIEW.md`, `GL_ENDPOINTS_OVERVIEW.md` |
| **P7** Portfolio service split | ⏳ Pending | Split `portfolio.service.ts` (~1300 lines) by valuation/trend/rebalance |

### Completed (detail)

- **P1** — PR #20. Regression tests in `transactions.service.spec.ts` lock buy-mutation replay behavior.
- **P2** — PR #21. `TransactionsService` delegates to `TransactionPositionOrchestratorService`.
- **P3** — PR #22. `TransactionRebuildPolicyService` + `transaction-rebuild-policy.service.spec.ts`.
- **P4** — PR #23. `TransactionImportService` + `transaction-import.service.spec.ts`.
- **P5** — PR #24. `schedule-module-ownership.spec.ts` guards compile-time module wiring.
- **P6** — P1–P7 status table; backlog drift removed from sibling markdown.

### Remaining

- **P7** — Split `PortfolioService` without changing API response semantics.
- **Follow-up (not numbered)** — Portfolio vs Dashboard metric naming in product/API docs if behavior should change later.

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
