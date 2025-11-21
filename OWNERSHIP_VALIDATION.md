# Resource Ownership Validation

This document explains the resource ownership validation system implemented in the Trackvest API.

## Overview

All endpoints now require user authentication and validate that users can only access resources they own. This prevents unauthorized access to other users' data.

## How It Works

### 1. User Context Extraction

The `@CurrentUser()` decorator extracts the user ID from the request:
- **Header**: `X-User-Id` (preferred)
- **Query Parameter**: `userId` (fallback)

```typescript
@Get(':id')
async findOne(
  @Param('id') id: string,
  @CurrentUser() userId: string,  // Extracts user ID from request
): Promise<AccountResponseDto> {
  return this.svc.findOne(id, userId)
}
```

### 2. Ownership Validation Service

The `OwnershipService` provides centralized validation methods:

- `validateAccountOwnership(accountId, userId)` - Validates account belongs to user
- `validateTransactionOwnership(transactionId, userId)` - Validates transaction belongs to user (via account)
- `validateGlAccountOwnership(glAccountId, userId)` - Validates GL account belongs to user
- `validateGlEntryOwnership(glEntryId, userId)` - Validates GL entry belongs to user
- `validateTagOwnership(tagId, userId)` - Validates tag belongs to user
- `validateUserExists(userId)` - Validates user exists

### 3. Service Layer Changes

All service methods now require `userId` parameter and validate ownership:

**Before:**
```typescript
async findOne(id: string) {
  const acc = await this.prisma.account.findUnique({ where: { id } })
  if (!acc) throw new NotFoundException('Account not found')
  return acc
}
```

**After:**
```typescript
async findOne(id: string, userId: string) {
  // Validate ownership
  await this.ownershipService.validateAccountOwnership(id, userId)
  
  const acc = await this.prisma.account.findUnique({ where: { id } })
  if (!acc) throw new NotFoundException('Account not found')
  return acc
}
```

## Updated Endpoints

### Accounts
- `GET /accounts` - Returns only user's accounts
- `GET /accounts/:id` - Validates ownership
- `POST /accounts` - Validates userId matches authenticated user
- `PATCH /accounts/:id` - Validates ownership
- `DELETE /accounts/:id` - Validates ownership

### Transactions
- `GET /transactions` - Returns only transactions from user's accounts
- `GET /transactions/:id` - Validates ownership (via account)
- `POST /transactions` - Validates account belongs to user
- `PATCH /transactions/:id` - Validates ownership and new account (if updated)
- `DELETE /transactions/:id` - Validates ownership
- `DELETE /transactions/:id/hard` - Validates ownership

### GL Ledger
- `POST /gl/transfer` - Validates GL account ownership
- `POST /gl/expense` - Validates GL account ownership
- `POST /gl/income` - Validates GL account ownership

## Usage Examples

### Frontend Request

```typescript
// Using header (recommended)
const response = await fetch('http://localhost:3000/accounts', {
  headers: {
    'X-User-Id': 'user-uuid-here',
    'Content-Type': 'application/json',
  },
})

// Using query parameter (fallback)
const response = await fetch('http://localhost:3000/accounts?userId=user-uuid-here')
```

### Testing with cURL

```bash
# Get user's accounts
curl -H "X-User-Id: user-uuid-here" http://localhost:3000/accounts

# Create account
curl -X POST \
  -H "X-User-Id: user-uuid-here" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-uuid-here","name":"My Account","type":"broker","currency":"TWD"}' \
  http://localhost:3000/accounts
```

## Error Responses

### Unauthorized (401)
When user ID is missing:
```json
{
  "statusCode": 401,
  "message": "User ID is required. Provide it via X-User-Id header or userId query parameter."
}
```

### Forbidden (403)
When user tries to access resource they don't own:
```json
{
  "statusCode": 403,
  "message": "You do not have access to this account"
}
```

### Not Found (404)
When resource doesn't exist or user doesn't own it:
```json
{
  "statusCode": 404,
  "message": "Account not found"
}
```

## Security Notes

1. **Current Implementation**: Uses header/query parameter for user ID (temporary solution)
2. **Future Enhancement**: Should be replaced with JWT authentication
3. **All Endpoints Protected**: Every endpoint that accesses user data now validates ownership
4. **Automatic Filtering**: List endpoints automatically filter by user ID

## Migration Notes

- All existing API calls need to include `X-User-Id` header
- User ID is now required for all resource operations
- DTOs still accept `userId` but it must match the authenticated user

## Next Steps

1. Implement JWT authentication to replace header-based user ID
2. Add role-based access control (admin vs user)
3. Add audit logging for ownership violations
4. Consider adding rate limiting per user

