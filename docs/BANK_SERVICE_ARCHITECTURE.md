# Bank Account Service Architecture

## Overview

The bank account system uses a **service interface pattern** that allows swapping between real and fake implementations based on environment configuration. This keeps production code clean and separates testing/staging functionality.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Bank Routes (bank.ts)                  │
│  - Handles HTTP requests                                │
│  - Validates input                                       │
│  - Calls service interface                              │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│         Bank Account Service Factory                    │
│  - Selects implementation based on env                   │
│  - Returns IBankAccountService instance                 │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌──────────────────┐        ┌──────────────────┐
│ Real Service     │        │ Fake Service     │
│ (Production)     │        │ (Staging/Alpha)  │
│                  │        │                  │
│ - Plaid          │        │ - Instant verify │
│ - Synctera       │        │ - Instant load   │
│ - Real ACH       │        │ - Instant redeem │
└──────────────────┘        └──────────────────┘
```

## Service Interface

All bank account services implement `IBankAccountService`:

```typescript
interface IBankAccountService {
  createAccount(input, user, request): Promise<BankAccountResult>;
  processLoad(bankAccount, user, amount, key, request): Promise<LoadRedeemResult>;
  processRedeem(bankAccount, user, amount, key, request): Promise<LoadRedeemResult>;
  isAvailable(): boolean;
}
```

## Environment Configuration

### Environment Variables

- **`BANK_SERVICE_MODE`**: Explicitly set service mode
  - `'real'` → Always use RealBankAccountService
  - `'fake'` → Always use FakeBankAccountService
  - Unset → Auto-select based on NODE_ENV

- **`NODE_ENV`**: Environment mode
  - `'production'` → Always use RealBankAccountService
  - `'staging'` → Use FakeBankAccountService (if available)
  - `'development'` → Use FakeBankAccountService (if available)

### Selection Logic

```typescript
if (BANK_SERVICE_MODE === 'fake') → FakeBankAccountService
if (BANK_SERVICE_MODE === 'real') → RealBankAccountService
if (NODE_ENV === 'production') → RealBankAccountService
if (NODE_ENV === 'staging' || 'development') → FakeBankAccountService (if available)
else → RealBankAccountService (fallback)
```

## File Structure

```
src/services/
├── bankAccountService.ts          # Interface definition
├── bankAccountService.real.ts     # Production implementation
├── bankAccountService.fake.ts     # Staging/alpha implementation
└── bankAccountService.factory.ts  # Factory for selecting service
```

## Usage in Routes

```typescript
import { getBankAccountService } from '../services/bankAccountService.factory.js';

// Get the appropriate service
const bankService = getBankAccountService();

// Use it
const result = await bankService.createAccount(input, user, request);
const loadResult = await bankService.processLoad(bankAccount, user, amount, key, request);
```

## Benefits

1. **Clean Separation**: Fake account code is completely isolated
2. **Easy Testing**: Can swap implementations for tests
3. **Environment-Specific**: Automatically uses correct service per environment
4. **Type Safety**: Interface ensures consistent API
5. **No Production Risk**: Fake service can't accidentally run in production

## Adding New Implementations

To add a new bank account service (e.g., for a different provider):

1. Create `bankAccountService.{name}.ts`
2. Implement `IBankAccountService` interface
3. Update factory to include new service
4. Add environment variable/configuration

## Migration Notes

- Old inline fake account logic has been moved to `FakeBankAccountService`
- Routes now use service interface instead of direct implementation
- No breaking changes to API endpoints
- Existing fake accounts continue to work

---

*Last Updated: December 2024*

