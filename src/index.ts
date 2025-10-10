import 'dotenv/config';
import pkg from 'whatsapp-web.js';
import type { Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import logger from './logger.js';
import {
  getExchangeRate,
  calculateRecipientAmount,
  getCurrentRates,
  testCMCConnection,
  FALLBACK_RATES,
  getCacheStats,
  clearExchangeRateCache,
  forceRefreshRates
} from './exchangeRate.js';
import { SUPPORTED_FIAT } from './fiatExchange.js';
import { BackendService } from './services/backendService.js';
import { AuthService } from './services/authService.js';
import { PollingService } from './services/pollingService.js';

// Supported mock tokens for WALLET payment
const SUPPORTED_MOCK_TOKENS = ['mockADA', 'mockUSDC', 'mockIDRX', 'mockEUROC', 'mockJPYC', 'mockCNHT', 'mockMXNT'];

const { Client, LocalAuth } = pkg;

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: process.env.WHATSAPP_SESSION_NAME || 'trustbridge-session'
    }),
});

interface UserState {
  awaitingInterruptConfirmation?: {
    type: 'greeting' | 'menu';
    originalMessage: string;
  };
  transferFlow?: {
    step: 
      | 'payment_method'
      | 'sender_currency'
      | 'recipient_name'
      | 'recipient_currency'
      | 'recipient_bank'
      | 'recipient_account'
      | 'amount'
      | 'card_number'
      | 'card_cvc'
      | 'card_expiry'
      | 'confirmation';
    data: {
      paymentMethod?: 'WALLET' | 'MASTERCARD';
      recipientName?: string;
      recipientCurrency?: string;
      recipientBank?: string;
      recipientAccount?: string;
      senderCurrency?: string; 
      amount?: string;
      // Card fields (only for MASTERCARD)
      cardNumber?: string;
      cardCvc?: string;
      cardExpiry?: string;
    };
  };
}

const userStates = new Map<string, UserState>();

// Helper function to get or create user state
function getUserState(chatId: string): UserState {
  if (!userStates.has(chatId)) {
    userStates.set(chatId, {
      // No authentication required
    });
  }
  return userStates.get(chatId)!;
}

// Function to calculate transfer fees (mock implementation)
function calculateTransferFee(amount: number): { fee: number; feePercentage: number } {
  // Mock fee structure - in production this would be based on real fee schedules
  const feePercentage = 0.015; // 1.5% fee
  const fee = amount * feePercentage;
  return { fee, feePercentage };
}

// Supported fiat currencies are now imported from fiatExchange.ts
// SUPPORTED_FIAT is imported at the top of this file



