# TrustBridge WhatsApp Bot 🌉

> Your trusted partner in bridging the gap between traditional finance and the decentralized world.

A comprehensive WhatsApp bot built with TypeScript that provides financial services, user authentication, and secure communication for TrustBridge platform.

## 🚀 Features

- **User Authentication**: Secure credential verification system
- **State Management**: Persistent user session tracking
- **Financial Services**: Transfer funds and transaction history
- **Real-time Exchange Rates**: 
  - FreeCurrencyAPI for fiat currencies (12 supported)
  - CoinMarketCap for cryptocurrency rates
  - Intelligent routing based on currency types
  - 5-minute caching for optimal performance
- **Smart Logging**: Winston-based logging with multiple levels
- **Environment Configuration**: Flexible configuration via environment variables
- **Rate Limiting**: Built-in protection against spam
- **Feature Flags**: Enable/disable features dynamically
- **TypeScript**: Full type safety and modern ES modules
- **Payment Methods**: MASTERCARD and Crypto Wallet support

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- WhatsApp account for bot authentication

## 🛠 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/UGM-Cardano/TrustBridge-Chatbot.git
   cd TrustBridge-Chatbot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` file with your configurations:
   ```env
   NODE_ENV=development
   LOG_LEVEL=info
   WHATSAPP_SESSION_NAME=trustbridge-session
   TRUSTBRIDGE_WEBSITE=https://trustbridge-finance.vercel.app/
   ENABLE_TRANSFER_FEATURE=true
   
   # API Keys for Exchange Rates
   CMC_API_KEY=your_coinmarketcap_api_key_here
   FREECURRENCY_API_KEY=your_freecurrencyapi_key_here
   ```

4. **Get API Keys**
   
   **CoinMarketCap API** (for crypto exchange rates):
   - Visit [CoinMarketCap API](https://pro.coinmarketcap.com/signup/)
   - Sign up for a free account
   - Get your API key from the dashboard
   - Add to `.env` as `CMC_API_KEY`
   
   **FreeCurrencyAPI** (for fiat exchange rates):
   - Visit [FreeCurrencyAPI](https://freecurrencyapi.com/)
   - Sign up for a free account
   - Get your API key from the dashboard
   - Add to `.env` as `FREECURRENCY_API_KEY`

## 🚀 Usage

### Development Mode

**Recommended** (uses compiled version with auto-rebuild):
```bash
npm run dev:compiled
```

**Alternative** (uses ts-node loader - may have compatibility issues):
```bash
npm run dev
```

### Production Mode

**Recommended** (build then run):
```bash
npm run start:compiled
```

**Alternative** (direct ts-node):
```bash
npm start
```

### Build & Run Manually
```bash
# Build TypeScript to JavaScript
npm run build

# Run the compiled version
node ./dist/index.js
```

### Other Commands
```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Clean all build artifacts and sessions
npm run clean

# Clean only WhatsApp sessions
npm run clean:sessions
```

> **Note**: If you encounter issues with `ts-node/esm` loader on Node.js v20+, use the `:compiled` versions of the scripts.

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | `info` |
| `WHATSAPP_SESSION_NAME` | WhatsApp session identifier | `trustbridge-session` |
| `TRUSTBRIDGE_WEBSITE` | Main website URL | `https://trustbridge-finance.vercel.app/` |
| `ENABLE_TRANSFER_FEATURE` | Enable transfer functionality | `true` |
| `MAX_MESSAGES_PER_MINUTE` | Rate limiting | `10` |
| `MAX_LOGIN_ATTEMPTS` | Login attempt limit | `3` |
| `CMC_API_KEY` | CoinMarketCap API key for crypto rates | *(required)* |
| `FREECURRENCY_API_KEY` | FreeCurrencyAPI key for fiat rates | *(required)* |

### Exchange Rate APIs

The bot uses two APIs for real-time exchange rates:

