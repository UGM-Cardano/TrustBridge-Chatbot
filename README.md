# TrustBridge WhatsApp Bot 🌉

> Your trusted partner in bridging the gap between traditional finance and the decentralized world.

A comprehensive WhatsApp bot built with TypeScript that provides financial services, user authentication, and secure communication for TrustBridge platform.

## 🚀 Features

- **User Authentication**: Secure credential verification system
- **State Management**: Persistent user session tracking
- **Financial Services**: Balance checking, transfers, transaction history
- **Smart Logging**: Winston-based logging with multiple levels
- **Environment Configuration**: Flexible configuration via environment variables
- **Rate Limiting**: Built-in protection against spam
- **Feature Flags**: Enable/disable features dynamically
- **Sticker Creation**: Convert images to WhatsApp stickers
- **TypeScript**: Full type safety and modern ES modules

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- WhatsApp account for bot authentication

## 🛠 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-chatbot
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
   ENABLE_STICKER_FEATURE=true
   ENABLE_TRANSFER_FEATURE=true
   ENABLE_BALANCE_CHECK=true
   ```

## 🚀 Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
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

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | `info` |
| `WHATSAPP_SESSION_NAME` | WhatsApp session identifier | `trustbridge-session` |
| `TRUSTBRIDGE_WEBSITE` | Main website URL | `https://trustbridge-finance.vercel.app/` |
| `ENABLE_STICKER_FEATURE` | Enable sticker creation | `true` |
| `ENABLE_TRANSFER_FEATURE` | Enable transfer functionality | `true` |
| `ENABLE_BALANCE_CHECK` | Enable balance checking | `true` |
| `MAX_MESSAGES_PER_MINUTE` | Rate limiting | `10` |
| `MAX_LOGIN_ATTEMPTS` | Login attempt limit | `3` |

### Feature Flags

Use environment variables to enable/disable features:

- `ENABLE_STICKER_FEATURE=false` - Disables sticker creation
- `ENABLE_TRANSFER_FEATURE=false` - Disables transfer functionality
- `ENABLE_BALANCE_CHECK=false` - Disables balance checking

## 📱 Bot Commands

### Initial Authentication
- `hi` / `hello` / `hey` - Start conversation
- `yes` - Existing user login
- `no` - New user registration

### Main Services (Authenticated Users)
- `balance` - Check account balance
- `transfer` - Initiate fund transfer
- `history` - View transaction history
- `settings` - Access account settings

### Special Features
- `!sticker` + image - Convert image to sticker

## 🗂 Project Structure

```
├── src/
│   ├── index.ts          # Main bot implementation
│   └── logger.ts         # Winston logging configuration
├── logs/                 # Log files (auto-generated)
│   ├── error.log         # Error logs
│   └── combined.log      # All logs
├── .vscode/              # VS Code configuration
│   ├── settings.json     # Editor settings
│   ├── launch.json       # Debug configuration
│   ├── tasks.json        # Build tasks
│   └── extensions.json   # Recommended extensions
├── .wwebjs_auth/         # WhatsApp authentication data
├── .wwebjs_cache/        # WhatsApp cache data
├── .env                  # Environment variables (local)
├── .env.example          # Environment template
├── .gitignore           # Git ignore rules
├── package.json         # Project dependencies
├── tsconfig.json        # TypeScript configuration
├── nodemon.json         # Nodemon configuration
└── README.md           # This file
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

## 📄 License

This project is licensed under the ISC License.

## 🆘 Troubleshooting

### Common Issues

1. **QR Code not scanning**
   ```bash
   npm run clean:sessions
   npm run dev
   ```

2. **TypeScript compilation errors**
   ```bash
   npm run lint:fix
   ```

3. **Authentication failures**
   - Check WhatsApp is properly connected
   - Verify QR code scanning
   - Clean sessions and retry

4. **Module resolution errors**
   - Ensure Node.js version 18+
   - Check `type: "module"` in package.json
   - Verify TypeScript configuration

### Support

For support and questions:
- Check the logs in `logs/` directory
- Review environment configuration
- Ensure all dependencies are installed
- Contact the development team

---

Built with ❤️ for TrustBridge Finance Platform