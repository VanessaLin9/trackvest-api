# Trackvest API - Complete Feature List

## 📋 Overview

Trackvest is an **investment bookkeeping system** with **double-entry accounting (GL Ledger)** capabilities. It helps users track their investments, transactions, and maintain proper accounting records.

---

## 🔐 Authentication & Authorization

### User Management
- ✅ **User Registration** - Create new users with email/password
- ✅ **User Listing** - View all users (admin can see all, regular users see their own)
- ✅ **Role-Based Access** - Admin and User roles
- ✅ **Admin Privileges** - Admins can access all users' data
- ✅ **Ownership Validation** - All resources are protected by user ownership

**Endpoints:**
- `POST /users` - Create user
- `GET /users` - List all users

---

## 💰 Account Management

### Account Types
- **Broker Accounts** - For trading securities
- **Bank Accounts** - For cash deposits/withdrawals
- **Cash Accounts** - For physical cash

### Supported Currencies
- TWD (Taiwan Dollar)
- USD (US Dollar)
- JPY (Japanese Yen)
- EUR (Euro)

### Features
- ✅ **Create Account** - Add new accounts (broker/bank/cash)
- ✅ **List Accounts** - View all user's accounts (admins see all)
- ✅ **Get Account** - View account details
- ✅ **Update Account** - Modify account information
- ✅ **Delete Account** - Remove account (cascade deletes transactions)
- ✅ **Filter by User** - Admins can filter accounts by userId

**Endpoints:**
- `POST /accounts` - Create account
- `GET /accounts` - List accounts (filtered by user)
- `GET /accounts/:id` - Get account details
- `PATCH /accounts/:id` - Update account
- `DELETE /accounts/:id` - Delete account

**Data Model:**
- Account ID, User ID, Name, Type, Currency, Created At
- Links to GL Account (for double-entry accounting)

---

## 📊 Asset Catalog Management

### Asset Types
- **Equity** - Stocks/shares
- **ETF** - Exchange-traded funds
- **Crypto** - Cryptocurrencies
- **Cash** - Cash equivalents

### Features
- ✅ **Create Asset** - Add new assets to catalog (symbol must be unique)
- ✅ **List Assets** - View all assets (global catalog, not user-specific)
- ✅ **Get Asset by ID** - View asset details
- ✅ **Get Asset by Symbol** - Lookup by trading symbol (e.g., "AAPL")
- ✅ **Update Asset** - Modify asset information
- ✅ **Delete Asset** - Remove from catalog
- ✅ **Symbol Uniqueness** - Prevents duplicate symbols

**Endpoints:**
- `POST /assets` - Create asset
- `GET /assets` - List all assets
- `GET /assets/:id` - Get asset by ID
- `GET /assets/symbol/:symbol` - Get asset by symbol
- `PATCH /assets/:id` - Update asset
- `DELETE /assets/:id` - Delete asset

**Data Model:**
- Asset ID, Symbol (unique), Name, Type, Base Currency
- Links to Prices, Positions, Transactions

---

## 💸 Transaction Management

### Transaction Types
- **buy** - Purchase securities
- **sell** - Sell securities
- **deposit** - Deposit cash to account
- **withdraw** - Withdraw cash from account
- **dividend** - Receive dividend payments
- **fee** - Pay fees/commissions

### Features
- ✅ **Create Transaction** - Record new transaction (auto-posts to GL)
- ✅ **List Transactions** - View transactions with advanced filtering
- ✅ **Get Transaction** - View transaction details
- ✅ **Update Transaction** - Modify transaction
- ✅ **Soft Delete** - Mark transaction as deleted (preserves history)
- ✅ **Hard Delete** - Permanently remove transaction
- ✅ **Advanced Filtering**:
  - Filter by Account ID
  - Filter by Asset ID
  - Filter by Transaction Type
  - Filter by Date Range (from/to)
  - Include/exclude deleted transactions
- ✅ **Pagination** - Skip/take for large datasets
- ✅ **Automatic GL Posting** - Transactions automatically create GL entries
- ✅ **Transaction Tags** - Tag transactions for categorization
- ✅ **Related Data** - Includes account and asset information

**Endpoints:**
- `POST /transactions` - Create transaction (auto-posts to GL)
- `GET /transactions` - List transactions (with filters)
- `GET /transactions/:id` - Get transaction details
- `PATCH /transactions/:id` - Update transaction
- `DELETE /transactions/:id` - Soft delete transaction
- `DELETE /transactions/:id/hard` - Hard delete transaction

**Query Parameters:**
- `accountId` - Filter by account
- `assetId` - Filter by asset
- `type` - Filter by transaction type
- `from` - Start date (ISO8601)
- `to` - End date (ISO8601)
- `includeDeleted` - Include soft-deleted transactions
- `skip` - Pagination offset
- `take` - Page size (max 200)

