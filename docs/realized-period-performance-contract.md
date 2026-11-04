# Realized period performance

Notion spec: https://app.notion.com/p/40edf30cc71c8118b923fcde2540f202

Read-only reports for the performance page. They answer, for one Taipei year or month: how much was realized, which assets contributed, and which sells make up one asset. Cookie auth is required. These routes do not replay positions, write ledger rows, or call quotes or FX.

## Routes

| Method and path                               | Query                                                                                     | Response                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `GET /portfolio/performance/realized/periods` | `year` required, `accountId` optional                                                     | Year summary and Taipei months, grouped by account currency |
| `GET /portfolio/performance/realized/assets`  | `year` and `currency` required; `month`, `accountId`, `skip`, `take` optional             | Asset contribution for that currency and period             |
| `GET /portfolio/performance/realized/trades`  | `year`, `currency`, and `assetId` required; `month`, `accountId`, `skip`, `take` optional | One row per sell                                            |

`skip` defaults to 0. `take` defaults to 20 and must be 1–100. `year` is 1900 through the current Taipei year. A later year, or a month that has not started, is 400. An unknown but supported currency or asset id with no matching sells is an empty 200, not a 404. A foreign `accountId` is 403 for every role, including admin. No session is 401.

`currency` is the account currency (`TWD`, `USD`, `JPY`, `EUR`), normalized to uppercase. Same-currency accounts are merged. Currencies are never added together and are not converted to a display currency.

## Window

`timeZone` is `Asia/Taipei` (UTC+8, no daylight saving). A trade at `2025-12-31T15:59:59.999Z` is December 2025. `2025-12-31T16:00:00.000Z` is January 2026. The selected window is inclusive at `periodStart` and exclusive at `periodEndExclusive`. That end stays on the calendar boundary.

`asOf` equals `generatedAt` when the selected year or month is still open, and is null after it has ended. Trades with `tradeTime` later than `generatedAt` are left out. The current year lists months 1 through the current Taipei month only. Future months are omitted rather than returned as zero. A closed year lists months 1–12, including real zeros.

A currency group exists only after that currency has an active buy or sell on or before `generatedAt`, and only for a year on or after that first trade. Dividends do not open a group. A year inside the history with no sells is zero, not null.

## Money

`netProceeds` is the sum of active sell `amount`. Fee and tax are already inside that amount and are also returned on each trade for reconciliation. Cost is `SellLotMatch.quantity * unitCost`, including matches created before the selected period and matches restated by a split or cash-in-lieu. The report does not apply a split ratio again, and it does not read lots, positions, quotes, or GL balances.

Values are `Decimal` until the final half-up rounding to at most 8 fractional places. Counts, year, month, and page fields are numbers. Null quantity or price stays null.

If any sell in a scope is missing a match, or the matched quantity differs from the sell quantity, that sell and its asset, month, and year totals use `disposedCost: null`, `realizedNetPnl: null`, and `issues: ["MISSING_FIFO"]`. `sellCount` and `netProceeds` remain. Other assets and months stay filled. A paged response still uses the whole period for `summary` and `total`.

Displayed month or row strings can disagree with the displayed total at the last decimal place, because each value is rounded after its own sum. Reconcile with the unrounded sums. This report does not invent a rounding adjustment.

## Compatibility with annual realized

For a closed year, with no trade after `generatedAt`, a currency summary matches `GET /portfolio/performance/annual-realized` for that year and currency. The existing annual route still includes a current-year sell dated after its own `generatedAt`. These new routes leave that sell out and do not change the annual route. Aligning that older inclusion is a separate change.

## Sort and pages

Assets sort by `symbol`, then `assetId`, ascending by UTF-16 code unit. Trades sort by `tradeTime` descending, then `transactionId` ascending. `summary` and `total` ignore `skip` and `take`.

## Fixtures

[realized-period-performance.fixtures.json](fixtures/realized-period-performance.fixtures.json) is synthetic. The `chain` case has sells in March and April 2024, two symbols in March, and 22 TWD sells of `AAA` so page 2 starts at `skip=20`. `missing_fifo` and `dividends_only` cover null cost and an empty history. Do not treat the fixture as a user's books.
