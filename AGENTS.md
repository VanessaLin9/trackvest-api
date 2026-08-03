# Trackvest API agent guidance

This file is the durable repository contract for coding and review agents. Read it before
planning, editing, or reviewing changes in this repository.

## Sources of truth

Use sources in this order:

1. The current PR title, body, and checked-in task-specific documentation.
2. This `AGENTS.md`.
3. Existing code, tests, Prisma schema/migrations, `README.md`, and `docs/`.
4. External task links such as Notion only when their contents are actually available.

Do not invent requirements from an inaccessible Notion link. A PR must carry enough context
to review independently: goal, scope, non-goals, Acceptance Criteria, and verification results.
If material behavior is ambiguous, report the missing contract instead of guessing.

Explicit user instructions override this file. More deeply nested `AGENTS.md` files override
this file for their subtree.

## Repository context

Trackvest is an investment-bookkeeping backend built with NestJS, Prisma, PostgreSQL, and
Jest. High-risk domains include:

- transaction create/update/delete and import
- FIFO positions, lots, and sell-lot matches
- general-ledger posting and reposting
- corporate-action replay
- portfolio valuation, market prices, and FX conversion
- authentication, authorization, and ownership boundaries
- database migrations, bootstrap, and seed safety
- scheduled jobs and external providers such as FinMind

Changes in these areas require behavioral tests for both the happy path and important failure
paths. Financial or ownership invariants take precedence over implementation convenience.

## General implementation rules

- Keep each PR small, coherent, and tied to one task. Split unrelated backend, frontend,
  schema, seed, cron, catalog, deployment, or refactor work into separate PRs.
- Preserve existing behavior outside the stated scope. Do not perform opportunistic refactors.
- Prefer readable control flow and domain-specific names over clever abstractions.
- Keep controllers, schedulers, and orchestration services thin. Put validation, parsing,
  policy, and domain logic in focused modules.
- Use typed inputs and outputs. Validate external or user-controlled data at the boundary.
- Treat network services and scheduled dependencies as unreliable. Define failure, fallback,
  logging, and partial-success behavior explicitly.
- Never expose secrets, provider payloads, tokens, internal URLs, or raw exceptions to clients.
- Do not silently broaden validation, authorization, data ownership, or destructive behavior.
- Do not mix a production fix with unrelated formatting or documentation churn.

## Task and PR contract

Every implementation PR should include:

- `Background` or problem statement
- `Goal`
- `In Scope`
- `Non-goals`
- `Acceptance Criteria` using Markdown checkboxes
- test commands and actual results
- manual verification that remains outstanding
- migration, deployment, or rollout notes when applicable

The exact heading must be `Acceptance Criteria`, and each independently verifiable condition
must be a checkbox:

```md
## Acceptance Criteria

- [ ] Observable behavior one
- [ ] Observable behavior two
```

Implementers must check applicable items before requesting review. A checked box is a claim,
not proof: reviewers must independently verify it from the diff, tests, or recorded manual
evidence. Do not mark an item complete when its required environment or manual flow was not run.

## Test expectations

Prefer test-first changes when practical. Tests must be offline, deterministic, repeatable,
and focused on behavior. Mock external APIs; do not call FinMind or other live services in unit
or CI tests.

Use the narrowest relevant command first, then broaden verification in proportion to risk:

```bash
npx jest <changed-specs-or-directories> --runInBand
npx jest --runInBand
pnpm build
npx eslint <changed-ts-files>
git diff --check <base>...<head>
```

There is currently no generic `pnpm test` script. Use Jest directly. Run e2e or deployment
tests when the change affects their contract and the required isolated database is available:

```bash
pnpm test:e2e
pnpm test:deployment
```

Do not claim a command passed unless it was actually run against the reviewed SHA. When a
required environment is unavailable, state exactly what was not run and treat the missing
verification as residual risk or a blocker according to the task.

## Database and deployment safety

- Never run destructive database commands during review.
- Do not run `prisma migrate reset`, `prisma db push`, `pnpm db:seed`, or
  `pnpm db:seed:dev` against production or production-like databases.
- Schema changes require a committed migration. Review both `schema.prisma` and generated SQL.
- Migrations must preserve existing data or explicitly document and verify the transformation.
- Keep dev seed, production bootstrap, and production-demo seed semantics separate.
- Do not treat a new migration as a substitute for resolving failed or divergent migration
  history. Follow `docs/deployment.md`.

## Domain review invariants

Review affected invariants, not only changed lines.

### Transactions, FIFO, and GL

- Account/user ownership is enforced on every read and write path.
- Transaction mutation keeps positions, lots, matches, and GL entries consistent.
- Backdated changes rebuild the correct affected scope chronologically.
- Sell quantity and cost basis use the intended FIFO lots without double consumption.
- Failure does not leave partial financial state unless the contract explicitly permits it.

