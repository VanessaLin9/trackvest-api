# Trackvest API - Complete Project Overview

## 🎯 What is Trackvest?

**Trackvest** is an **investment bookkeeping system** with **double-entry accounting** capabilities. It's designed to help users:
- Track investment transactions (buy, sell, dividends, fees)
- Manage multiple accounts (broker, bank, cash)
- Maintain proper accounting records with automatic GL ledger posting
- Organize assets in a global catalog

Think of it as a **personal finance + investment tracking + accounting system** all in one.

---

## 🏗️ Architecture Overview

### Tech Stack
- **Framework**: NestJS (Node.js, TypeScript)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Validation**: class-validator, class-transformer
- **API Docs**: Swagger/OpenAPI (available at `/docs`)
- **Security**: bcrypt for password hashing

### Project Structure
```
trackvest-api/
├── src/
│   ├── accounts/          # Account management (broker/bank/cash)
│   ├── assets/            # Asset catalog (stocks, ETFs, crypto)
│   ├── transactions/       # Transaction recording & management
│   ├── corporate-actions/  # Stock splits: sync, chronological replay
│   ├── portfolio/          # Holdings valuation, trend, rebalance
│   ├── dashboard/          # Summary metrics (GL-based investment view)
│   ├── market-price/       # FinMind price + split event providers
│   ├── gl/                # General Ledger (double-entry accounting)
│   ├── users/             # User management
│   ├── health/            # Health check endpoint
│   ├── common/            # Shared utilities & services
│   │   ├── decorators/    # Custom decorators (@CurrentUser)
│   ├── services/          # Shared services (OwnershipService)
│   └── utils/             # Utility functions
├── prisma/
│   └── schema.prisma      # Database schema
└── docs/                  # Documentation files
```

---

## 📊 Core Data Models

### 1. **User** (Users)
- Email, password hash, role (admin/user)
- Owns: Accounts, Tags, GL Accounts, GL Entries

### 2. **Account** (Financial Accounts)
- Types: `broker`, `bank`, `cash`
- Currencies: TWD, USD, JPY, EUR
- Links to GL Account for accounting

### 3. **Asset** (Global Catalog)
- Symbol (unique), name, type (equity/ETF/crypto/cash)
- Base currency
- Shared across all users

### 4. **Transaction** (Investment Transactions)
- Types: `buy`, `sell`, `deposit`, `withdraw`, `dividend`, `fee`
- Amount, quantity, price, fee
- Links to Account and Asset
- **Auto-posts to GL Ledger**

### 5. **GL Account** (Chart of Accounts)
- Types: `asset`, `liability`, `equity`, `income`, `expense`
- User-specific (each user has their own chart)
- Can link to regular Account

### 6. **GL Entry** (Journal Entries)
- Date, memo, source
- Links to Transaction (for auto-posting)
- Contains multiple GL Lines

### 7. **GL Line** (Entry Lines)
- Debit or Credit side
- Amount, currency
- Links to GL Account
- **Must balance**: Total debits = Total credits

### 8. **Position** (Holdings)
- Quantity, average cost, opened/closed timestamps
- Links Account + Asset
- Backed by `PositionLot` (FIFO) and `SellLotMatch` on sells
- Rebuilt chronologically via `PositionReplayService` (includes corporate actions on the timeline)

### 9. **Tag** (Transaction Tags)
- User-specific tags
- Many-to-many with Transactions

---

## 🔄 How It Works

### Core Flow: Investment Tracking

```
1. User creates Account (broker/bank)
   ↓
2. User adds Asset to catalog (if not exists)
   ↓
3. User records Transaction (buy/sell/dividend)
   ↓
4. System AUTOMATICALLY creates GL Entry
   - Finds appropriate GL accounts
   - Creates balanced entry (debit = credit)
   - Links to transaction
```

### Example: Buy Stock

```
User Action:
POST /transactions
{
  "accountId": "...",
  "assetId": "...",
  "type": "buy",
  "amount": 10000,
  "quantity": 100,
  "price": 100,
  "fee": 5
}

System Automatically:
1. Creates Transaction record
2. Finds Investment GL Account (name contains "投資")
3. Finds Cash GL Account (linked to Account)
4. Creates GL Entry:
   - Debit: Investment Account (10,005)
   - Credit: Cash Account (10,005)
```

---

## 🛡️ Security & Ownership

### Ownership Model
- **All resources belong to a user**
- Users can only access their own data
- **Admins can access all data** (bypass ownership checks)

### How It Works
1. **User ID Extraction**: `@CurrentUser()` decorator extracts user ID from:
   - Header: `X-User-Id`
   - Query param: `userId`

2. **Ownership Validation**: `OwnershipService` validates:
   - Account ownership
   - Transaction ownership (via account)
   - GL Account ownership
   - GL Entry ownership
   - Tag ownership

3. **Admin Override**: If user is admin, ownership checks are bypassed