// Helper function to handle transfer flow
async function handleTransferFlow(message: Message, userState: UserState, chatId: string) {
  if (!userState.transferFlow) return false;

  const { step, data } = userState.transferFlow;
  const userInput = message.body.trim();

  // Handle "back" command
  if (userInput.toLowerCase() === 'back') {
    switch (step) {
      case 'recipient_name':
        // Can't go back from first step, cancel transfer instead
        delete userState.transferFlow;
        logger.info(`User ${chatId} cancelled transfer from recipient_name step`);
        await message.reply(`❌ Transfer cancelled.

📋 Available services:
• Type "transfer" - Start a new transfer
• Type "history" - View transaction history
• Type "help" - List available commands`);
        return true;

      case 'recipient_currency':
        // Go back to recipient name
        userState.transferFlow.step = 'recipient_name';
        delete data.recipientName; // Clear previous input
        logger.info(`User ${chatId} went back to recipient_name step`);
        await message.reply(`👤 Back to recipient name entry.

Please provide the recipient's full name:
💡 Type "back" to cancel transfer`);
        return true;

      case 'recipient_bank':
        // Go back to recipient currency
        userState.transferFlow.step = 'recipient_currency';
        delete data.recipientCurrency; // Clear previous input
        logger.info(`User ${chatId} went back to recipient_currency step`);
        await message.reply(`💱 Back to currency selection.

What currency should the recipient receive?

Available option:
• IDR - Indonesian Rupiah

Coming soon:
• SGD - Singapore Dollar
• MYR - Malaysian Ringgit
• THB - Thai Baht
• PHP - Philippine Peso
• BND - Brunei Dollar

💡 Type "back" to change recipient name`);
        return true;

      case 'recipient_account':
        // Go back to recipient bank
        userState.transferFlow.step = 'recipient_bank';
        delete data.recipientBank; // Clear previous input
        logger.info(`User ${chatId} went back to recipient_bank step`);
        await message.reply(`🏦 Back to bank name entry.

Please provide the recipient's bank name (e.g., BCA, Mandiri, BNI, etc.):
💡 Type "back" to change currency`);
        return true;

      case 'amount':
        // Go back to recipient account
        userState.transferFlow.step = 'recipient_account';
        delete data.recipientAccount; // Clear previous input
        delete data.senderCurrency; // Clear auto-set USDT
        logger.info(`User ${chatId} went back to recipient_account step`);
        await message.reply(`🔢 Back to account number entry.

Please provide the recipient's account number:
💡 Type "back" to change bank name`);
        return true;

      case 'confirmation':
        // Go back to amount
        userState.transferFlow.step = 'amount';
        delete data.amount; // Clear previous input
        logger.info(`User ${chatId} went back to amount step`);
    await message.reply(`💰 Back to amount entry.

  How much ${data.senderCurrency || 'USDT'} would you like to transfer?
  💡 Type "back" to change account number`);
        return true;
    }
  }

  switch (step) {
    case 'payment_method': {
      const pm = userInput.toUpperCase();
      if (pm !== 'WALLET' && pm !== 'MASTERCARD') {
        await message.reply(`❌ Invalid payment method. Please type either "WALLET" or "MASTERCARD".`);
        return true;
      }
      data.paymentMethod = pm as 'WALLET' | 'MASTERCARD';
      logger.info(`User ${chatId} selected payment method: ${pm}`);

      // Both WALLET and MASTERCARD continue with form flow
      userState.transferFlow!.step = 'recipient_name';
      await message.reply(`👤 Please provide the recipient's full name:\n💡 Type "back" to cancel transfer`);
      return true;
    }
    case 'recipient_name':
      data.recipientName = userInput;
      userState.transferFlow.step = 'recipient_currency';
      logger.info(`User ${chatId} provided recipient name: ${userInput}`);
      await message.reply(`💱 Great! What currency should the recipient receive?

Available option:
• IDR - Indonesian Rupiah

Coming soon:
• SGD - Singapore Dollar
• MYR - Malaysian Ringgit
• THB - Thai Baht
• PHP - Philippine Peso
• BND - Brunei Dollar

Please type "IDR":
💡 Type "back" to change recipient name`);
      return true;

    case 'recipient_currency': {
      const currency = userInput.toUpperCase();
      if (currency !== 'IDR') {
        await message.reply(`❌ Please choose IDR (Indonesian Rupiah) as the recipient currency.

💡 Type "back" to change recipient name`);
        return true;
      }
      data.recipientCurrency = currency;
      userState.transferFlow.step = 'recipient_bank';
      logger.info(`User ${chatId} selected recipient currency: ${currency}`);
      await message.reply(`🏦 Perfect! Now please provide the recipient's bank name (e.g., BCA, Mandiri, BNI, etc.):

💡 Type "back" to change currency`);
      return true;
    }

    case 'recipient_bank':
      data.recipientBank = userInput;
      userState.transferFlow.step = 'recipient_account';
      logger.info(`User ${chatId} provided recipient bank: ${userInput}`);
      await message.reply(`🔢 Excellent! Now please provide the recipient's account number:

💡 Type "back" to change bank name`);
      return true;

    case 'recipient_account':
      // Simple validation for account number (should be numbers)
      if (!/^\d+$/.test(userInput)) {
        await message.reply(`❌ Account number should only contain numbers. Please try again:

💡 Type "back" to change bank name`);
        return true;
      }
      data.recipientAccount = userInput;
      // If paying by card, ask which fiat currency they'll use (Mastercard supports fiat)
      if (data.paymentMethod === 'MASTERCARD') {
        userState.transferFlow.step = 'sender_currency';
        logger.info(`User ${chatId} provided recipient account and will pay by card: ${userInput}`);
        await message.reply(`🌍 Which currency will you pay with? Choose one of: ${SUPPORTED_FIAT.join(', ')}\n\nPlease type the 3-letter code (e.g. USD).`);
      } else {
        // Wallet: allow mock tokens
        userState.transferFlow.step = 'sender_currency';
        logger.info(`User ${chatId} provided recipient account and will pay from wallet: ${userInput}`);
        await message.reply(`🪙 Which mock token will you send?\n\nAvailable tokens:\n${SUPPORTED_MOCK_TOKENS.map(t => `• ${t}`).join('\n')}\n\nPlease type the token name (e.g. mockADA):`);
      }
      return true;

    case 'amount': {
      // Simple validation for amount (should be a positive number)
      const amount = parseFloat(userInput);
      if (isNaN(amount) || amount <= 0) {
        await message.reply(`❌ Please enter a valid amount (positive number only):

💡 Type "back" to change account number`);
        return true;
      }
      data.amount = userInput;
      userState.transferFlow.step = 'confirmation';
      logger.info(`User ${chatId} provided amount: ${userInput}`);
      
      try {
        // Calculate exchange rate and recipient amount
        const senderAmount = parseFloat(userInput);
        const exchangeRate = await getExchangeRate(data.senderCurrency!, data.recipientCurrency!);
        const recipientAmount = await calculateRecipientAmount(senderAmount, data.senderCurrency!, data.recipientCurrency!);
        const { fee, feePercentage } = calculateTransferFee(senderAmount);
        const totalAmount = senderAmount + fee;
        
  // Format numbers for display (Indonesian locale)
  // Use 3 decimal places for both rate and recipient display to match example: "Rp 16.540,532"
  const idrCurrency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const idrRateFormatter = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  const formattedRate = idrRateFormatter.format(exchangeRate); // e.g. 16.540,532
  // Use currency formatter for recipient amount (adds Rp symbol)
  let formattedRecipientAmount = idrCurrency.format(recipientAmount); // e.g. Rp16.540,532
  // Ensure a normal space after Rp for readability (Intl may return a non-breaking space)
  formattedRecipientAmount = formattedRecipientAmount.replace(/^Rp\s?/, 'Rp ');

  const formattedFee = `${fee.toFixed(2)} ${data.senderCurrency}`;
  const formattedTotal = `${totalAmount.toFixed(2)} ${data.senderCurrency}`;
        
        // Show confirmation with exchange rate
        let confirmationMessage = `📋 Please confirm your transfer details:

👤 Recipient Name: ${data.recipientName}
💱 Recipient Currency: ${data.recipientCurrency}
🏦 Bank: ${data.recipientBank}
🔢 Account Number: ${data.recipientAccount}
💱 Sender Currency: ${data.senderCurrency}
💰 Amount: ${data.amount} ${data.senderCurrency}`;

        // Add exchange rate info if currencies are different
        if (data.senderCurrency !== data.recipientCurrency) {
          confirmationMessage += `

📊 Exchange Rate Information:
💱 Rate: 1 ${data.senderCurrency} = ${formattedRate} ${data.recipientCurrency}
💰 Recipient will receive: ${formattedRecipientAmount} ${data.recipientCurrency}`;
        }

  // Add fee information
  confirmationMessage += `

💳 Fee Information:
📊 Transfer Fee (${(feePercentage * 100).toFixed(1)}%): ${formattedFee}
💰 Total Amount: ${formattedTotal}`;

        confirmationMessage += `

Type "confirm" to proceed, "cancel" to abort, or "back" to change amount.`;

        await message.reply(confirmationMessage);
        return true;
      } catch (error) {
        logger.error('Error calculating exchange rate:', error);
        await message.reply('❌ Sorry, there was an error calculating the exchange rate. Please try again or contact support.');
        delete userState.transferFlow;
        return true;
      }
    }

    case 'card_number': {
      const digits = userInput.replace(/\s+/g, '');
      if (!/^\d{13,19}$/.test(digits)) {
        await message.reply(`❌ Invalid card number. Please enter digits only (13-19 digits).`);
        return true;
      }
      data.cardNumber = digits;
      userState.transferFlow.step = 'card_cvc';
      await message.reply(`🔒 Enter CVC (3 or 4 digits):`);
      return true;
    }

    case 'card_cvc': {
      if (!/^\d{3,4}$/.test(userInput)) {
        await message.reply(`❌ Invalid CVC. Please enter 3 or 4 digits.`);
        return true;
      }
      data.cardCvc = userInput;
      userState.transferFlow.step = 'card_expiry';
      await message.reply(`📅 Enter card expiry (MM/YY or MM/YYYY):`);
      return true;
    }

    case 'card_expiry': {
      if (!/^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/.test(userInput)) {
        await message.reply(`❌ Invalid expiry format. Use MM/YY or MM/YYYY.`);
        return true;
      }
      data.cardExpiry = userInput;
      // After collecting card, ask for amount
      userState.transferFlow.step = 'amount';
  await message.reply(`💰 Card saved. How much ${data.senderCurrency || 'USDT'} would you like to transfer?

💡 Type "back" to change account number`);
      return true;
    }

    case 'sender_currency': {
      const code = userInput;
      // Validation differs for MASTERCARD (fiat list) vs WALLET (mock tokens)
      if (data.paymentMethod === 'MASTERCARD') {
        const upperCode = code.toUpperCase();
        if (!SUPPORTED_FIAT.includes(upperCode)) {
          await message.reply(`❌ Unsupported currency. Please choose one of: ${SUPPORTED_FIAT.join(', ')}`);
          return true;
        }
        data.senderCurrency = upperCode;
      } else {
        // WALLET: validate mock token
        if (!SUPPORTED_MOCK_TOKENS.includes(code)) {
          await message.reply(`❌ Unsupported token. Please choose one of:\n${SUPPORTED_MOCK_TOKENS.map(t => `• ${t}`).join('\n')}`);
          return true;
        }
        data.senderCurrency = code;
      }

      // After choosing fiat for Mastercard, collect card details
      if (data.paymentMethod === 'MASTERCARD') {
        userState.transferFlow.step = 'card_number';
        await message.reply(`💳 You chose to pay with ${code}. Please enter your card number (no spaces):`);
        return true;
      }
      // WALLET: proceed to amount entry
      userState.transferFlow.step = 'amount';
      await message.reply(`💰 How much ${code} would you like to transfer?`);
      return true;
    }

    case 'confirmation':
      if (userInput.toLowerCase() === 'confirm') {
        logger.info(`User ${chatId} confirmed transfer: ${JSON.stringify(data)}`);

        // Clear transfer flow
        delete userState.transferFlow;

        try {
          // Extract WhatsApp number from chatId (format: 1234567890@c.us)
          const whatsappNumber = chatId.replace('@c.us', '');

          // Ensure user is authenticated with backend
          await message.reply('🔐 Authenticating with backend...');
          await AuthService.ensureAuthenticated(whatsappNumber);

          // Build request
          const createReq: import('./types/index.js').CreateTransactionRequest = {
            recipientPhone: chatId.startsWith('+') ? chatId : `+${whatsappNumber}`,
            sourceCurrency: data.senderCurrency!,
            targetCurrency: data.recipientCurrency!,
            sourceAmount: parseFloat(data.amount!)
          };

          if (data.recipientAccount) createReq.recipientBankAccount = data.recipientAccount;
          if (data.recipientBank) createReq.recipientBank = data.recipientBank;
          if (data.recipientName) createReq.recipientName = data.recipientName;

          // Attach payment method and card data
          if (data.paymentMethod === 'MASTERCARD') {
            createReq.paymentMethod = 'MASTERCARD';
            createReq.card = {
              number: data.cardNumber || '',
              cvc: data.cardCvc || '',
              expiry: data.cardExpiry || ''
            };
          } else {
            createReq.paymentMethod = 'WALLET';
          }

          // For WALLET: Create transfer record and send payment link
          if (data.paymentMethod === 'WALLET') {
            await message.reply('💳 Creating transfer record...');
            const tx = await BackendService.createTransaction(whatsappNumber, createReq);

            // Generate payment link with pre-filled data
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const params = new URLSearchParams({
              transferId: tx.id,
              recipientName: data.recipientName || '',
              recipientCurrency: data.recipientCurrency || '',
              recipientBank: data.recipientBank || '',
              recipientAccount: data.recipientAccount || '',
              senderCurrency: data.senderCurrency || '',
              amount: data.amount || ''
            });
            const paymentLink = `${frontendUrl}/wallet-transfer?${params.toString()}`;

            let responseMessage = `✅ Transfer details confirmed!\n\n`;
            responseMessage += `Transaction ID: ${tx.id}\n`;
            responseMessage += `Status: ${tx.status}\n\n`;
            responseMessage += `🔗 *Payment Link:*\n${paymentLink}\n\n`;
            responseMessage += `📱 *Next Steps:*\n`;
            responseMessage += `1. Click the link above\n`;
            responseMessage += `2. Connect your Cardano wallet\n`;
            responseMessage += `3. Review the pre-filled details\n`;
            responseMessage += `4. Send ${data.amount} ${data.senderCurrency} from your wallet\n\n`;
            responseMessage += `🔔 You will receive automatic updates when the transaction is complete.`;

            await message.reply(responseMessage);

            // Start polling for transaction status updates
            PollingService.startPolling(tx.id, chatId);
            logger.info(`Started polling for WALLET transaction ${tx.id}`);
          } else {
            // For MASTERCARD: Process immediately with blockchain minting
            await message.reply('💳 Processing your transfer...');
            const tx = await BackendService.createTransaction(whatsappNumber, createReq);

            let responseMessage = `✅ Transfer request submitted successfully!\n\n`;
            responseMessage += `Transaction ID: ${tx.id}\n`;
            responseMessage += `Status: ${tx.status}\n\n`;
            responseMessage += `💰 Amount: ${data.amount} ${data.senderCurrency}\n`;
            responseMessage += `👤 Recipient: ${data.recipientName}\n`;
            responseMessage += `🏦 Bank: ${data.recipientBank}\n`;
            responseMessage += `💳 Account: ${data.recipientAccount}\n\n`;
            responseMessage += `⛓️ Blockchain processing started...\n`;
            responseMessage += `🔔 You will receive an invoice PDF when the transaction completes.`;

            await message.reply(responseMessage);

            // Start polling for transaction status updates and invoice PDF
            PollingService.startPolling(tx.id, chatId);
            logger.info(`Started polling for MASTERCARD transaction ${tx.id}`);
          }

        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error('[Transfer] Create transaction error:', msg);
          await message.reply(`❌ Failed to create transaction: ${msg || 'Unknown error'}.\n\nPlease try again later or contact support.`);
        }

        return true;
      } else if (userInput.toLowerCase() === 'cancel') {
        logger.info(`User ${chatId} cancelled transfer`);
        delete userState.transferFlow;
        await message.reply(`❌ Transfer cancelled. How else can I help you today?\n\n📋 Available services:\n• Type "transfer" - Start a new transfer\n• Type "history" - View transaction history\n• Type "help" - List available commands`);
        return true;
  }
  return true;
  }

}