**Data Model:**
- Transaction ID, Account ID, Asset ID (optional)
- Type, Amount, Quantity, Price, Fee
- Trade Time, Note
- Soft delete flags (isDeleted, deletedAt)
- Links to Account, Asset, Tags

---

## 📚 General Ledger (Double-Entry Accounting)

### GL Account Types
- **Asset** - Assets (cash, investments, etc.)
- **Liability** - Liabilities (loans, debts)
- **Equity** - Owner's equity
- **Income** - Revenue/income sources
- **Expense** - Expenses/costs

### Features
- ✅ **Manual Transfer** - Transfer between GL accounts
- ✅ **Manual Expense** - Record expenses (debit expense, credit cash)
- ✅ **Manual Income** - Record income (debit cash, credit income)
- ✅ **Automatic Transaction Posting** - Transactions auto-create GL entries:
  - **Deposit** → Debit cash, Credit equity
  - **Withdraw** → Debit equity, Credit cash
  - **Buy** → Debit investment, Credit cash (includes fees)
  - **Sell** → Debit cash, Credit investment, Credit/Debit realized P&L
  - **Dividend** → Debit cash, Credit dividend income
  - **Fee** → Debit fee expense, Credit cash
- ✅ **Balanced Entries** - All entries must balance (debit = credit)
- ✅ **Currency Consistency** - All lines in an entry use same currency
- ✅ **Idempotency** - Prevents duplicate postings for same transaction
- ✅ **Account Linking** - GL accounts can link to regular accounts
- ✅ **Memo/Notes** - Add descriptions to entries
- ✅ **Source Tracking** - Track entry source (manual vs auto)

**Endpoints:**
- `POST /gl/transfer` - Transfer between GL accounts
- `POST /gl/expense` - Record expense entry
- `POST /gl/income` - Record income entry

**Automatic Posting:**
- When transactions are created, GL entries are automatically generated
- Each transaction type has specific GL account mappings
- Uses named GL accounts (e.g., "投資", "手續費", "股利", "權益")

**Data Model:**
- **GlAccount**: Chart of accounts (科目表)
  - ID, User ID, Code (optional), Name, Type, Currency, Linked Account
- **GlEntry**: Journal entries (分錄主表)
  - ID, User ID, Date, Memo, Source, Reference Transaction ID
- **GlLine**: Entry lines (分錄明細)
  - ID, Entry ID, GL Account ID, Amount, Side (debit/credit), Currency, Note

---

## 🏷️ Tagging System

### Features
- ✅ **User-Specific Tags** - Each user has their own tags
- ✅ **Tag Transactions** - Multiple tags per transaction
- ✅ **Tag Management** - Create/manage tags
- ✅ **Unique Names** - Tag names unique per user

**Data Model:**
- Tag ID, User ID, Name (unique per user)
- Many-to-many relationship with Transactions

---

## 📈 Position Tracking

### Features
- ✅ **Position Model** - Track holdings per account/asset
- ✅ **Quantity Tracking** - Current holdings quantity
- ✅ **Average Cost** - Track average purchase price
- ✅ **Open/Close Dates** - Track position lifecycle

**Data Model:**
- Position ID, Account ID, Asset ID
- Quantity, Average Cost
- Opened At, Closed At (optional)

**Note:** Position calculation logic not yet implemented in services

---

## 💱 Price & FX Rate Tracking

### Features
- ✅ **Price History** - Track asset prices over time
- ✅ **FX Rate History** - Track exchange rates
- ✅ **Source Tracking** - Record price source
- ✅ **Time-Series Data** - Indexed by date for efficient queries

**Data Model:**
- **Price**: Asset ID, Price, As Of Date, Source
- **FxRate**: Base Currency, Quote Currency, Rate, As Of Date

**Note:** CRUD endpoints not yet implemented, but data models exist

---

## 🔍 Search & Filtering Capabilities

### Transaction Filtering
- ✅ Filter by Account
- ✅ Filter by Asset
- ✅ Filter by Type
- ✅ Filter by Date Range
- ✅ Include/Exclude Deleted
- ✅ Pagination Support

### Account Filtering
- ✅ Filter by User (for admins)
- ✅ Sort by Creation Date

### Asset Search
- ✅ Search by Symbol
- ✅ List all assets

---

## 🛡️ Security Features

- ✅ **Ownership Validation** - Users can only access their own data
- ✅ **Admin Override** - Admins can access all data
- ✅ **Soft Delete** - Preserve data history
- ✅ **Cascade Deletes** - Proper cleanup of related data
- ✅ **Input Validation** - DTO validation with class-validator
- ✅ **Error Handling** - Proper HTTP status codes
- ✅ **Type Safety** - Full TypeScript support