**CoinMarketCap API** - For cryptocurrency exchange rates
- Used for: USDT, ADA, and other crypto conversions
- Free tier: 10,000 calls/month
- Documentation: [CoinMarketCap API Docs](https://coinmarketcap.com/api/documentation/v1/)

**FreeCurrencyAPI** - For fiat currency exchange rates
- Used for: USD, EUR, JPY, SGD, MYR, THB, PHP, BND, CNY, IDR, AUD, CAD
- Free tier: 5,000 calls/month
- Documentation: [FreeCurrencyAPI Docs](https://freecurrencyapi.com/docs/)
- Caching: 5-minute TTL to minimize API calls

**Supported Fiat Currencies** (12 total):
- USD (US Dollar)
- EUR (Euro)
- JPY (Japanese Yen)
- AUD (Australian Dollar)
- CAD (Canadian Dollar)
- SGD (Singapore Dollar)
- MYR (Malaysian Ringgit)
- THB (Thai Baht)
- PHP (Philippine Peso)
- BND (Brunei Dollar)
- CNY (Chinese Yuan)
- IDR (Indonesian Rupiah)

### Feature Flags

Use environment variables to enable/disable features:

- `ENABLE_TRANSFER_FEATURE=false` - Disables transfer functionality

## 📱 Bot Commands

### Initial Authentication
- `hi` / `hello` / `hey` - Start conversation
- `yes` - Existing user login
- `no` - New user registration

### Main Services (Authenticated Users)
- `transfer` - Initiate fund transfer
- `history` - View transaction history
- `settings` - Access account settings

## 🗂 Project Structure

```
├── src/
│   ├── index.ts              # Main bot implementation
│   ├── logger.ts             # Winston logging configuration
│   ├── exchangeRate.ts       # Exchange rate service (CMC + FreeCurrency)
│   ├── fiatExchange.ts       # FreeCurrencyAPI integration
│   ├── testFiatExchange.ts   # Test suite for fiat exchange
│   ├── types/
│   │   ├── index.ts          # Application type definitions
│   │   └── freecurrencyapi.d.ts  # FreeCurrencyAPI type declarations
│   ├── services/             # Service modules
│   │   ├── authService.ts    # Authentication service
│   │   ├── backendService.ts # Backend API integration
│   │   └── pollingService.ts # Polling service
│   └── disabled/             # Disabled/experimental features
├── dist/                     # Compiled JavaScript (auto-generated)
├── logs/                     # Log files (auto-generated)
│   ├── error.log             # Error logs
│   └── combined.log          # All logs
├── .vscode/                  # VS Code configuration
│   ├── settings.json         # Editor settings
│   ├── launch.json           # Debug configuration
│   ├── tasks.json            # Build tasks
│   └── extensions.json       # Recommended extensions
├── .wwebjs_auth/             # WhatsApp authentication data
├── .wwebjs_cache/            # WhatsApp cache data
├── .env                      # Environment variables (local)
├── .env.example              # Environment template
├── .gitignore                # Git ignore rules
├── package.json              # Project dependencies
├── tsconfig.json             # TypeScript configuration
├── nodemon.json              # Nodemon configuration
└── README.md                 # This file
```

## 🔍 Logging

The bot uses Winston for comprehensive logging:

- **Console Logs**: Development mode with colored output
- **File Logs**: Production-ready rotating log files
- **Error Logs**: Separate error log file
- **Structured Logging**: JSON format for easy parsing

Log levels: `error`, `warn`, `info`, `debug`

## 🐛 Debugging

### VS Code Debugging
1. Set breakpoints in your TypeScript code
2. Press `F5` or use "Debug WhatsApp Bot" configuration
3. The debugger will attach to the running process

### Manual Debugging
```bash
# Run with debug logs
LOG_LEVEL=debug npm run dev

# Clean sessions if authentication issues
npm run clean:sessions
```

## 🔒 Security

- Environment variables for sensitive data
- Credential verification system
- Rate limiting protection
- Session isolation
- Comprehensive logging for audit trails

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## � Exchange Rate System

The bot intelligently routes exchange rate requests based on currency types:

### Fiat-to-Fiat Conversions
- **API Used**: FreeCurrencyAPI
- **Example**: USD → EUR, SGD → MYR, JPY → IDR
- **Cache**: 5 minutes
- **Fallback**: Uses USD as intermediate currency if direct pair unavailable

### Crypto Conversions
- **API Used**: CoinMarketCap
- **Example**: USDT → IDR, ADA → USD
- **Cache**: 5 minutes
- **Fallback**: Hardcoded rates for USDT↔IDR if API fails

### Payment Methods

**MASTERCARD Payment**
- Supports all 12 fiat currencies
- Uses FreeCurrencyAPI for exchange rates
- Collects card details: number, CVC, expiry

**WALLET Payment**
- Supports USDT and ADA
- Uses CoinMarketCap for exchange rates
- Direct blockchain transfer

## �📄 License

This project is licensed under the ISC License.

## 🆘 Troubleshooting

### Common Issues

1. **QR Code not scanning**
   ```bash
   npm run clean:sessions
   npm run dev:compiled
   ```

2. **TypeScript compilation errors**
   ```bash
   npm run lint:fix
   npm run build
   ```

3. **ts-node/esm loader crashes (Node v20+)**
   ```bash
   # Use compiled version instead
   npm run dev:compiled
   # or
   npm run start:compiled
   ```

4. **Exchange rate API errors**
   - Verify `CMC_API_KEY` is set in `.env`
   - Verify `FREECURRENCY_API_KEY` is set in `.env`
   - Check API key validity on respective platforms
   - Review `logs/combined.log` for detailed error messages
   - Free tier limits: CMC (10k/month), FreeCurrency (5k/month)

5. **Authentication failures**
   - Check WhatsApp is properly connected
   - Verify QR code scanning
   - Clean sessions and retry: `npm run clean:sessions`

6. **Module resolution errors**
   - Ensure Node.js version 18+
   - Check `type: "module"` in package.json
   - Verify TypeScript configuration
   - Try rebuilding: `npm run build`

### Testing Exchange Rates

Test the fiat exchange integration:
```bash
# Run test suite
npm run build
node ./dist/testFiatExchange.js
```

Expected output:
- USD→EUR conversion
- USD→SGD conversion
- 100 USD to IDR conversion
- EUR→JPY conversion (via USD fallback)
- Cache statistics

### Support

For support and questions:
- Check the logs in `logs/` directory
- Review environment configuration
- Ensure all dependencies are installed
- Verify API keys are valid
- Contact the development team

