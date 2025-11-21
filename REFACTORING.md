# Code Refactoring: Utility Functions

## Overview
This document describes the refactoring of common utility functions into shared modules for better code organization, reusability, and maintainability.

## Refactored Components

### 1. GL Validation Utilities (`src/common/utils/gl-validation.util.ts`)

**Extracted Functions:**
- `ensureBalanced(lines)` - Validates that total debits equal total credits
- `ensureSameCurrency(lines)` - Validates all lines use the same currency
- `validateGlLines(lines)` - Convenience function that calls both validations
- `calculateTotalDebit(lines)` - Calculates total debit amount
- `calculateTotalCredit(lines)` - Calculates total credit amount

**Benefits:**
- Pure functions (no side effects)
- Reusable across different services
- Better testability
- Centralized validation logic

**Usage:**
```typescript
import { validateGlLines, GlLineInput } from '../common/utils/gl-validation.util'

const lines: GlLineInput[] = [...]
validateGlLines(lines) // Throws BadRequestException if invalid
```

### 2. Number Utilities (`src/common/utils/number.util.ts`)

**Extracted Functions:**
- `toNumber(value)` - Safely converts value to number (returns 0 for null/undefined/NaN)
- `toNumberStrict(value)` - Strict conversion (throws on invalid values)
- `roundTo(value, decimals)` - Rounds to specified decimal places
- `isApproximatelyEqual(a, b, epsilon)` - Checks if two numbers are approximately equal

**Benefits:**
- Consistent number handling across the codebase
- Prevents NaN propagation
- Better error handling

**Usage:**
```typescript
import { toNumber } from '../common/utils/number.util'

const amount = toNumber(tx.amount) // Safe conversion, returns 0 if invalid
```

### 3. Date Utilities (`src/common/utils/date.util.ts`)

**Extracted Functions:**
- `toDate(value)` - Converts date string or Date to Date object
- `toISOString(date)` - Formats date to ISO string
- `isValidDateString(value)` - Validates date string

**Benefits:**
- Consistent date handling
- Type safety
- Centralized date logic

**Usage:**
```typescript
import { toDate } from '../common/utils/date.util'

const date = toDate(tx.tradeTime) // Handles string or Date
```

### 4. GL Account Lookup Service (`src/gl/services/gl-account-lookup.service.ts`)

**Extracted Methods:**
- `getLinkedCashGlAccountId(accountId)` - Find GL account linked to account
- `getNamedGlAccountId(userId, nameContains)` - Find by name pattern
- `getInvestmentBucketGlAccountId(userId, currency)` - Find investment account
- `getFeeExpenseGlAccountId(userId)` - Find fee expense account
- `getDividendIncomeGlAccountId(userId)` - Find dividend income account
- `getRealizedGainIncomeGlAccountId(userId)` - Find realized gain account
- `getRealizedLossExpenseGlAccountId(userId)` - Find realized loss account
- `getEquityGlAccountId(userId)` - Find equity account
- `findByTypeAndName(...)` - Generic lookup method

**Benefits:**
- Centralized GL account discovery logic
- Easier to test and maintain
- Consistent error messages
- Can be reused by other services

**Usage:**
```typescript
constructor(private glAccountLookup: GlAccountLookupService) {}

const cashGlId = await this.glAccountLookup.getLinkedCashGlAccountId(accountId)
```

## Files Modified

### Updated Files:
1. **`src/gl/posting.service.ts`**
   - Removed private validation methods (`ensureBalanced`, `ensureSameCurrency`)
   - Removed private lookup methods (delegated to `GlAccountLookupService`)
   - Updated to use utility functions (`toNumber`, `validateGlLines`)
   - Updated type from `LineInput` to `GlLineInput` (exported type)

2. **`src/app.module.ts`**
   - Added `GlAccountLookupService` to providers

### New Files Created:
1. `src/common/utils/gl-validation.util.ts` - GL validation utilities
2. `src/common/utils/number.util.ts` - Number conversion utilities
3. `src/common/utils/date.util.ts` - Date handling utilities
4. `src/common/utils/index.ts` - Barrel export for utilities
5. `src/gl/services/gl-account-lookup.service.ts` - GL account lookup service

## Migration Guide

### Before:
```typescript
// In posting.service.ts
private ensureBalanced(lines: LineInput[]) {
  const debit = lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
  const credit = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  if (Math.abs(debit - credit) > 1e-6) {
    throw new BadRequestException(`Entry not balanced: debit=${debit}, credit=${credit}`)
  }
}

const amount = Number(tx.amount)
const cashGlId = await this.getLinkedCashGlAccountId(account.id)
```

### After:
```typescript
// Import utilities
import { validateGlLines, GlLineInput } from '../common/utils/gl-validation.util'
import { toNumber } from '../common/utils/number.util'
import { GlAccountLookupService } from './services/gl-account-lookup.service'

// Use utilities
validateGlLines(lines) // Instead of ensureBalanced + ensureSameCurrency
const amount = toNumber(tx.amount) // Instead of Number()
const cashGlId = await this.glAccountLookup.getLinkedCashGlAccountId(account.id)
```

## Benefits Summary

1. **Code Reusability**: Common functions can be used across multiple services
2. **Maintainability**: Changes to validation logic only need to be made in one place
3. **Testability**: Pure utility functions are easier to unit test
4. **Type Safety**: Shared types (`GlLineInput`) ensure consistency
5. **Separation of Concerns**: Business logic separated from utility functions
6. **Better Organization**: Related utilities grouped in logical modules

## Future Improvements

1. Consider extracting more common patterns:
   - Conflict checking (duplicate symbol validation)
   - Pagination utilities
   - Sorting utilities
   - Filter building utilities

2. Add unit tests for utility functions

3. Consider using Decimal.js for financial calculations instead of number

4. Add JSDoc comments for better IDE support