---

## 📊 Data Relationships

```
User
├── Accounts (broker/bank/cash)
│   ├── Transactions
│   │   ├── Asset (optional)
│   │   └── Tags (many-to-many)
│   └── Positions
├── Tags
├── GL Accounts (Chart of Accounts)
└── GL Entries
    └── GL Lines (debit/credit)

Asset (Global Catalog)
├── Prices
├── Transactions
└── Positions

FxRate (Global)
```

---

## 🎯 Use Cases & Workflows

### 1. Investment Tracking Workflow
1. **Create Account** → Set up broker/bank account
2. **Create Asset** → Add stock/ETF to catalog (if not exists)
3. **Record Buy Transaction** → Purchase securities
   - Automatically creates GL entry (debit investment, credit cash)
4. **Record Sell Transaction** → Sell securities
   - Automatically creates GL entry with realized P&L
5. **Record Dividend** → Receive dividend payment
   - Automatically creates GL entry (debit cash, credit income)

### 2. Cash Management Workflow
1. **Create Bank Account** → Set up bank account
2. **Link GL Account** → Connect to GL cash account
3. **Record Deposit** → Deposit cash
   - Automatically creates GL entry (debit cash, credit equity)
4. **Record Withdrawal** → Withdraw cash
   - Automatically creates GL entry (debit equity, credit cash)

### 3. Expense Tracking Workflow
1. **Set Up GL Accounts** → Create expense categories
2. **Record Expense** → Manual expense entry
   - Debit expense account, credit cash account
3. **View Reports** → Query GL entries by account/date

### 4. Income Tracking Workflow
1. **Set Up GL Accounts** → Create income categories
2. **Record Income** → Manual income entry
   - Debit cash account, credit income account
3. **View Reports** → Query GL entries by account/date

### 5. Transfer Between Accounts
1. **Set Up GL Accounts** → Ensure both accounts exist
2. **Record Transfer** → Transfer between accounts
   - Debit destination, credit source

### 6. Admin Management Workflow
1. **Admin Access** → Use admin user ID
2. **View All Users** → See all user accounts
3. **View All Transactions** → See all transactions
4. **Create for Users** → Create resources for any user

---

## 📝 API Documentation

- **Swagger UI**: Available at `/docs` when server is running
- **JSON Schema**: Available at `/docs/json`
- **Bearer Auth**: Configured (ready for JWT implementation)

---

## 🔄 Automatic Features

### Transaction Auto-Posting
When a transaction is created, the system automatically:
1. Determines transaction type
2. Finds appropriate GL accounts
3. Creates balanced GL entry
4. Links entry to transaction (for idempotency)

### GL Account Discovery
The system uses naming conventions to find GL accounts:
- Investment accounts: Contains "投資" + currency
- Fee accounts: Contains "手續費"
- Dividend accounts: Contains "股利"
- Equity accounts: Contains "權益"
- P&L accounts: Contains "已實現損益"

---

## 🚀 Future Enhancement Opportunities

### Not Yet Implemented (Data Models Exist)
- Position calculation service
- Price management endpoints
- FX Rate management endpoints
- Tag management endpoints
- GL Account CRUD endpoints
- GL Entry query endpoints
- Reporting/analytics endpoints

### Potential Features
- Portfolio valuation (using prices)
- Performance metrics (ROI, P&L)
- Tax reporting
- Multi-currency conversion
- Recurring transactions
- Import/export (CSV, Excel)
- Audit logs
- Notifications/alerts

---

## 📦 Technical Stack

- **Framework**: NestJS (Node.js)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Validation**: class-validator, class-transformer
- **API Docs**: Swagger/OpenAPI
- **Security**: bcrypt (password hashing)
- **Type Safety**: TypeScript

---

## 🎓 Key Concepts

### Double-Entry Accounting
Every financial transaction affects at least two accounts:
- **Debit** = Left side (assets/expenses increase)
- **Credit** = Right side (liabilities/equity/income increase)
- **Must Balance**: Total debits = Total credits

### Soft Delete
Transactions can be marked as deleted without removing from database:
- Preserves audit trail
- Can be restored
- Hard delete available for permanent removal

### Ownership Model
- All resources belong to a user
- Users can only access their own data
- Admins can access all data
- Resources are automatically filtered by user

---

## 📞 API Base URL

- **Development**: `http://localhost:3000`
- **Health Check**: `GET /health`
- **API Docs**: `GET /docs`

---

This feature list provides a comprehensive overview of what Trackvest API can do. Use it to plan your frontend implementation and understand the full capabilities of the system!

