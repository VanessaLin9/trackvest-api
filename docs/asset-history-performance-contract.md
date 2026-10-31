# Asset history performance — CP0 contract

Notion spec: https://app.notion.com/p/408df30cc71c812ea5d1d85d154d3492

## Delivery status

CP1 registers `GET /portfolio/performance/assets` and fills the CP0 schema from
persisted lots, sell matches, positions, dividends, and non-seed quotes. The
handler is read-only. Web live integration still waits for this checkpoint's
REVIEW_PASSED; until then, frontend mocks stay on the CP0 fixtures. Do not treat
those fixtures as the user's real data.

The backend and frontend have separate branches/PRs. Frontend mocks can keep using
the approved CP0 fixtures until this checkpoint is review-passed. Integrating the
live route does not require mutating a personal database.

## Request and response

`GET /portfolio/performance/assets?accountId=<optional UUID>`.
Cookie authentication is required. Omit accountId for the signed-in user's own
accounts; a supplied accountId must be owned by that same user, including admins.
An invalid UUID is 400, a missing session is 401, and foreign/nonexistent account
scopes are 403. There is no server-side search, pagination, as-of, or FX query.

The response is `{ generatedAt, items }`. Schemas exported in `openapi.json`:

- `GetPortfolioAssetPerformanceDto`
- `PortfolioAssetPerformanceResponseDto`
- `PortfolioAssetPerformanceItemResponseDto`
- `PortfolioAssetPerformanceStatus`
- `PortfolioAssetPerformanceIssue`

All item fields are required, including nullable ones. Monetary values, prices,
and quantities are decimal **strings**, with at most eight fractional digits.
Calculations use Decimal and round half up only after aggregation. They must
never use exponential notation or coerce missing data to zero. Counts are integers.
Timestamps are UTC ISO date-times; the frontend formats them for display.

Each row is unique by `(assetId, currency)`, where currency is the **account's
original currency**. The same asset across same-currency accounts is aggregated;
different currencies stay separate. Rows sort lexically by symbol, currency,
assetId, independently of localized display order. Never sum currencies together.
All quantities are in shares, including fractional shares.

## Calculation rules for CP1

- `realizedNetPnl`: sum of active sell `amount` (net proceeds) minus
  `SellLotMatch.quantity * unitCost`. Buy fees are already in lot cost and sell
  fees/tax are already deducted from net proceeds; do not deduct them again.
- `quantity` / `remainingCost`: remaining valid lots, checked against Position.
  Reuse persisted split/FIFO semantics, without replaying or writing data in GET.
- `unrealizedPnl`: quantity times usable quote minus remaining cost. A quote must
  be non-seed and in the row currency. A consistent closed row has zero quantity,
  remaining cost, and unrealized P&L without needing a quote.
- `tradeNetPnl`: realized net P&L plus unrealized P&L, **excluding dividends**.
- `recordedDividendAmount`: sum of recorded active dividend amounts using their
  existing net cash semantics. No records means null, with count zero; the UI
  says “not recorded,” never “actual dividends were zero.”
- `firstBuyAt` / `lastTradeAt`: first active buy and last active buy/sell.
  Dividends do not move lastTradeAt. Exclude soft-deleted trades from all values.

## Missing-data rules

Issues are unique and ordered as declared by `PortfolioAssetPerformanceIssue`.
One row's unavailable values must not hide other valid rows.

| Issue | Values unavailable | Values that may remain available |
| --- | --- | --- |
| `MISSING_FIFO` | realizedNetPnl, tradeNetPnl | Consistent remaining quantity/cost and unrealized P&L |
| `MISSING_PRICE` | latestPrice, priceAsOf, priceSource, unrealizedPnl, tradeNetPnl | Realized P&L, quantity and remaining cost |
| `CURRENCY_MISMATCH` | latestPrice, priceAsOf, priceSource, unrealizedPnl, tradeNetPnl | Realized P&L and remaining cost in account currency |
| `INCONSISTENT_LOTS` | remainingCost, realizedNetPnl, unrealizedPnl, tradeNetPnl | Recorded lot quantity (with issue), quote metadata and dividend records |

A missing or invalid quote and an explicitly different quote currency are distinct
issues; do not add MISSING_PRICE solely because CURRENCY_MISMATCH suppresses the
quote. The API never exposes a quote in a different currency without a currency
field. For this version it suppresses that quote instead. A consistent closed row
does not receive MISSING_PRICE merely because it has no quote.

Do not read gross realized GL accounts as net P&L, substitute today's average
cost for disposed FIFO cost, or reuse the old holdings snapshot's cost-as-market-
value fallback. Reads must use one consistent DB snapshot and bounded batch
queries, with no provider calls or N+1 queries.

## Frontend handoff

Use [asset-history-performance.fixtures.json](fixtures/asset-history-performance.fixtures.json)
as mock JSON. Its `scenarios` values are complete responses; metadata describes
the future endpoint, not its current availability. Fixtures contain synthetic data.

Generate schemas with the existing `pnpm openapi:types` command in trackvest-web
after selecting the approved API contract. Use `ApiSchemas` aliases, not parallel
handwritten response types. Keep generatedAt distinct from priceAsOf.

Homepage card and `/performance` share data and presentation, with native-currency
groups, all/holding/closed filters, search and 20-row client pagination. Label
tradeNetPnl as trading P&L excluding dividends. No recorded dividends shows “not
recorded”; financial nulls show an unavailable-data explanation, not zero. Errors,
empty states and loading must not block other Dashboard cards.

CP1 implements this read API only. It does not add annual results, card
customization, frontend changes, or query invalidation. Live web integration
waits for CP1 approval.