### Example:
```typescript
@Get(':id')
async findOne(
  @Param('id') id: string,
  @CurrentUser() userId: string,  // Extracted from header
): Promise<AccountResponseDto> {
  // Service validates ownership automatically
  return this.service.findOne(id, userId)
}
```

---

## 📚 Main Features

### ✅ Implemented Features

#### 1. **User Management**
- Create users (email/password)
- List users (admin sees all)
- Role-based access (admin/user)

#### 2. **Account Management**
- Create/update/delete accounts
- Filter by user (admin can see all)
- Multiple account types & currencies

#### 3. **Asset Catalog**
- Global asset catalog
- Unique symbol tracking
- CRUD operations

#### 4. **Transaction Management**
- Record transactions (6 types)
- **Automatic GL posting**
- Advanced filtering (account, asset, type, date range)
- Soft delete (preserves history)
- Pagination

#### 5. **GL Ledger (Double-Entry Accounting)**
- Manual posting: Transfer, Expense, Income
- **Automatic posting** from transactions
- Balanced entries validation
- Currency consistency
- Idempotency (prevents duplicates)

#### 6. **Query & Filtering**
- Filter transactions by multiple criteria
- Pagination support
- Include/exclude deleted records

### 🚧 Not Yet Implemented (Data Models Exist)
- Position calculation service
- Price management endpoints
- FX Rate management endpoints
- Tag management endpoints
- GL Account CRUD endpoints
- GL Entry query endpoints
- Reporting/analytics endpoints

---

## 🔧 Key Services

### 1. **PostingService** (`src/gl/posting.service.ts`)
**Purpose**: Handles double-entry accounting logic

**Methods**:
- `postTransfer()` - Transfer between GL accounts
- `postExpense()` - Record expense
- `postIncome()` - Record income
- `postTransaction()` - Auto-post from transaction

**Key Features**:
- Validates balanced entries
- Ensures currency consistency
- Finds GL accounts by naming convention
- Idempotent (prevents duplicate postings)

### 2. **OwnershipService** (`src/common/services/ownership.service.ts`)
**Purpose**: Centralized ownership validation

**Methods**:
- `validateAccountOwnership()`
- `validateTransactionOwnership()`
- `validateGlAccountOwnership()`
- `validateGlEntryOwnership()`
- `validateTagOwnership()`
- `isAdmin()` - Check if user is admin

### 3. **GlService** (`src/gl/services/gl.service.ts`)
**Purpose**: GL account discovery and ledger helpers used by posting

**Methods** (used by `PostingService`):
- `getLinkedCashGlAccountId()` - GL account linked to a broker/bank `Account`
- `getInvestmentBucketGlAccountId()` - Investment bucket by user + currency
- `getFeeExpenseGlAccountId()`, dividend / realized gain / loss / equity helpers
- Ledger queries exposed via `GlController`

> Note: Some older docs refer to `GlAccountLookupService`; that standalone service/file does not exist. Lookups live on `GlService`.

### 4. **PositionReplayService** (`src/corporate-actions/position-replay.service.ts`)
**Purpose**: Rebuild `Position`, `PositionLot`, and `SellLotMatch` for an account–asset scope from transactions + `CorporateAction` events (chronological replay).

Used by transaction scope rebuilds and `CorpActionService.syncSplits`.

### 5. **Utility Functions** (`src/common/utils/`)
- **GL Validation**: `ensureBalanced()`, `ensureSameCurrency()`
- **Number Utils**: `toNumber()`, `roundTo()`, `isApproximatelyEqual()`
- **Date Utils**: `toDate()`, `toISOString()`

---

## 🎨 API Endpoints Summary

### Health
- `GET /health` - Health check

### Users
- `POST /users` - Create user
- `GET /users` - List users

### Accounts
- `POST /accounts` - Create account
- `GET /accounts` - List accounts (filtered by user)
- `GET /accounts/:id` - Get account
- `PATCH /accounts/:id` - Update account
- `DELETE /accounts/:id` - Delete account

### Assets
- `POST /assets` - Create asset
- `GET /assets` - List all assets
- `GET /assets/:id` - Get asset by ID
- `GET /assets/symbol/:symbol` - Get asset by symbol
- `PATCH /assets/:id` - Update asset
- `DELETE /assets/:id` - Delete asset

### Transactions
- `POST /transactions` - Create transaction (auto-posts to GL)
- `GET /transactions` - List transactions (with filters)
- `GET /transactions/:id` - Get transaction
- `PATCH /transactions/:id` - Update transaction
- `DELETE /transactions/:id` - Soft delete
- `DELETE /transactions/:id/hard` - Hard delete

### GL Ledger
- `POST /gl/transfer` - Transfer between GL accounts
- `POST /gl/expense` - Record expense entry
- `POST /gl/income` - Record income entry

**Note**: GL entries are automatically created when transactions are posted.

---

## 🔄 Transaction Auto-Posting Logic

When a transaction is created, the system automatically determines the GL accounts and creates a balanced entry:

### Transaction Type → GL Entry Mapping

