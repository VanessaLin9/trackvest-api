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

Main code lives under [src](/Users/vanessa/develop/trackvest-api/src):

- [src/accounts](/Users/vanessa/develop/trackvest-api/src/accounts)
- [src/assets](/Users/vanessa/develop/trackvest-api/src/assets)
- [src/transactions](/Users/vanessa/develop/trackvest-api/src/transactions)
- [src/dashboard](/Users/vanessa/develop/trackvest-api/src/dashboard)
- [src/gl](/Users/vanessa/develop/trackvest-api/src/gl)
- [src/mcp](/Users/vanessa/develop/trackvest-api/src/mcp)

Entry points:

- HTTP API: [src/main.ts](/Users/vanessa/develop/trackvest-api/src/main.ts)
- MCP server: [src/mcp-main.ts](/Users/vanessa/develop/trackvest-api/src/mcp-main.ts)

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

3. Prepare database

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
- seeded assets:
  - `2330` 台積電
  - `0050` 元大台灣50
  - `006208` 富邦台50
  - `2337` 旺宏
  - `3711` 日月光投控
- seeded GL accounts required by current investment flows

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

See [docs/mcp.md](/Users/vanessa/develop/trackvest-api/docs/mcp.md) for:

- architecture
- tool catalog
- local usage
- planned auth direction

## Validation and testing

Build:

```bash
pnpm build
```

Unit tests:

```bash
npx jest --runInBand
```

HTTP e2e tests:

```bash
npx jest --config ./test/jest-e2e.json --runInBand
```

## Documentation map

Canonical docs right now:

- [README.md](/Users/vanessa/develop/trackvest-api/README.md)
- [docs/mcp.md](/Users/vanessa/develop/trackvest-api/docs/mcp.md)

There are also older root-level markdown files such as [FEATURES.md](/Users/vanessa/develop/trackvest-api/FEATURES.md) and [PROJECT_OVERVIEW.md](/Users/vanessa/develop/trackvest-api/PROJECT_OVERVIEW.md). Treat those as historical notes unless they are updated; they are not the current source of truth.

## Known gaps

- final user auth flow is not implemented yet
- MCP still uses a local-dev owner user scope instead of real agent credentials
- MCP currently focuses on read-only investment queries
- CSV import is still broker-format specific
- documentation is now being rewritten around the MCP-first direction
