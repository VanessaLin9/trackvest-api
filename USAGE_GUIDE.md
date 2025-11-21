# Trackvest API - Usage Guide

## 🎯 Core Purpose

Trackvest is an **investment bookkeeping system** that combines:
1. **Investment Tracking** - Record buy/sell transactions, dividends, fees
2. **Double-Entry Accounting** - Automatic GL ledger posting for proper bookkeeping
3. **Multi-Account Management** - Track multiple broker/bank/cash accounts
4. **Asset Catalog** - Global catalog of tradable assets (stocks, ETFs, crypto)

---

## 🚀 Quick Start Workflow

### Step 1: Set Up User & Accounts
```bash
# 1. Create user
POST /users
{ "email": "user@example.com", "password": "password123" }

# 2. Create broker account
POST /accounts
Headers: X-User-Id: <user-id>
{ "userId": "<user-id>", "name": "My Broker", "type": "broker", "currency": "TWD" }

# 3. Create bank account
POST /accounts
{ "userId": "<user-id>", "name": "My Bank", "type": "bank", "currency": "TWD" }
```

### Step 2: Set Up GL Accounts (Chart of Accounts)
**Note:** Currently GL accounts need to be created manually in database. The system looks for:
- Investment accounts: Name contains "投資" + currency match
- Fee accounts: Name contains "手續費"
- Dividend accounts: Name contains "股利"
- Equity accounts: Name contains "權益"
- P&L accounts: Name contains "已實現損益"

### Step 3: Add Assets to Catalog
```bash
# Add stock to catalog
POST /assets
{ "symbol": "AAPL", "name": "Apple Inc.", "type": "equity", "baseCurrency": "USD" }
```

### Step 4: Record Transactions
```bash
# Buy stock
POST /transactions
Headers: X-User-Id: <user-id>
{
  "accountId": "<broker-account-id>",
  "assetId": "<asset-id>",
  "type": "buy",
  "amount": 10000,
  "quantity": 100,
  "price": 100,
  "fee": 5,
  "tradeTime": "2025-01-01T10:00:00Z"
}
# → Automatically creates GL entry: Debit Investment, Credit Cash

# Sell stock
POST /transactions
{
  "accountId": "<broker-account-id>",
  "assetId": "<asset-id>",
  "type": "sell",
  "amount": 12000,
  "quantity": 100,
  "price": 120,
  "fee": 5,
  "tradeTime": "2025-01-15T10:00:00Z"
}
# → Automatically creates GL entry with realized P&L

# Receive dividend
POST /transactions
{
  "accountId": "<broker-account-id>",
  "assetId": "<asset-id>",
  "type": "dividend",
  "amount": 500,
  "tradeTime": "2025-02-01T10:00:00Z"
}
# → Automatically creates GL entry: Debit Cash, Credit Dividend Income
```

---

## 📊 Feature Categories

### 1. **User & Account Management**
**Purpose:** Set up user accounts and financial accounts

**Key Features:**
- User registration and management
- Multiple account types (broker, bank, cash)
- Multi-currency support (TWD, USD, JPY, EUR)
- Account ownership validation

**Use Cases:**
- Personal finance tracking
- Multiple broker accounts
- Multi-currency portfolios

---

### 2. **Asset Catalog**
**Purpose:** Maintain global catalog of tradable assets

**Key Features:**
- Unique symbol tracking
- Asset types (equity, ETF, crypto, cash)
- Base currency tracking
- Symbol-based lookup

**Use Cases:**
- Stock/ETF catalog
- Cryptocurrency tracking
- Reference data for transactions

---

### 3. **Transaction Recording**
**Purpose:** Record all investment transactions

**Transaction Types:**
- **buy** - Purchase securities
- **sell** - Sell securities  
- **deposit** - Add cash to account
- **withdraw** - Remove cash from account
- **dividend** - Receive dividend payments
- **fee** - Pay fees/commissions

**Key Features:**
- Automatic GL posting
- Advanced filtering (account, asset, type, date range)
- Soft delete (preserve history)
- Pagination support
- Transaction tags (data model ready)

**Use Cases:**
- Trade recording
- Cash flow tracking
- Dividend tracking
- Fee tracking

---

### 4. **Double-Entry Accounting (GL Ledger)**
**Purpose:** Proper accounting records with automatic posting

**Manual Posting:**
- Transfer between GL accounts
- Expense recording
- Income recording

**Automatic Posting:**
- Transactions automatically create GL entries
- Balanced entries (debit = credit)
- Currency consistency
- Idempotency (prevents duplicates)

**GL Account Types:**
- Asset (資產)
- Liability (負債)
- Equity (權益)
- Income (收入)
- Expense (費用)

**Use Cases:**
- Financial reporting
- Tax preparation
- Audit trail
- Proper bookkeeping

---

### 5. **Query & Reporting**
**Purpose:** Retrieve and analyze data

**Query Capabilities:**
- Filter transactions by account, asset, type, date
- Pagination for large datasets
- Include/exclude deleted records
- Account listing with user filtering
- Asset search by symbol

