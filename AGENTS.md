# AGENTS.md

# Trackvest API

Trackvest API is a NestJS / TypeScript backend using PostgreSQL and Prisma.
It is an investment tracking and double-entry accounting application.

When reviewing pull requests, prioritize correctness, data integrity,
security, and maintainability over stylistic preferences.

## Code Review Rules

### 1. Review only meaningful issues

- Focus on bugs, regressions, security problems, data-integrity risks,
  maintainability problems, and significant performance issues.
- Do not report formatting, quote style, semicolons, import ordering,
  or other issues already handled by ESLint or Prettier.
- Avoid subjective style comments unless the code meaningfully reduces
  readability or maintainability.
- Review primarily issues introduced or made worse by the PR.
- Prefer a small number of high-confidence comments over many speculative comments.

### 2. Correctness

- Check edge cases, null/undefined handling, empty collections, invalid state,
  and error paths.
- Flag logic whose behavior differs from the apparent API or business intent.
- Flag partial updates that can leave related records inconsistent.
- Check date/time ordering carefully where transaction chronology matters.
- Bug fixes should include a regression test when practical.

### 3. Financial and accounting integrity

- Monetary values, quantities, prices, fees, taxes, FX rates, and cost bases
  must preserve decimal precision.
- Flag unsafe conversion of Prisma Decimal values to JavaScript floating-point
  numbers when precision can affect financial results.
- Double-entry accounting operations must remain balanced:
  total debits must equal total credits.
- A business operation that updates a transaction, GL entries, positions,
  lots, or related financial records must not leave them mutually inconsistent.
- Financial calculations should have explicit and predictable rounding behavior
  when rounding is required.
- Do not silently discard financial data or replace missing values with zero
  unless zero is semantically correct.

### 4. Database consistency and Prisma

- Operations that must succeed or fail together should use an appropriate
  database transaction.
- Flag race conditions that could create duplicate or inconsistent financial data.
- Preserve idempotency for imports, synchronization jobs, retries,
  and external-data ingestion where applicable.
- Check uniqueness assumptions against the database schema instead of relying
  only on application-level checks.
- Flag obvious N+1 queries or unnecessary repeated database queries.
- Be cautious with cascade deletion where financial history may be affected.

### 5. Ownership and security

- User-owned resources must never be readable or writable by another user
  unless explicitly permitted by the authorization model.
- Every lookup, mutation, and nested-resource operation involving user data
  should preserve ownership validation.
- Do not trust user-supplied IDs as proof of ownership.
- Flag authentication or authorization bypasses.
- Flag secrets, tokens, passwords, credentials, or sensitive environment
  values committed to source code or logs.
- Passwords and authentication tokens must not be stored or logged in plaintext.

### 6. NestJS architecture

- Controllers should primarily handle HTTP concerns, validation, and delegation.
- Business logic should normally live in services rather than controllers.
- Avoid duplicating business rules across controllers or services.
- Validate externally supplied data through DTOs or equivalent validation.
- Errors exposed through the API should be intentional and should not leak
  sensitive implementation details.
- Avoid unnecessary coupling between feature modules.

### 7. Clean code and maintainability

Flag code when it introduces meaningful maintainability problems such as:

- A function or class with multiple unrelated responsibilities.
- Duplicated business logic that may diverge over time.
- Deeply nested or unnecessarily complex control flow.
- Hidden side effects.
- Misleading names that obscure business behavior.
- Catch-all error handling that suppresses important failures.
- Dead code or obsolete compatibility paths introduced by the PR.
- Large functions whose responsibilities can be clearly separated.
- Magic values representing financial or business rules without explanation.

Do not suggest refactoring merely to make code shorter.

### 8. Avoid overengineering

- Prefer the smallest clear implementation that solves the current requirement.
- Flag abstractions that add complexity without a concrete current use case.
- Avoid unnecessary factories, interfaces, wrappers, configuration layers,
  or generic frameworks.
- Prefer extending an existing pattern over creating a parallel architecture.
- Do not introduce a reusable abstraction until there is meaningful reuse
  or a clear architectural reason.

### 9. Tests

- Behavioral changes should include appropriate tests.
- Financial calculations should test representative values and edge cases.
- Accounting changes should verify debit/credit balance.
- Ownership-sensitive endpoints should test unauthorized cross-user access.
- Bug fixes should include regression coverage when practical.
- Tests should emphasize observable behavior rather than implementation details.

### 10. API compatibility

- Flag unintended breaking changes to existing request/response contracts.
- Be cautious when renaming DTO fields, changing enum semantics,
  changing default behavior, or changing validation requirements.
- Database migrations should preserve existing production data unless the
  destructive change is explicit and justified.

## Review Comment Style

When reporting an issue:

1. Explain the concrete problem.
2. Explain the condition under which it occurs.
3. Explain the likely consequence.
4. Suggest a direction for fixing it when useful.

Do not leave a comment solely to praise code or describe what the code does.