client.on('message', async (message) => {
    logger.info(`Received message from ${message.from}: ${message.body}`);
    console.log(message.body);
    const chatId = message.from;

    // Ignore group messages and broadcasts - only handle private chats
    if (chatId.includes('@g.us') || chatId.includes('@broadcast')) {
      logger.info(`Ignoring message from group/broadcast: ${chatId}`);
      return;
    }

    // Ignore empty messages
    if (!message.body || message.body.trim() === '') {
      logger.info(`Ignoring empty message from ${chatId}`);
      return;
    }

    const userState = getUserState(chatId);

    // Handle transfer flow if active
    if (userState.transferFlow) {
      const handled = await handleTransferFlow(message, userState, chatId);
      if (handled) return;
    }

    const userInput = message.body.trim().toLowerCase();
    
    // Handle initial greeting
    if (userInput === 'hi' || userInput === 'hello' || userInput === 'hey') {
      // Check if user is in an active flow
      if (userState.transferFlow) {
        await message.reply(`⚠️ You are currently in the middle of a transfer process.

Are you sure you want to cancel your current transfer and start over?

📝 Please respond:
• Type "yes" - To cancel current transfer
• Type "no" - To continue your transfer`);
        return;
      }
      
      await message.reply(`👋 Hello! Welcome to TrustBridge! 🌉
Your trusted partner to send money across different countries faster using blockchain technology.

🚀 Ready to transfer money? Simply type "transfer" to get started!

📋 Available commands:
• Type "transfer"
• Type "rates" - View current USDT exchange rates  
• Type "help" - Get help and support`);
      return;
    }
    
    // Handle transfer command
    if (userInput === 'transfer') {
      
      // Check if already in transfer flow
      if (userState.transferFlow) {
        await message.reply(`⚠️ You already have an active transfer process.

Would you like to:
• Continue your current transfer - just respond to the previous question
• Start a new transfer - type "yes" to cancel current one`);
        return;
      }
      
      // Initialize transfer flow - ask for payment method first
      userState.transferFlow = {
        step: 'payment_method',
        data: {}
      };

      logger.info(`User ${chatId} started transfer flow`);
      await message.reply(`💸 Let's start your transfer process!

How would you like to pay?
• Type "WALLET" - Pay via Wallet (redirect to payment link)
• Type "MASTERCARD" - Pay via Mastercard (enter card details here)

💡 Type "back" to cancel transfer`);
      return;
    }
    
    // Handle help command
    if (userInput === 'help') {
      await message.reply(`🆘 *TrustBridge Help & Support*

📋 *Available Commands:*
• *transfer* - Start a new cross-border transfer
• *history* - View your transaction history
• *status <ID>* - Check transfer status by ID
• *rates* - View current exchange rates
• *refresh* - Force refresh exchange rates
• *help* - Show this help message

💸 *Transfer Process:*
1. Choose payment method (WALLET or MASTERCARD)
2. Enter recipient details (name, currency, bank, account)
3. Select sender currency
4. Enter transfer amount
5. Confirm and complete payment

🌐 *Supported Payment Methods:*
• *WALLET* - Pay with Cardano wallet (mockADA, mockUSDC, mockIDRX, etc.)
• *MASTERCARD* - Pay with card (USD, EUR, IDR, etc.)

🪙 *Supported Currencies:*
• IDR (Indonesian Rupiah)
• More coming soon!

⛓️ *Blockchain Features:*
• Real Cardano blockchain transactions
• Instant token minting
• Invoice PDF delivered via WhatsApp

📞 Need more help? Contact our support team!`);
      return;
    }
    
    // Handle yes/no responses for flow interruption
    if (userInput === 'yes' || userInput === 'y') {
      if (userState.transferFlow) {
        delete userState.transferFlow;
        logger.info(`User ${chatId} cancelled active transfer flow`);
        await message.reply(`✅ Transfer cancelled.

👋 Welcome back! Ready to start fresh?
• Type "transfer" - Start money transfer
• Type "history" - View transaction history
• Type "help" - Get help and support`);
        return;
      }
    }
    
    if (userInput === 'no' || userInput === 'n') {
      if (userState.transferFlow) {
        logger.info(`User ${chatId} chose to continue with transfer flow`);
        await message.reply(`✅ Continuing with your transfer. Please continue where you left off.

💡 Type "back" if you need to go to the previous step.`);
        return;
      }
    }
    
    // Handle debug command
    if (userInput === 'debug') {
      await message.reply(`🔧 Debug Information:

📊 Cache Stats:
${JSON.stringify(getCacheStats(), null, 2)}

🔧 Test Commands:
• "test" - Test CoinMarketCap API
• "clear" - Clear exchange rate cache
• "rates" - Show current rates
• "refresh" - Force refresh rates

💬 Available Commands:
• "transfer" - Start money transfer
• "help" - Show help menu`);
      return;
    }

    // Handle test command
    if (userInput === 'test') {
      await message.reply('🔍 Testing CoinMarketCap API connection...');
      
      try {
        const connectionTest = await testCMCConnection();
        
        if (!connectionTest.success) {
          await message.reply(`❌ CoinMarketCap API Test Failed:

🔑 Status: ${connectionTest.message}

💡 If API key is missing:
1. Check .env file has CMC_API_KEY
2. Get free API key from coinmarketcap.com/api
3. Restart the bot after adding key`);
          return;
        }
        
        // Test actual exchange rates
        const rates = await getCurrentRates();
        
        await message.reply(`✅ Exchange Rate API Test Results:

🔑 API Status: ${connectionTest.success ? 'Working ✅' : 'Failed ❌'}
💰 USDT → IDR: ${rates.usdtToIdr.toLocaleString('id-ID')}
📊 Data Source: ${rates.source === 'api' ? 'CoinMarketCap API' : 'Fallback Rates'}

⏰ Last Updated: ${rates.timestamp}
🔄 Cache Status: ${getCacheStats().size} rates cached`);
        
      } catch (error) {
        logger.error(`Exchange rate test failed for user ${chatId}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await message.reply(`❌ Exchange Rate Test Failed:

📝 Error: ${errorMessage}

🔄 Will use fallback rates for transfers.
Contact support if this persists.`);
      }
      return;
    }
    
    // Handle rates command
    if (userInput === 'rates') {
      await message.reply('📊 Fetching current exchange rates...');
      
      try {
        const rates = await getCurrentRates();
        
        const statusIcon = rates.source === 'api' ? '🟢' : '🟡';
        const sourceText = rates.source === 'api' ? 'Live from APIs' : 'Using Fallback Rates';
        const cacheStatus = rates.cached ? `🔄 Cached (${rates.cacheAge})` : '🆕 Fresh from API';
        
        await message.reply(`💹 Current Exchange Rates

🪙 USDT → IDR
Rate: Rp ${rates.usdtToIdr.toLocaleString('id-ID')}

${statusIcon} Status: ${sourceText}
${cacheStatus}
⏰ Updated: ${rates.timestamp}

💡 Commands:
• "refresh" - Force fresh rates
• "transfer" - Start money transfer`);
        
      } catch (error) {
        logger.error(`Failed to fetch rates for user ${chatId}:`, error);
        await message.reply(`❌ Unable to fetch current rates

Using fallback rates:
🪙 USDT → IDR: Rp ${(FALLBACK_RATES.USDT?.IDR || 16740).toLocaleString('id-ID')}

💡 Ready to transfer? Type "transfer"`);
      }
      return;
    }
    
    // Handle refresh command
    if (userInput === 'refresh') {
      await message.reply('🔄 Force refreshing exchange rates...');
      
      try {
        const refreshResult = await forceRefreshRates();
        
        if (refreshResult.success && refreshResult.rates) {
          await message.reply(`✅ Exchange Rates Refreshed!

🆕 Fresh from APIs:
🪙 USDT → IDR: Rp ${refreshResult.rates.usdtToIdr.toLocaleString('id-ID')}

⏰ Updated: ${new Date().toLocaleString('id-ID')}
🔄 Cache cleared - next requests will be live

💡 Type "rates" to see updated rates`);
        } else {
          await message.reply(`❌ Failed to refresh rates: ${refreshResult.message}

🔄 Try again later or use "rates" for current rates`);
        }
        
      } catch (error) {
        logger.error(`Failed to refresh rates for user ${chatId}:`, error);
        await message.reply('❌ Failed to refresh rates. Please try again.');
      }
      return;
    }
    
    // Handle clear cache command
    if (userInput === 'clear') {
      clearExchangeRateCache();
      await message.reply(`🗑️ Exchange rate cache cleared!

Next rate requests will fetch fresh data from APIs.
💡 Type "rates" to fetch new rates`);
      return;
    }

    // Handle transaction history command
    if (userInput === 'history') {
      try {
        await message.reply('📜 Fetching your transaction history...');

        const whatsappNumber = chatId.replace('@c.us', '');

        // Fetch transaction history from backend
        const history = await BackendService.getTransactionHistory(whatsappNumber, 10);

        if (history.length === 0) {
          await message.reply(`📋 *Transaction History*

You don't have any transactions yet.

💡 Start your first transfer:
• Type "transfer" - Start a new money transfer`);
          return;
        }

        // Format transaction history
        let historyMessage = `📋 *Your Recent Transactions* (Last ${history.length})\n\n`;

        history.forEach((tx, index) => {
          const statusEmojiMap: Record<string, string> = {
            'PENDING': '⏳',
            'PAID': '💳',
            'PROCESSING': '⚙️',
            'COMPLETED': '✅',
            'FAILED': '❌',
            'CANCELLED': '🚫'
          };
          const statusEmoji = statusEmojiMap[tx.status] || '⏳';

          const date = new Date(tx.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          historyMessage += `${index + 1}. ${statusEmoji} *${tx.status}*\n`;
          historyMessage += `   ID: ${tx.id}\n`;
          historyMessage += `   ${tx.source_amount} ${tx.source_currency} → ${tx.target_amount.toFixed(2)} ${tx.target_currency}\n`;
          historyMessage += `   To: ${tx.recipient_name}\n`;
          historyMessage += `   Date: ${date}\n`;
          historyMessage += `   Method: ${tx.payment_method}\n`;

          if (tx.blockchain_tx_url) {
            historyMessage += `   🔗 ${tx.blockchain_tx_url}\n`;
          }

          historyMessage += `\n`;
        });

        historyMessage += `💡 Commands:\n`;
        historyMessage += `• Type "transfer" - Start new transfer\n`;
        historyMessage += `• Type "status <ID>" - Check transfer status`;

        await message.reply(historyMessage);

      } catch (error) {
        logger.error(`Failed to fetch history for ${chatId}:`, error);
        await message.reply('❌ Unable to fetch transaction history. Please try again later.');
      }
      return;
    }
    
    // Handle status command to check transfer by ID
    if (userInput.startsWith('status ')) {
      try {
        const transferId = userInput.replace('status ', '').trim();

        if (!transferId) {
          await message.reply('❌ Please provide a transfer ID.\n\nExample: status TXN-1234567890-abc123');
          return;
        }

        await message.reply('🔍 Checking transfer status...');

        const status = await BackendService.getTransactionStatus(transferId);

        let statusMessage = `📋 *Transfer Status*\n\n`;
        statusMessage += `ID: ${status.transferId}\n`;
        statusMessage += `Status: ${status.status}\n`;

        if (status.blockchainTx) {
          statusMessage += `\n🔗 Blockchain Transaction:\n${status.blockchainTx}`;
        }

        statusMessage += `\n\n💡 Type "history" to see all your transfers`;

        await message.reply(statusMessage);

      } catch (error) {
        logger.error(`Failed to fetch status:`, error);
        await message.reply('❌ Transfer not found or unable to fetch status. Please check the ID and try again.');
      }
      return;
    }

    // Default response for unknown commands
    await message.reply(`🤔 I didn't understand that command.

💡 Here are some things you can try:
• "transfer" - Start a money transfer
• "rates" - Check current exchange rates  
• "help" - See all available commands

Need assistance? Type "help" for the full command list.`);
});

// Add error handling
client.on('disconnected', (reason) => {
    logger.warn(`WhatsApp client disconnected: ${reason}`);
});

client.on('auth_failure', (message) => {
    logger.error(`Authentication failure: ${message}`);
});

// Initialize client
logger.info('Initializing WhatsApp bot...');
client.initialize();

// Initialize PollingService with client
client.on('ready', () => {
  logger.info('WhatsApp client ready');
  PollingService.initialize(client);
});

// Show QR in terminal when needed
client.on('qr', (qr: string) => {
  try {
    qrcode.generate(qr, { small: true });
  } catch (e) {
    logger.debug('QR generation failed:', e);
  }
});

// Cleanup on exit
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  PollingService.stopAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  PollingService.stopAll();
  process.exit(0);
});