### Imports

- Preview is non-writing and uses the same business rules as commit.
- Safe commit remains atomic when required by the task.
- Duplicate/idempotency behavior is consistent between preview and commit.
- Raw broker values, normalization, aliases, and conflict behavior round-trip consistently.
- Row-level, batch-level, and persistence failures are distinguished correctly.

### Prices, FX, corporate actions, and schedules

- Market and currency timezone/date boundaries are explicit and tested.
- Weekend, holiday, empty-provider, timeout, and provider-error behavior is defined.
- A failure in one optional market/provider does not suppress valid results from another unless
  fail-closed behavior is an explicit requirement.
- Scheduled handlers respect deployment gates; manual endpoints do not accidentally depend on
  cron enablement.
- Replay and price sync remain idempotent and do not rewrite unrelated transactions.

### Authentication and API contracts

- Unauthenticated, regular-user, admin, and cross-user cases are covered where relevant.
- Removing `@Roles`, adding `@Public`, or widening query scope is a security-sensitive change.
- DTO transformation, validation, status codes, and error response shapes match the documented
  client contract.
- Partial-success responses preserve successful work and sanitize internal errors.

## Pull request review workflow

When asked to review a PR, act as an independent senior reviewer. Do not edit code unless the
request explicitly asks you to implement fixes.

1. Resolve the exact base SHA and head SHA. Review the requested range, not an assumed branch.
2. Read the PR title, body, commit list, linked issue text available in GitHub, prior reviews,
   unresolved comments, and check status.
3. Extract the stated goal, in-scope work, non-goals, Acceptance Criteria, and claimed tests.
4. Inspect the full diff and relevant callers, consumers, tests, schema, migrations, and docs.
5. Trace important flows end to end. Do not infer correctness from a DTO or unit test alone.
6. Run focused verification against the head SHA, then broader checks according to risk.
7. Check `git diff --check` and confirm unrelated files are absent.
8. Reconcile every Acceptance Criteria checkbox with evidence.
9. Submit findings first. If none exist, explicitly state that there are no actionable findings.

Do not approve based solely on green CI, author-provided summaries, or checked boxes. CI is
evidence, not a replacement for reviewing behavior and failure modes.

## Finding standard

Report only actionable issues introduced or exposed by the PR. Each finding must contain:

- priority tag and short title
- precise file and tight line range
- concrete triggering scenario or input
- user, data, security, or operational impact
- concise fix direction when it helps

Use these priorities:

- **P0**: immediate catastrophic impact, such as data loss, credential exposure, or a broadly
  exploitable production failure. Block merge.
- **P1**: high-impact correctness, security, financial, ownership, or migration bug likely to
  affect normal use. Block merge.
- **P2**: real behavioral defect, missing required failure handling, material regression risk,
  or missing test that leaves a required contract unverified. Request changes before merge.
- **P3**: low-impact improvement with a concrete maintenance or edge-case benefit. Non-blocking
  unless the task explicitly requires it.

One finding should describe one problem. Avoid vague statements, speculative risks without a
reachable scenario, restating the diff, and preference-only style comments. Do not inflate
priority merely because a file is important.

Use a concise format:

```text
[P2] Short imperative title

When <scenario>, <current behavior> causes <impact>. <Evidence and fix direction>.
```

If any P0-P2 finding remains, do not report the PR as passed. If there are only P3 suggestions,
make their non-blocking status explicit.

## Review completion format

Lead with findings ordered P0 to P3. Then include:

- reviewed head SHA
- verification commands and results
- Acceptance Criteria status
- residual risks or manual checks not performed
- final decision: `CHANGES_REQUESTED` or `REVIEW_PASSED`

When there are no actionable findings, use this shape:

```text
REVIEW_PASSED sha=<full-sha>

No actionable findings.

Verification:
- <command> -> <result>

Acceptance Criteria:
- <verified count>/<total count>; <manual items still pending, if any>

Residual risk:
- <anything not verified, or "None identified">
```

Never mark manual verification complete merely because automated tests pass. Never claim review
of a newer SHA using results from an older SHA.

## CLI and machine-readable output

When a CLI, pipe, shell wrapper, or process consumes stdout:

- keep stdout purely machine-readable
- send prompts, progress, warnings, and diagnostics to stderr
- handle producer failure, empty output, malformed output, spaces, and non-ASCII input
- test both parsed payloads and stdout/stderr separation

## Reviewer non-goals

- Do not implement fixes during a review-only request.
- Do not merge, push, dismiss comments, or change PR metadata unless explicitly authorized.
- Do not demand unrelated cleanup as a condition of approval.
- Do not expand a small task into production hardening that belongs in a documented follow-up.
- Do not expose secrets or paste sensitive logs into GitHub comments.
