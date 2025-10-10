# Backend API Integration Reference

## Quick Start

### Import Services
```typescript
import { BackendService } from './services/backendService.js';
import { AuthService } from './services/authService.js';
import { PollingService } from './services/pollingService.js';
```

### Initialize Polling Service
```typescript
// In your main file after client is ready
client.on('ready', () => {
  PollingService.initialize(client);
});
```

---

## BackendService API

### Authentication
```typescript
// Auto-login/register user
const authResponse = await BackendService.authenticate(
  whatsappNumber,  // e.g., "628123456789"
  countryCode      // e.g., "+62" (optional)
);

// Clear auth cache (logout)
BackendService.clearAuth(whatsappNumber);
```

### Calculate Transfer
```typescript
const calculation = await BackendService.calculateTransfer(
  'USDT',           // senderCurrency
  'IDR',            // recipientCurrency
  100,              // amount
  'WALLET'          // paymentMethod
);

// Returns:
// {
//   senderAmount: 100,
//   recipientAmount: 1562960,
//   exchangeRate: 15629.6,
//   fee: { percentage: 1.0, amount: 1.0 },
//   totalAmount: 101
// }
```

### Create Transaction
```typescript
const request = {
  recipientPhone: '+628123456789',
  sourceCurrency: 'USDT',
  targetCurrency: 'IDR',
  sourceAmount: 100,
  recipientBankAccount: '1234567890',
  recipientName: 'John Doe',
  paymentMethod: 'WALLET',
  // For MASTERCARD:
  // paymentMethod: 'MASTERCARD',
  // card: {
  //   number: '4111111111111111',
  //   cvc: '123',
  //   expiry: '12/25'
  // }
};

const transaction = await BackendService.createTransaction(
  whatsappNumber,
  request
);

// Returns Transaction object with:
// - id: transaction ID
// - status: 'PENDING'
// - paymentLink: payment URL (for WALLET method)
// - etc.
```

### Get Transaction Status
```typescript
const status = await BackendService.getTransactionStatus(transferId);

// Returns:
// {
//   transferId: 'TXN-xxx',
//   status: 'COMPLETED',
//   blockchainTx: 'https://cardanoscan.io/...'
// }
```

---

## AuthService API

### Login or Register
```typescript
// Auto-login user (creates session)
const user = await AuthService.loginOrRegister(whatsappNumber);

// Returns User object with:
// - id: user ID in backend
// - whatsappNumber: phone number
// - status: 'PENDING_KYC' | 'VERIFIED' | 'SUSPENDED'
```

### Ensure Authenticated
```typescript
// Use before any backend operation
await AuthService.ensureAuthenticated(whatsappNumber);
// Automatically logs in if no session exists
```

### Get User Info
```typescript
const user = AuthService.getUser(whatsappNumber);
// Returns User object or null if not authenticated
```

### Get Access Token
```typescript
const token = await AuthService.getAccessToken(whatsappNumber);
// Returns valid JWT token (auto-refreshes if needed)
```

### Logout
```typescript
AuthService.logout(whatsappNumber);
// Clears session and tokens
```

### Session Management
```typescript
// Get session count
const count = AuthService.getSessionCount();

// Get active users
const users = AuthService.getActiveSessions();

// Clear all sessions (for testing)
AuthService.clearAllSessions();
```

---

## PollingService API

### Initialize
```typescript
// Call once when WhatsApp client is ready
PollingService.initialize(whatsappClient);
```

### Start Polling
```typescript
// Start monitoring transaction status
PollingService.startPolling(
  transferId,  // Transaction ID to monitor
  chatId       // WhatsApp chat ID to send updates
);

// Automatically sends WhatsApp messages on status changes:
// - PAID: Payment confirmed
// - PROCESSING: Processing on blockchain
// - COMPLETED: Transfer successful
// - FAILED: Transaction failed
// - CANCELLED: Transaction cancelled
```

### Stop Polling
```typescript
// Manually stop polling for a transaction
PollingService.stopPolling(transferId);
```

### Monitor Polling
```typescript
// Get active polling count
const count = PollingService.getActiveTasksCount();

// Get all active transfer IDs
const transfers = PollingService.getActiveTransfers();
```

### Cleanup
```typescript
// Stop all polling (on shutdown)
PollingService.stopAll();
```

---

## Configuration

### Environment Variables
```env
# Backend API
BACKEND_API_URL=https://api-trustbridge.izcy.tech
BACKEND_API_TIMEOUT=30000

# WhatsApp
WHATSAPP_SESSION_NAME=trustbridge-session

# Optional
NODE_ENV=production
LOG_LEVEL=info
```

### Polling Configuration
Configured in `pollingService.ts`:
- **Poll Interval**: 15 seconds
- **Max Duration**: 30 minutes
- **Max Poll Count**: 120 attempts

---

## Error Handling

### Try-Catch Pattern
```typescript
try {
  await AuthService.ensureAuthenticated(whatsappNumber);
  const tx = await BackendService.createTransaction(whatsappNumber, request);
  PollingService.startPolling(tx.id, chatId);
  await message.reply('✅ Transaction created!');
} catch (error) {
  const msg = error instanceof Error ? error.message : 'Unknown error';
  logger.error('Transaction error:', msg);
  await message.reply(`❌ Failed: ${msg}`);
}
```

### Backend Errors
Backend errors are automatically logged with:
- HTTP status code
- Error message
- Full error response

