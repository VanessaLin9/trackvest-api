# trackvest-api

NestJS backend for Trackvest. It provides:

- accounts, assets, transactions, dashboard, and GL endpoints
- PostgreSQL via Prisma
- seeded demo data for local development
- automatic GL posting for supported investment flows

## Stack

- NestJS 11
- Prisma
- PostgreSQL 16
- TypeScript

## Local setup

1. Install dependencies

```bash
npm install
```

2. Start local services

```bash
npm run db:up
```

This starts:

- Postgres on `localhost:5433`
- Redis on `localhost:6379`

3. Prepare environment

The repo already includes `.env` for local development. The important values are:

```env
DATABASE_URL="postgresql://trackvest:trackvest@localhost:5433/trackvest?schema=public"
PORT=3000
JWT_SECRET="dev_dev_dev_change_me"
```

4. Apply schema and seed data

```bash
npx prisma migrate reset --force
```

If you only need to rerun seed:

```bash
npx prisma db seed
```

5. Start the API

```bash
npm run dev
```

API base URL:

- `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`

## Demo seed data

The local seed creates:

- demo user: `demo@trackvest.local`
- seeded accounts:
  - `Bank TWD`
  - `Broker TWD` with broker `cathay`
- seeded assets:
  - `2330` 台積電
  - `006208` 富邦台50
  - `2337` 旺宏
  - `3711` 日月光投控
  - `0050` 元大台灣50
- seeded GL accounts required by current flows

## Current API scope

Main modules in [src/app.module.ts](/Users/vanessa/develop/trackvest-api/src/app.module.ts):

- `accounts`
- `assets`
- `transactions`
- `dashboard`
- `gl`
- `users`
- `health`

Current investment behavior:

- `deposit`, `buy`, and `dividend` are supported for posting
- CSV import is limited to broker accounts with `broker = cathay`
- account-linked GL accounts are auto-created when needed
- transaction create/update/delete now keeps GL entries in sync

## Important constraints

- `sell` is intentionally disabled for now
  - reason: cost basis / realized P&L logic is not implemented safely yet
- CSV import supports Cathay-style exports only
- authentication is currently simplified for local dev via `X-User-Id`

## Useful commands

```bash
# watch mode
npm run dev

# one-shot start
npm run start

# build
npm run build

# start/stop local infra
npm run db:up
npm run db:down

# Prisma helpers
npx prisma studio
npx prisma migrate dev
npx prisma db seed
```

## Frontend pairing

Default local frontend is expected at:

- `http://localhost:5173`

The frontend sends `X-User-Id` on every request, using the configured demo user id.

## Known gaps

- no automated coverage yet for the investments/import/GL path
- `sell` and cost basis tracking still need a real position engine
- README reflects current local-dev assumptions, not production deployment
