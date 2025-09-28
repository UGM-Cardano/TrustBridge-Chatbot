import 'dotenv/config';
import pkg from 'whatsapp-web.js';
import type { Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import logger from './logger.js';

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
    step: 'recipient_name' | 'recipient_currency' | 'recipient_bank' | 'recipient_account' | 'amount' | 'confirmation';
    data: {
      recipientName?: string;
      recipientCurrency?: string;
      recipientBank?: string;
      recipientAccount?: string;
      senderCurrency?: string; // Always USD
      amount?: string;
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

// Function to get exchange rate between currencies
function getExchangeRate(fromCurrency: string, toCurrency: string): number {
  // Mock exchange rates - in production this would call a real API
  const rates: Record<string, Record<string, number>> = {
    USD: { IDR: 15800 }, // 1 USD = 15,800 IDR (example rate)
    IDR: { USD: 0.0000633 }, // 1 IDR = 0.0000633 USD
    // Keep existing rates for backward compatibility if needed
    SGD: { MYR: 3.5, IDR: 11500, THB: 26.5, PHP: 42.0, BND: 1.0 },
    MYR: { SGD: 0.29, IDR: 3285, THB: 7.6, PHP: 12.0, BND: 0.29 },
    THB: { SGD: 0.038, MYR: 0.13, IDR: 435, PHP: 1.58, BND: 0.038 },
    PHP: { SGD: 0.024, MYR: 0.083, IDR: 277, THB: 0.63, BND: 0.024 },
    BND: { SGD: 1.0, MYR: 3.5, IDR: 11500, THB: 26.5, PHP: 42.0 }
  };

  if (fromCurrency === toCurrency) return 1.0;
  return rates[fromCurrency]?.[toCurrency] || 1.0;
}

// Function to calculate recipient amount
function calculateRecipientAmount(senderAmount: number, fromCurrency: string, toCurrency: string): number {
  const rate = getExchangeRate(fromCurrency, toCurrency);
  return senderAmount * rate;
}

// Function to calculate transfer fees (mock implementation)
function calculateTransferFee(amount: number): { fee: number; feePercentage: number } {
  // Mock fee structure - in production this would be based on real fee schedules
  const feePercentage = 0.015; // 1.5% fee
  const fee = amount * feePercentage;
  return { fee, feePercentage };
}



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
        delete data.senderCurrency; // Clear auto-set USD
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

How much USD would you like to transfer?
💡 Type "back" to change account number`);
        return true;
    }
  }

  switch (step) {
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
      // Set sender currency to USDT by default
      data.senderCurrency = 'USDT';
      userState.transferFlow.step = 'amount';
      logger.info(`User ${chatId} provided recipient account: ${userInput}`);
      await message.reply(`💰 How much USDT would you like to transfer?

💡 Type "back" to change account number`);
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
      
      // Calculate exchange rate and recipient amount
      const senderAmount = parseFloat(userInput);
      const exchangeRate = getExchangeRate(data.senderCurrency!, data.recipientCurrency!);
      const recipientAmount = calculateRecipientAmount(senderAmount, data.senderCurrency!, data.recipientCurrency!);
      const { fee, feePercentage } = calculateTransferFee(senderAmount);
      const totalAmount = senderAmount + fee;
      
      // Format numbers for display
      const formattedRate = exchangeRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
      const formattedRecipientAmount = recipientAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedFee = fee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedTotal = totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
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
📊 Transfer Fee (${(feePercentage * 100).toFixed(1)}%): ${formattedFee} ${data.senderCurrency}
💰 Total Amount: ${formattedTotal} ${data.senderCurrency}`;

      confirmationMessage += `

Type "confirm" to proceed, "cancel" to abort, or "back" to change amount.`;

      await message.reply(confirmationMessage);
      return true;
    }

    case 'confirmation':
      if (userInput.toLowerCase() === 'confirm') {
        logger.info(`User ${chatId} confirmed transfer: ${JSON.stringify(data)}`);
        
        // Clear transfer flow
        delete userState.transferFlow;
        
        await message.reply(`✅ Transfer request submitted successfully!

Your funds will be sent shortly.
Transaction ID: TB${Date.now()}

📧 You will receive a confirmation email shortly.
💬 Type "history" to view your transaction history.`);
        return true;
        
      } else if (userInput.toLowerCase() === 'cancel') {
        logger.info(`User ${chatId} cancelled transfer`);
        delete userState.transferFlow;
        await message.reply(`❌ Transfer cancelled. How else can I help you today?

📋 Available services:
• Type "transfer" - Start a new transfer
• Type "history" - View transaction history
• Type "help" - List available commands`);
        return true;
        
      } else {
        await message.reply('Please type "confirm" to proceed, "cancel" to abort, or "back" to change amount.');
        return true;
      }
  }

  return false;
}

client.on('qr', (qr) => {
    qrcode.generate(qr, {small: true});
    logger.info('QR Code generated for WhatsApp Web authentication');
    console.log('QR RECEIVED', qr);
});

client.on('ready', () => {
    logger.info('WhatsApp bot is ready and connected!');
    console.log('Client is ready!');
});

client.on('message', async (message) => {
    logger.info(`Received message from ${message.from}: ${message.body}`);
    console.log(message.body);
    const chatId = message.from;
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
• Type "transfer" - Start money transfer
• Type "history" - View transaction history
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
      
      // Initialize transfer flow
      userState.transferFlow = {
        step: 'recipient_name',
        data: {}
      };
      
      logger.info(`User ${chatId} started transfer flow`);
      await message.reply(`💸 Let's start your transfer process!

👤 First, please provide the recipient's full name:
💡 Type "back" to cancel transfer`);
      return;
    }
    
    // Handle help command
    if (userInput === 'help') {
      await message.reply(`🆘 TrustBridge Help & Support

📋 Available commands:
• Type "transfer" - Start money transfer process
• Type "history" - View your transaction history
• Type "hi" or "hello" - Get welcome message

💸 Transfer Process:
1. Recipient name
2. Currency selection (USD/IDR) 
3. Bank information
4. Account number
5. Transfer amount
6. Confirmation

🌐 Supported:
• From: USD (US Dollar)
• To: IDR (Indonesian Rupiah) or USD

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
    
    // Default response for unknown commands
    await message.reply(`🤔 I didn't understand that command.

� To get started:
• Type "transfer" - Start money transfer
• Type "history" - View transaction history
• Type "help" - Get help and available commands
• Type "hi" - Get welcome message`);
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