Auth tokens are automatically cleared on 401 errors.

---

## Example: Complete Transfer Flow

```typescript
import { BackendService } from './services/backendService.js';
import { AuthService } from './services/authService.js';
import { PollingService } from './services/pollingService.js';

async function handleTransferConfirmation(
  message: Message,
  chatId: string,
  transferData: TransferData
) {
  try {
    // 1. Extract WhatsApp number
    const whatsappNumber = chatId.replace('@c.us', '');

    // 2. Authenticate user
    await message.reply('🔐 Authenticating...');
    await AuthService.ensureAuthenticated(whatsappNumber);

    // 3. Prepare transaction request
    const request = {
      recipientPhone: `+${whatsappNumber}`,
      sourceCurrency: transferData.senderCurrency,
      targetCurrency: transferData.recipientCurrency,
      sourceAmount: parseFloat(transferData.amount),
      recipientBankAccount: transferData.recipientAccount,
      recipientName: transferData.recipientName,
      paymentMethod: transferData.paymentMethod,
      ...(transferData.card && { card: transferData.card })
    };

    // 4. Create transaction
    await message.reply('💳 Creating transaction...');
    const tx = await BackendService.createTransaction(whatsappNumber, request);

    // 5. Send success message
    let response = `✅ Transaction created!\n\n`;
    response += `ID: ${tx.id}\n`;
    response += `Status: ${tx.status}\n`;
    if (tx.paymentLink) {
      response += `\n💳 Payment Link:\n${tx.paymentLink}\n`;
    }
    response += `\n🔔 You'll receive status updates automatically.`;

    await message.reply(response);

    // 6. Start status monitoring
    PollingService.startPolling(tx.id, chatId);

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Transfer error:', msg);
    await message.reply(`❌ Failed: ${msg}`);
  }
}
```

---

## Testing

### Test Authentication
```typescript
const whatsappNumber = '628123456789';
const user = await AuthService.loginOrRegister(whatsappNumber);
console.log('User authenticated:', user);
```

### Test Transaction Creation
```typescript
const request = {
  recipientPhone: '+628123456789',
  sourceCurrency: 'USDT',
  targetCurrency: 'IDR',
  sourceAmount: 100,
  recipientBankAccount: '1234567890',
  recipientName: 'Test User',
  paymentMethod: 'WALLET'
};

const tx = await BackendService.createTransaction('628123456789', request);
console.log('Transaction created:', tx);
```

### Test Status Polling
```typescript
PollingService.initialize(client);
PollingService.startPolling('TXN-test-123', '628123456789@c.us');

// Wait and observe console logs for status updates
```

---

## Debugging

### Enable Debug Logs
```env
LOG_LEVEL=debug
```

### Check Authentication
```typescript
const sessions = AuthService.getActiveSessions();
console.log('Active sessions:', sessions);
```

### Check Polling Status
```typescript
const count = PollingService.getActiveTasksCount();
const transfers = PollingService.getActiveTransfers();
console.log(`Polling ${count} transactions:`, transfers);
```

### View Logs
```bash
tail -f logs/combined.log
tail -f logs/error.log
```

---

## Best Practices

1. **Always Authenticate First**
   ```typescript
   await AuthService.ensureAuthenticated(whatsappNumber);
   ```

2. **Handle Errors Gracefully**
   ```typescript
   try {
     // ... backend calls
   } catch (error) {
     // Show user-friendly message
     await message.reply('❌ Something went wrong. Please try again.');
   }
   ```

3. **Start Polling After Transaction**
   ```typescript
   const tx = await BackendService.createTransaction(...);
   PollingService.startPolling(tx.id, chatId);
   ```

4. **Clean Up on Shutdown**
   ```typescript
   process.on('SIGINT', () => {
     PollingService.stopAll();
     process.exit(0);
   });
   ```

---

## API Endpoints Reference

### POST /api/auth/login
**Request:**
```json
{
  "whatsappNumber": "628123456789",
  "countryCode": "+62"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "user-123",
    "whatsappNumber": "628123456789",
    "status": "VERIFIED"
  },
  "tokens": {
    "accessToken": "jwt-token",
    "refreshToken": "refresh-token"
  }
}
```

### POST /api/transfer/initiate
**Request:**
```json
{
  "paymentMethod": "WALLET",
  "senderCurrency": "USDT",
  "senderAmount": 100,
  "recipientName": "John Doe",
  "recipientCurrency": "IDR",
  "recipientBank": "BCA",
  "recipientAccount": "1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "TXN-xxx",
    "status": "pending",
    "paymentLink": "https://payment.link/xxx",
    "sender": {
      "currency": "USDT",
      "amount": 100,
      "totalAmount": 101
    },
    "recipient": {
      "name": "John Doe",
      "currency": "IDR",
      "expectedAmount": 1562960,
      "bank": "BCA",
      "account": "1234567890"
    },
    "fees": {
      "percentage": 1.0,
      "amount": 1.0
    },
    "createdAt": "2025-10-09T12:00:00Z"
  }
}
```

### GET /api/transfer/status/:transferId
**Response:**
```json
{
  "success": true,
  "data": {
    "transferId": "TXN-xxx",
    "status": "completed",
    "blockchainTx": "https://cardanoscan.io/transaction/xxx",
    "completedAt": "2025-10-09T12:05:00Z"
  }
}
```

---

*Last Updated: 2025-10-09*
*Backend API: https://api-trustbridge.izcy.tech/*
