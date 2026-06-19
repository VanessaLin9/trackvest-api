# trackvest-api

`trackvest-api` is the backend for Trackvest's investment bookkeeping flows.

Today this repo serves two purposes:

- an internal/local HTTP API for development and debugging
- an MCP server surface for agent-facing read workflows

The long-term direction is not "public REST API for third-party consumers".
If there is one interface we expect to expose more intentionally, it is the MCP layer.

## Current status

Current implemented investment behavior:

- `deposit`, `withdraw`, `buy`, `sell`, `dividend`, and `fee` transactions exist in the domain
- `sell` now uses FIFO lots via `PositionLot` and `SellLotMatch`
- TW stock splits sync from FinMind, replay affected scopes chronologically, and repost sell GL
- transaction create/update/delete keeps GL entries in sync
- backdated buy/sell changes rebuild affected position scopes
- CSV import currently supports Cathay-style broker exports

Current MCP status:

- MCP server exists as a separate entrypoint from the HTTP API
- read-only tools currently implemented:
  - `list_accounts`
  - `search_transactions`
  - `get_position_detail`
  - `get_sell_fifo_detail`

## Repo shape

Main code lives under [src](src):

- [src/accounts](src/accounts)
- [src/assets](src/assets)
- [src/transactions](src/transactions)
- [src/dashboard](src/dashboard)
- [src/gl](src/gl)
- [src/mcp](src/mcp)

Entry points:

- HTTP API: [src/main.ts](src/main.ts)
- MCP server: [src/mcp-main.ts](src/mcp-main.ts)

## Local setup

1. Install dependencies

```bash
pnpm install
```

2. Start local infrastructure

```bash
pnpm db:up
```

This starts:

- Postgres on `localhost:5433`
- Redis on `localhost:6379`

3. Prepare database **local dev only**

This step destroys all data in the local Docker database and runs the dev seed.
Do **not** use it against production or production-like databases.
See [docs/deployment.md](docs/deployment.md) for production-safe migration policy.

```bash
npx prisma migrate reset --force
```

If you only need to reseed:

```bash
pnpm db:seed
```

4. Start the HTTP API

```bash
pnpm dev
```

5. Start the MCP server

```bash
pnpm mcp:dev
```

## Environment

The repo already includes a local `.env`.

Important values:

```env
DATABASE_URL="postgresql://trackvest:trackvest@localhost:5433/trackvest?schema=public"
PORT=3000
JWT_SECRET="dev_dev_dev_change_me"
```

MCP-specific local-dev value:

```env
MCP_DEFAULT_USER_ID="5f9b7d4a-69d4-4a78-98f4-bc82eeac1001"
```

If `MCP_DEFAULT_USER_ID` is not set, the MCP server currently falls back to the seeded demo user.

## Demo seed data

The local seed creates:

- demo user email: `demo@trackvest.local`
- demo user id: `5f9b7d4a-69d4-4a78-98f4-bc82eeac1001`
- seeded accounts:
  - `Bank TWD`
  - `Broker TWD` with broker `cathay`
  - `Broker USD` with broker `ib`
- seeded assets:
  - `2330` 台積電
  - `0050` 元大台灣50
  - `AAPL` Apple Inc.
  - `SGOV` iShares 0-3 Month Treasury Bond ETF
  - `006208` 富邦台50
  - `2337` 旺宏
  - `3711` 日月光投控
- seeded GL accounts required by current investment flows