| Transaction Type | GL Entry |
|-----------------|----------|
| **deposit** | Debit: Cash Account<br>Credit: Equity Account |
| **withdraw** | Debit: Equity Account<br>Credit: Cash Account |
| **buy** | Debit: Investment Account (amount + fee)<br>Credit: Cash Account (amount + fee) |
| **sell** | Debit: Cash Account (proceeds)<br>Credit: Investment Account (cost)<br>Credit/Debit: Realized P&L (if profit/loss) |
| **dividend** | Debit: Cash Account<br>Credit: Dividend Income Account |
| **fee** | Debit: Fee Expense Account<br>Credit: Cash Account |

### GL Account Discovery

The system uses naming conventions to find GL accounts:
- Investment: Name contains "投資" + currency match
- Fee: Name contains "手續費"
- Dividend: Name contains "股利"
- Equity: Name contains "權益"
- P&L: Name contains "已實現損益"

---

## 📖 Key Concepts

### Double-Entry Accounting
- Every transaction affects **at least two accounts**
- **Debit** = Left side (assets/expenses increase)
- **Credit** = Right side (liabilities/equity/income increase)
- **Must Balance**: Total debits = Total credits

### Soft Delete
- Transactions can be marked as deleted without removal
- Preserves audit trail
- Can be restored
- Hard delete available for permanent removal

### Ownership Model
- All resources belong to a user
- Users can only access their own data
- Admins can access all data
- Resources are automatically filtered by user

### Idempotency
- GL entries linked to transactions prevent duplicate postings
- Same transaction won't create multiple GL entries

---

## 🚀 Getting Started

### 1. Setup Database
```bash
# Start PostgreSQL (Docker)
pnpm db:up

# Run migrations
pnpm prisma:migrate

# Seed data (optional)
pnpm prisma:seed
```

### 2. Start Server
```bash
pnpm dev
```

### 3. Access API
- **API**: `http://localhost:3000`
- **Swagger Docs**: `http://localhost:3000/docs`
- **Health Check**: `http://localhost:3000/health`

### 4. Test Endpoints
Use Swagger UI at `/docs` or include `X-User-Id` header:
```bash
curl -H "X-User-Id: <user-id>" http://localhost:3000/accounts
```

---

## 📝 Important Notes

### GL Account Setup
Currently, GL accounts need to be created manually in the database. The system looks for accounts with specific name patterns:
- Investment: Contains "投資" + currency match
- Fee: Contains "手續費"
- Dividend: Contains "股利"
- Equity: Contains "權益"
- P&L: Contains "已實現損益"

### Authentication
Currently uses header-based user ID (`X-User-Id`). JWT authentication is recommended for production.

### Currency Handling
- First version: All lines in a GL entry must use the same currency
- Multi-currency support can be added later

---

## 🎯 Use Cases

### 1. Investment Tracking
Record buy/sell transactions → Automatic GL posting → Track portfolio

### 2. Cash Management
Record deposits/withdrawals → Automatic GL posting → Track cash flow

### 3. Expense Tracking
Record expenses → Manual GL posting → Track spending

### 4. Income Tracking
Record income → Manual GL posting → Track revenue

### 5. Multi-Account Management
Multiple broker/bank accounts → Track separately → Consolidated reporting

---

## 📚 Documentation Files

- **FEATURES.md** - Complete feature list
- **USAGE_GUIDE.md** - How to use the API
- **OWNERSHIP_VALIDATION.md** - Security & ownership details
- **REFACTORING.md** - Refactor backlog, architecture decisions, utility extraction notes
- **PROJECT_OVERVIEW.md** - This file

---

## 🔮 Future Enhancements

See **REFACTORING.md** for refactor task status (P1–P7).

### Completed on `main` (see REFACTORING.md)
- P1–P6: buy-mutation replay fix, position orchestrator, rebuild policy, CSV import service, `ScheduleModule` at `AppModule`, refactor docs alignment

### Planned / in progress
- **P7** — split `portfolio.service.ts` (valuation / trend / rebalance)

### Potential Features
- Performance metrics (ROI, P&L)
- Tax reporting
- Multi-currency conversion
- Recurring transactions
- Import/export (CSV, Excel)
- Audit logs
- Notifications/alerts

---

## 💡 Quick Reference

### Common Patterns

**Create Account → Record Transaction → Auto GL Posting**
```typescript
1. POST /accounts { name, type, currency }
2. POST /transactions { accountId, type, amount, ... }
3. System automatically creates GL entry
```

**Manual GL Posting**
```typescript
POST /gl/transfer { fromGlAccountId, toGlAccountId, amount, currency }
POST /gl/expense { payFromGlAccountId, expenseGlAccountId, amount, currency }
POST /gl/income { receiveToGlAccountId, incomeGlAccountId, amount, currency }
```

**Query Transactions**
```typescript
GET /transactions?accountId=...&assetId=...&type=buy&from=...&to=...
```

---

This overview should give you a complete picture of your Trackvest API project! 🚀


