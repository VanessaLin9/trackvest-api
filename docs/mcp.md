# MCP in trackvest-api

This document explains how MCP is structured in this repo and what the current read-only server supports.

## Why MCP exists here

This backend already has HTTP controllers, but those controllers were designed for app/frontend flows.
They are not the best direct interface for agents.

The MCP layer exists to provide:

- task-oriented tools
- agent-friendly output
- a narrower and safer read surface
- a path toward agent-specific auth later

In other words:

- HTTP is still useful for local development and debugging
- MCP is the interface we expect to shape more intentionally for agents

## Architecture

There are two entrypoints in this repo:

- HTTP API: [src/main.ts](/Users/vanessa/develop/trackvest-api/src/main.ts)
- MCP server: [src/mcp-main.ts](/Users/vanessa/develop/trackvest-api/src/mcp-main.ts)

The MCP server is not bolted onto the existing HTTP bootstrap.
It has its own Nest application context and module:

- [src/mcp/mcp.module.ts](/Users/vanessa/develop/trackvest-api/src/mcp/mcp.module.ts)
- [src/mcp/mcp.server.ts](/Users/vanessa/develop/trackvest-api/src/mcp/mcp.server.ts)

This gives us:

- separate transport concerns
- cleaner startup and debugging
- easier future auth isolation
- shared domain logic underneath

The stack shape is:

`Agent -> MCP tool -> MCP query/service layer -> existing services / Prisma -> Postgres`

## Same database as HTTP

The MCP server uses the same Prisma client and the same `DATABASE_URL` as the HTTP API.

It is intended to read from the same local Docker Postgres instance:

- `postgresql://trackvest:trackvest@localhost:5433/trackvest?schema=public`

So:

- HTTP and MCP should see the same accounts, transactions, lots, matches, and GL data
- MCP is not a sync copy or shadow datastore

## Current local auth model

Current MCP auth is still development-only.

Right now:

- the MCP server resolves an owner user id from `MCP_DEFAULT_USER_ID`
- if missing, it falls back to the seeded demo user id

This is only a temporary local-dev model.

Planned direction:

- agent calls MCP with an agent token
- MCP resolves the token to an owner user
- tool handlers do not accept arbitrary `userId`
- data scope is derived from the token, not from tool input

## Current tools

### `list_accounts`

Purpose:

- list the owner user's accounts

Supports:

- optional `type`
- optional `currency`

Backed by:

- [AccountsService](/Users/vanessa/develop/trackvest-api/src/accounts/accounts.service.ts)

### `search_transactions`

Purpose:

- search transactions by account, asset, date range, soft-delete visibility, and pagination

Supports:

- `accountId?`
- `assetId?`
- `includeDeleted?`
- `from?`
- `to?`
- `skip?`
- `take?`

Backed by:

- [TransactionsService.findAll()](/Users/vanessa/develop/trackvest-api/src/transactions/transactions.service.ts#L1092)

### `get_position_detail`

Purpose:

- show the current position snapshot for one `accountId + assetId`
- expose open lots and recent sell history in an agent-friendly shape

Returns:

- account
- asset
- current position snapshot
- open lots
- recent sells and their FIFO matches

Backed by:

- [PortfolioQueryService.getPositionDetail()](/Users/vanessa/develop/trackvest-api/src/mcp/services/portfolio-query.service.ts)

### `get_sell_fifo_detail`

Purpose:

- explain a single sell transaction in FIFO terms

Returns:

- sell transaction
- account and asset
- matched buy lots
- matched source buy transactions
- gross proceeds
- net proceeds
- total cost basis
- fee and tax
- realized P&L

Backed by:

- [PortfolioQueryService.getSellFifoDetail()](/Users/vanessa/develop/trackvest-api/src/mcp/services/portfolio-query.service.ts)

## MCP-specific query layer

The first MCP-specific query layer lives under:

- [src/mcp/services](/Users/vanessa/develop/trackvest-api/src/mcp/services)

Right now that means:

- [portfolio-query.service.ts](/Users/vanessa/develop/trackvest-api/src/mcp/services/portfolio-query.service.ts)

This is intentional.

We do not want to:

- expose raw Prisma structures directly to agents
- force agents to reconstruct portfolio state from low-level HTTP responses
- route MCP through controllers just because controllers already exist

The MCP query layer is where we shape read models for agents.

## Running locally

Start infrastructure:

```bash
pnpm db:up
```

Seed if needed:

```bash
npx prisma migrate reset --force
```

Start MCP:

```bash
pnpm mcp:dev
```

For a one-shot run:

```bash
pnpm mcp:start
```

## Notes about local verification

Because MCP uses the same local Postgres as the HTTP API, local verification depends on the Docker database being up.

If MCP startup fails with a Prisma connection error, first check:

```bash
docker compose ps db
```

The expected mapping is:

- host `localhost:5433`
- container `5432`

## Design rules for future tools

When adding new MCP tools, prefer these rules:

- task-oriented names, not table-oriented names
- no free-form `userId` inputs
- ISO strings for dates
- numbers instead of raw Prisma Decimal values
- outputs that can be chained by an agent without extra interpretation

Good examples:

- `get_position_detail`
- `get_sell_fifo_detail`
- `get_dashboard_summary`

Less ideal examples:

- `get_position_lot_rows`
- `query_sell_lot_match_table`

## What not to expose directly

We should not directly expose write access to:

- `PositionLot`
- `SellLotMatch`
- `GlEntry`

Those are domain side effects, not top-level agent resources.

If we later add write tools, they should be higher-level actions such as:

- `create_transaction`
- `update_transaction`
- `import_transactions_preview`

## Recommended next additions

If we continue the read-only track, the next likely tools are:

- `get_dashboard_summary`
- `get_dashboard_activity`
- `list_gl_accounts`
- `list_gl_entries`

After that, we can decide whether to:

- improve local MCP docs and testing
- add agent credential auth
- introduce limited write tools