Demo `0050` includes a split regression fixture (pre/post-split buys and sells). Fresh seed loads a **pre-split-sync** ledger baseline (50 open shares). Run corporate-action sync to replay splits and align holdings to **260 shares** — see [Corporate actions (TW splits)](#corporate-actions-tw-splits).

Seeded `Price` rows are **market snapshots** (valuation / trends). FinMind sync upserts `Price` when `FIN_MIND_TOKEN` is set; it does **not** change `Transaction` rows. Split sync rebuilds `Position`, lots, matches, and sell GL from the same transactions.

## Corporate actions (TW splits)

FinMind `TaiwanStockSplitPrice` feeds `CorporateAction` rows. Sync upserts split events, replays every affected account–asset scope that has buy/sell history, records `CorporateActionApplication` markers, and reposts sell GL from rebuilt `SellLotMatch` cost basis.

Requires `FIN_MIND_TOKEN` in `.env` (same token as market-price sync).

CLI:

```bash
# all TW ever-held assets, default 5y lookback through today
pnpm corp-actions:sync-splits tw

# optional window
pnpm corp-actions:sync-splits tw 2025-06-01 2025-07-31
```

Admin HTTP (admin role): `POST /corp-actions/sync/splits`

Scheduled crons: TW weekdays 18:00 Taipei; US placeholder weekdays 18:30 New York.

### 0050 acceptance (local)

After reset/seed, sync the demo split and verify holdings:

```bash
pnpm db:seed
pnpm corp-actions:sync-splits tw 2025-06-01 2025-07-31
pnpm corp-actions:verify-0050
```

Expected: **260** open `0050` shares on demo `Broker TWD`, avgCost ~**47** TWD, with a `CorporateAction` row for the 2025-06-18 1:4 split. `Transaction` quantities stay 100/50/80/40/20.

Unit tests for replay engine:

```bash
pnpm exec jest src/corporate-actions --runInBand
```

## Market prices (FinMind)

Optional env (see `.env.example`):

```env
FIN_MIND_TOKEN=
BACKFILL_MAX_ASSETS_PER_RUN=10
```

```bash
pnpm finmind:smoke
# Taiwan (TWD ever-held)
pnpm prices:sync-tw -- --mode=daily
pnpm prices:sync-tw -- --mode=backfill
# US (USD ever-held)
pnpm prices:sync-us -- --mode=daily
pnpm prices:sync-us -- --mode=backfill
```

Admin HTTP (admin role): `POST /prices/sync/taiwan`, `POST /prices/sync/us`.

Portfolio valuation uses `Close` for US symbols; `adjClose` is stored for future trend/split work.

## HTTP API

The HTTP API is still useful for:

- local frontend development
- Swagger inspection
- manual debugging
- integration/e2e testing

Base URL:

- `http://localhost:3000`

Swagger:

- `http://localhost:3000/docs`

Authentication is still simplified for local development:

- controllers read `X-User-Id`
- there is no final user auth flow yet

This is a development convenience, not the intended long-term agent auth model.

## MCP server

The MCP server uses the same Prisma models and the same Postgres database as the HTTP API.
It is not a separate data store.

Current transport:

- stdio

Current shape:

- separate Nest application context
- separate MCP module
- shared domain/services underneath

See [docs/mcp.md](docs/mcp.md) for:

- architecture
- tool catalog
- local usage
- planned auth direction

## Validation and testing

There is no `pnpm test` script yet. Run Jest directly.

Build:

```bash
pnpm build
```

All unit tests:

```bash
npx jest --runInBand
```

Market price module only (FinMind sync):

```bash
npx jest src/market-price --runInBand
```

Corporate actions / split replay:

```bash
npx jest src/corporate-actions --runInBand
```

HTTP e2e tests:

```bash
npx jest --config ./test/jest-e2e.json --runInBand
```

## Documentation map

Canonical docs right now:

- [README.md](README.md)
- [docs/deployment.md](docs/deployment.md) — migration policy, forbidden commands, production-like rehearsal
- [docs/mcp.md](docs/mcp.md)

- [REFACTORING.md](REFACTORING.md) — refactor backlog, replay-engine decisions, Portfolio vs Dashboard metrics

There are also older root-level markdown files such as [FEATURES.md](FEATURES.md) and [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md). Prefer **README.md** + **REFACTORING.md** for current direction; update other files when touched, do not assume they are complete.

## Known gaps

- final user auth flow is not implemented yet
- MCP still uses a local-dev owner user scope instead of real agent credentials
- MCP currently focuses on read-only investment queries
- CSV import is still broker-format specific
- documentation is now being rewritten around the MCP-first direction