**Use Cases:**
- Transaction history
- Portfolio analysis
- Performance tracking
- Tax reporting

---

## 🔄 Integration Patterns

### Pattern 1: Investment Tracking Flow
```
1. Create Account → 2. Add Asset → 3. Record Buy → 4. Record Sell → 5. Record Dividend
     ↓                    ↓              ↓                ↓                  ↓
   GL Account        Asset Catalog   Auto GL Post    Auto GL Post      Auto GL Post
```

### Pattern 2: Cash Management Flow
```
1. Create Bank Account → 2. Link GL Account → 3. Record Deposit → 4. Record Withdrawal
         ↓                      ↓                    ↓                    ↓
    Account Setup          GL Setup            Auto GL Post        Auto GL Post
```

### Pattern 3: Expense Tracking Flow
```
1. Set Up Expense GL Accounts → 2. Record Expense → 3. Query Expenses
            ↓                          ↓                    ↓
      GL Setup                  Manual GL Post        Reporting
```

---

## 💡 Key Design Decisions

### 1. **Automatic GL Posting**
- Transactions automatically create GL entries
- Ensures accounting records are always in sync
- Reduces manual bookkeeping errors

### 2. **Ownership Model**
- All resources belong to users
- Users can only access their own data
- Admins can access all data for management

### 3. **Soft Delete**
- Transactions can be marked deleted without removal
- Preserves audit trail
- Hard delete available when needed

### 4. **Global Asset Catalog**
- Assets are shared across users
- Prevents duplicate asset definitions
- Symbol-based lookup for efficiency

### 5. **Account Linking**
- GL accounts can link to regular accounts
- Enables automatic posting
- Maintains relationship between accounts and GL

---

## 🎨 Frontend Implementation Suggestions

### Dashboard View
- Show account balances
- Recent transactions
- Portfolio summary
- Quick actions (add transaction, create account)

### Transaction Management
- Transaction list with filters
- Transaction form (buy/sell/deposit/etc.)
- Transaction details view
- Edit/delete capabilities

### Account Management
- Account list
- Account creation form
- Account details (with transactions)
- Account balance calculation

### Asset Catalog
- Asset search/browse
- Add new asset
- Asset details
- Price history (when implemented)

### GL Ledger View
- GL account list
- GL entry list (by account/date)
- Manual entry forms (transfer/expense/income)
- Balance reports

### Reporting
- Transaction reports (by date, account, asset)
- GL reports (trial balance, income statement)
- Portfolio reports
- Performance metrics

---

## 🔐 Security Considerations

### Current Implementation
- Header-based user ID (`X-User-Id`)
- Ownership validation on all endpoints
- Admin override capability

### Recommended Enhancements
- JWT authentication (replace header-based)
- Password reset functionality
- Session management
- Rate limiting
- Audit logging

---

## 📈 Data Flow Examples

### Example 1: Buy Stock
```
User Action: Record buy transaction
  ↓
POST /transactions { type: "buy", accountId: "...", assetId: "...", ... }
  ↓
Service: Create transaction record
  ↓
Service: Auto-post to GL
  ↓
GL Entry Created:
  - Debit: Investment Account (amount + fee)
  - Credit: Cash Account (amount + fee)
```

### Example 2: Sell Stock with Profit
```
User Action: Record sell transaction
  ↓
POST /transactions { type: "sell", ... }
  ↓
Service: Create transaction + calculate P&L
  ↓
GL Entry Created:
  - Debit: Cash Account (proceeds)
  - Credit: Investment Account (cost)
  - Credit: Realized Gain (profit)
```

### Example 3: Receive Dividend
```
User Action: Record dividend
  ↓
POST /transactions { type: "dividend", ... }
  ↓
Service: Create transaction + GL entry
  ↓
GL Entry Created:
  - Debit: Cash Account
  - Credit: Dividend Income Account
```

---

## 🛠️ Development Tips

### Testing Endpoints
1. Use Swagger UI at `/docs` for interactive testing
2. Always include `X-User-Id` header for protected endpoints
3. Use admin user ID to test admin features

### Common Patterns
- Create account before transactions
- Create asset before referencing in transactions
- Set up GL accounts before automatic posting works
- Use soft delete for audit trail

### Error Handling
- 401: Missing user ID
- 403: Ownership violation
- 404: Resource not found
- 400: Validation error

---

## 📚 Next Steps for Frontend

1. **User Management UI**
   - Login/registration (when auth is implemented)
   - User profile
   - Account selection

2. **Account Management UI**
   - Account list
   - Account creation/editing
   - Account details view

3. **Transaction UI**
   - Transaction list with filters
   - Transaction form (all types)
   - Transaction details/edit

4. **Asset Catalog UI**
   - Asset search/browse
   - Add asset form
   - Asset details

5. **GL Ledger UI**
   - GL account management
   - GL entry list
   - Manual entry forms
   - Reports/balances

6. **Dashboard**
   - Overview of accounts
   - Recent transactions
   - Quick stats
   - Charts/graphs

---

This guide should help you understand how to use all the features together to build a complete investment bookkeeping application!

