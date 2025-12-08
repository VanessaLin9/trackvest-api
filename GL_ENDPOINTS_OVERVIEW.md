# GL Endpoints - Complete Overview

## 📋 Table of Contents
1. [Endpoints Summary](#endpoints-summary)
2. [Data Models & Database Tables](#data-models--database-tables)
3. [Data Flow Diagrams](#data-flow-diagrams)
4. [Request/Response Examples](#requestresponse-examples)
5. [Validation Rules](#validation-rules)
6. [Automatic Posting](#automatic-posting)

---

## 🎯 Endpoints Summary

### Manual GL Posting Endpoints

| Endpoint | Method | Purpose | GL Entry Pattern |
|----------|--------|---------|------------------|
| `/gl/transfer` | POST | Transfer between GL accounts | Debit: `toGlAccountId`<br>Credit: `fromGlAccountId` |
| `/gl/expense` | POST | Record expense | Debit: `expenseGlAccountId`<br>Credit: `payFromGlAccountId` |
| `/gl/income` | POST | Record income | Debit: `receiveToGlAccountId`<br>Credit: `incomeGlAccountId` |

### Automatic Posting
- **Not a direct endpoint** - Automatically triggered when transactions are created
- Endpoint: `POST /transactions` → Auto-creates GL entries
- Handled by: `PostingService.postTransaction()`

---

## 📊 Data Models & Database Tables

### Database Schema Overview

```
User
├── GlAccount[] (Chart of Accounts)
└── GlEntry[] (Journal Entries)
    └── GlLine[] (Entry Lines)
        └── GlAccount (references)
```

### 1. GlAccount (科目表 - Chart of Accounts)

**Table**: `GlAccount`

**Fields**:
```typescript
{
  id: string (UUID, PK)
  userId: string (FK → User.id)
  code: string? (optional, for sorting/export)
  name: string (unique per user)
  type: GlAccountType (asset | liability | equity | income | expense)
  currency: Currency? (TWD | USD | JPY | EUR, optional)
  linkedAccountId: string? (FK → Account.id, optional)
  archivedAt: DateTime? (soft delete)
}
```

**Relationships**:
- `user` → User (many-to-one)
- `linked` → Account (one-to-one, optional)
- `lines` → GlLine[] (one-to-many)

**Constraints**:
- `@@unique([userId, name])` - Name unique per user
- `@@unique([linkedAccountId])` - One GL account per regular account
- `@@index([userId, type])` - For filtering by type

**Example Data**:
```json
{
  "id": "gl-acc-001",
  "userId": "user-001",
  "name": "資產-現金-台幣",
  "type": "asset",
  "currency": "TWD",
  "linkedAccountId": "account-001"
}
```

### 2. GlEntry (分錄主表 - Journal Entry Header)

**Table**: `GlEntry`

**Fields**:
```typescript
{
  id: string (UUID, PK)
  userId: string (FK → User.id)
  date: DateTime (transaction date)
  memo: string? (description/notes)
  source: string? ('manual:transfer' | 'auto:transaction:buy' | etc.)
  refTxId: string? (FK → Transaction.id, for auto-posting)
  isDeleted: boolean (soft delete flag)
  deletedAt: DateTime? (soft delete timestamp)
}
```

**Relationships**:
- `user` → User (many-to-one)
- `lines` → GlLine[] (one-to-many)

**Constraints**:
- `@@index([userId, date])` - For date range queries
- `@@index([refTxId])` - For transaction lookups

**Example Data**:
```json
{
  "id": "entry-001",
  "userId": "user-001",
  "date": "2025-01-15T10:00:00Z",
  "memo": "Transfer from savings to checking",
  "source": "manual:transfer",
  "refTxId": null
}
```

### 3. GlLine (分錄明細 - Journal Entry Line)

**Table**: `GlLine`

**Fields**:
```typescript
{
  id: string (UUID, PK)
  entryId: string (FK → GlEntry.id)
  glAccountId: string (FK → GlAccount.id)
  amount: Decimal (positive number)
  side: GlSide ('debit' | 'credit')
  currency: Currency (TWD | USD | JPY | EUR)
  note: string? (line-level description)
}
```

**Relationships**:
- `entry` → GlEntry (many-to-one)
- `glAccount` → GlAccount (many-to-one)

**Constraints**:
- `@@index([entryId])` - For entry lookups
- `@@index([glAccountId])` - For account balance queries
- `@@index([glAccountId, currency])` - For currency-specific balances

**Example Data**:
```json
{
  "id": "line-001",
  "entryId": "entry-001",
  "glAccountId": "gl-acc-001",
  "amount": 1000.00,
  "side": "debit",
  "currency": "TWD",
  "note": "transfer in"
}
```

### Enums

**GlAccountType**:
```typescript
enum GlAccountType {
  asset      // 資產
  liability  // 負債
  equity     // 權益
  income     // 收入
  expense    // 費用
}
```

**GlSide**:
```typescript
enum GlSide {
  debit   // 借方
  credit  // 貸方
}
```

**Currency**:
```typescript
enum Currency {
  TWD
  USD
  JPY
  EUR
}
```

---

## 🔄 Data Flow Diagrams

### Flow 1: Manual Transfer (`POST /gl/transfer`)

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /gl/transfer
       │ {
       │   userId, fromGlAccountId, toGlAccountId,
       │   amount, currency, date?, memo?, source?
       │ }
       ▼
┌─────────────────────┐
│   GlController      │
│   .transfer()      │
└──────┬──────────────┘
       │
       │ 1. Extract userId from @CurrentUser()
       │ 2. Validate userId matches (unless admin)
       │ 3. Convert date string to Date
       ▼
┌─────────────────────┐
│  PostingService      │
│  .postTransfer()     │
└──────┬──────────────┘
       │
       │ 1. Validate GL account ownership
       │    (fromGlAccountId, toGlAccountId)
       │ 2. Create GlLineInput[]:
       │    - Debit: toGlAccountId
       │    - Credit: fromGlAccountId
       ▼
┌─────────────────────┐
│  PostingService     │
│  .createEntry()     │
└──────┬──────────────┘
       │
       │ 1. validateGlLines() - Check balance & currency
       │ 2. Check idempotency (if refTxId exists)
       │ 3. Create GlEntry + GlLine[] in transaction
       ▼
┌─────────────────────┐
│   Database          │
│   (Prisma)          │
└─────────────────────┘
       │
       │ Creates:
       │ - 1 GlEntry record
       │ - 2 GlLine records (debit + credit)
       ▼
┌─────────────────────┐
│   Response          │
│   (GlEntry + lines) │
└─────────────────────┘
```

### Flow 2: Manual Expense (`POST /gl/expense`)

```
Client → GlController.expense()
  ↓
PostingService.postExpense()
  ↓
1. Validate ownership (payFromGlAccountId, expenseGlAccountId)
2. Create lines:
   - Debit: expenseGlAccountId
   - Credit: payFromGlAccountId
  ↓
PostingService.createEntry()
  ↓
Database: Creates GlEntry + 2 GlLines
```

### Flow 3: Manual Income (`POST /gl/income`)

```
Client → GlController.income()
  ↓
PostingService.postIncome()
  ↓
1. Validate ownership (receiveToGlAccountId, incomeGlAccountId)
2. Create lines:
   - Debit: receiveToGlAccountId
   - Credit: incomeGlAccountId
  ↓
PostingService.createEntry()
  ↓
Database: Creates GlEntry + 2 GlLines
```

### Flow 4: Automatic Transaction Posting

```
Client → TransactionsController.create()
  ↓
TransactionsService.create()
  ↓
1. Create Transaction record
2. Call PostingService.postTransaction()
  ↓
PostingService.postTransaction()
  ↓
1. Get Account → determine currency
2. Find linked Cash GL Account
3. Switch by transaction type:
   - deposit → Debit Cash, Credit Equity
   - withdraw → Debit Equity, Credit Cash
   - buy → Debit Investment, Credit Cash
   - sell → Debit Cash, Credit Investment, Credit/Debit P&L
   - dividend → Debit Cash, Credit Dividend Income
   - fee → Debit Fee Expense, Credit Cash
  ↓
PostingService.createEntry(refTxId = transaction.id)
  ↓
Database: Creates GlEntry + GlLines (2-3 lines)
```

---

## 📝 Request/Response Examples

### 1. POST /gl/transfer

**Request**:
```json
{
  "userId": "c2610e4e-1cca-401e-afa7-1ebf541d0000",
  "fromGlAccountId": "gl-acc-savings",
  "toGlAccountId": "gl-acc-checking",
  "amount": 5000,
  "currency": "TWD",
  "date": "2025-01-15T10:00:00.000Z",
  "memo": "Transfer from savings to checking",
  "source": "manual:transfer"
}
```

**Response**:
```json
{
  "id": "entry-001",
  "userId": "c2610e4e-1cca-401e-afa7-1ebf541d0000",
  "date": "2025-01-15T10:00:00.000Z",
  "memo": "Transfer from savings to checking",
  "source": "manual:transfer",
  "refTxId": null,
  "isDeleted": false,
  "deletedAt": null,
  "lines": [
    {
      "id": "line-001",
      "entryId": "entry-001",
      "glAccountId": "gl-acc-checking",
      "amount": 5000,
      "side": "debit",
      "currency": "TWD",
      "note": "transfer in"
    },
    {
      "id": "line-002",
      "entryId": "entry-001",
      "glAccountId": "gl-acc-savings",
      "amount": 5000,
      "side": "credit",
      "currency": "TWD",
      "note": "transfer out"
    }
  ]
}
```

### 2. POST /gl/expense

**Request**:
```json
{
  "userId": "c2610e4e-1cca-401e-afa7-1ebf541d0000",
  "payFromGlAccountId": "gl-acc-cash",
  "expenseGlAccountId": "gl-acc-meals",
  "amount": 320,
  "currency": "TWD",
  "date": "2025-01-15T12:00:00.000Z",
  "memo": "Lunch",
  "source": "manual:expense"
}
```

**Response**: Similar structure, with:
- Line 1: Debit `gl-acc-meals` (expense)
- Line 2: Credit `gl-acc-cash` (cash out)

### 3. POST /gl/income

**Request**:
```json
{
  "userId": "c2610e4e-1cca-401e-afa7-1ebf541d0000",
  "receiveToGlAccountId": "gl-acc-bank",
  "incomeGlAccountId": "gl-acc-salary",
  "amount": 1500,
  "currency": "TWD",
  "date": "2025-01-15T09:30:00.000Z",
  "memo": "Salary (partial)",
  "source": "manual:income"
}
```

**Response**: Similar structure, with:
- Line 1: Debit `gl-acc-bank` (cash in)
- Line 2: Credit `gl-acc-salary` (income)

---

## ✅ Validation Rules

### 1. Request Validation (DTO Level)

**PostTransferCommand / PostExpenseCommand / PostIncomeCommand**:
- `userId`: Must be UUID
- `*GlAccountId`: Must be UUID
- `amount`: Must be positive number
- `currency`: Must be valid enum (TWD/USD/JPY/EUR)
- `date`: Optional, must be ISO date string
- `memo`: Optional string
- `source`: Optional string

### 2. Business Logic Validation

**Ownership Validation**:
- All GL accounts must belong to the user (or user must be admin)
- Validated via `OwnershipService.validateGlAccountOwnership()`

**Balance Validation**:
- Total debits must equal total credits
- Tolerance: `1e-6` (for floating point precision)
- Validated via `validateGlLines()` → `ensureBalanced()`

**Currency Validation**:
- All lines in an entry must use the same currency
- Validated via `validateGlLines()` → `ensureSameCurrency()`

**Idempotency**:
- If `refTxId` is provided, soft-deletes existing entry with same `userId + refTxId`
- Prevents duplicate postings for the same transaction

### 3. Database Constraints

**GlAccount**:
- `name` must be unique per `userId`
- `linkedAccountId` must be unique (one GL account per regular account)

**GlLine**:
- `amount` must be positive
- `side` must be 'debit' or 'credit'
- `currency` must match other lines in same entry

---

## 🤖 Automatic Posting Logic

### Transaction Type → GL Entry Mapping

| Transaction Type | GL Entry Lines | Notes |
|-----------------|----------------|--------|
| **deposit** | Debit: Cash GL Account<br>Credit: Equity GL Account | Owner contribution |
| **withdraw** | Debit: Equity GL Account<br>Credit: Cash GL Account | Owner draw |
| **buy** | Debit: Investment GL Account (amount + fee)<br>Credit: Cash GL Account (amount + fee) | Fees included in cost |
| **sell** | Debit: Cash GL Account (proceeds)<br>Credit: Investment GL Account (cost)<br>Credit/Debit: Realized P&L (if profit/loss) | 2-3 lines depending on P&L |
| **dividend** | Debit: Cash GL Account<br>Credit: Dividend Income GL Account | Income recognition |
| **fee** | Debit: Fee Expense GL Account<br>Credit: Cash GL Account | Expense recognition |

### GL Account Discovery

The system uses **naming conventions** to find GL accounts:

| Account Type | Search Pattern |
|-------------|---------------|
| Investment | Name contains "投資" + currency match |
| Fee Expense | Name contains "手續費" |
| Dividend Income | Name contains "股利" |
| Equity | Name contains "權益" |
| Realized Gain | Name contains "已實現損益-收益" |
| Realized Loss | Name contains "已實現損益-損失" |
| Cash | Linked to Account via `linkedAccountId` |

**Service**: `GlAccountLookupService` handles all lookups.

### Example: Buy Transaction Auto-Posting

```
Transaction Created:
{
  type: "buy",
  accountId: "account-001",
  assetId: "asset-001",
  amount: 10000,
  quantity: 100,
  price: 100,
  fee: 5
}

System Flow:
1. Get Account → currency = "TWD"
2. Find Cash GL Account (linkedAccountId = account-001)
3. Find Investment GL Account (name contains "投資", currency = "TWD")
4. Calculate total = 10000 + 5 = 10005
5. Create GL Entry:
   - Debit: Investment Account (10005)
   - Credit: Cash Account (10005)
6. Link entry to transaction (refTxId = transaction.id)
```

---

## 🔍 Key Services & Utilities

### PostingService
- **Location**: `src/gl/posting.service.ts`
- **Methods**:
  - `postTransfer()` - Manual transfer posting
  - `postExpense()` - Manual expense posting
  - `postIncome()` - Manual income posting
  - `postTransaction()` - Automatic transaction posting
  - `createEntry()` - Internal method to create GL entry

### GlAccountLookupService
- **Location**: `src/gl/services/gl-account-lookup.service.ts`
- **Purpose**: Find GL accounts by various criteria
- **Methods**:
  - `getLinkedCashGlAccountId()` - Find by linked Account
  - `getNamedGlAccountId()` - Find by name pattern
  - `getInvestmentBucketGlAccountId()` - Find investment account
  - `getFeeExpenseGlAccountId()` - Find fee account
  - `getDividendIncomeGlAccountId()` - Find dividend account
  - `getEquityGlAccountId()` - Find equity account
  - And more...

### OwnershipService
- **Location**: `src/common/services/ownership.service.ts`
- **Purpose**: Validate resource ownership
- **Method**: `validateGlAccountOwnership()` - Ensures GL account belongs to user

### Validation Utilities
- **Location**: `src/common/utils/gl-validation.util.ts`
- **Functions**:
  - `validateGlLines()` - Validates balance & currency
  - `ensureBalanced()` - Checks debit = credit
  - `ensureSameCurrency()` - Checks all lines same currency

---

## 📊 Database Queries Examples

### Get GL Entry with Lines
```prisma
const entry = await prisma.glEntry.findUnique({
  where: { id: entryId },
  include: {
    lines: {
      include: {
        glAccount: true
      }
    }
  }
})
```

### Get GL Account Balance
```prisma
// Sum all debit lines
const debitTotal = await prisma.glLine.aggregate({
  where: {
    glAccountId: accountId,
    side: 'debit',
    currency: 'TWD',
    entry: { isDeleted: false }
  },
  _sum: { amount: true }
})

// Sum all credit lines
const creditTotal = await prisma.glLine.aggregate({
  where: {
    glAccountId: accountId,
    side: 'credit',
    currency: 'TWD',
    entry: { isDeleted: false }
  },
  _sum: { amount: true }
})

// Balance = Debit - Credit (for asset accounts)
const balance = debitTotal._sum.amount - creditTotal._sum.amount
```

### Get Entries by Date Range
```prisma
const entries = await prisma.glEntry.findMany({
  where: {
    userId: userId,
    date: {
      gte: startDate,
      lte: endDate
    },
    isDeleted: false
  },
  include: {
    lines: {
      include: {
        glAccount: true
      }
    }
  },
  orderBy: { date: 'desc' }
})
```

---

## 🎯 Summary

### What GL Endpoints Do
1. **Manual Posting**: Create GL entries manually (transfer/expense/income)
2. **Automatic Posting**: Automatically create GL entries from transactions
3. **Double-Entry**: Ensure all entries are balanced (debit = credit)
4. **Currency Consistency**: All lines in an entry use the same currency
5. **Ownership**: All GL accounts/entries belong to users
6. **Idempotency**: Prevent duplicate postings for same transaction

### Key Database Tables
- **GlAccount**: Chart of accounts (科目表)
- **GlEntry**: Journal entry header (分錄主表)
- **GlLine**: Journal entry lines (分錄明細)

### Key Concepts
- **Debit**: Left side (assets/expenses increase)
- **Credit**: Right side (liabilities/equity/income increase)
- **Balance**: Total debits must equal total credits
- **Source**: Tracks entry origin (manual vs auto)
- **refTxId**: Links GL entry to transaction (for idempotency)

---

This overview covers all aspects of the GL endpoints system! 🚀


