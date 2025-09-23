import 'dotenv/config';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import logger from './logger.js';
const { Client, LocalAuth } = pkg;
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: process.env.WHATSAPP_SESSION_NAME || 'trustbridge-session'
    }),
});
const userStates = new Map();
//Mock database for credentials
const mockCredentials = new Set([
    'TB123456',
    'TB789012',
    'TB345678',
    'TRUST2024'
]);
// Helper function to get or create user state
function getUserState(chatId) {
    if (!userStates.has(chatId)) {
        userStates.set(chatId, {
            isVerified: false,
            awaitingCredential: false
        });
    }
    return userStates.get(chatId);
}
// Function to verify credential against database
function verifyCredential(credential) {
    // this would be a database query
    return mockCredentials.has(credential.toUpperCase());
}
// Helper function to handle transfer flow
async function handleTransferFlow(message, userState, chatId) {
    if (!userState.transferFlow)
        return false;
    const { step, data } = userState.transferFlow;
    const userInput = message.body.trim();
    switch (step) {
        case 'recipient_name':
            data.recipientName = userInput;
            userState.transferFlow.step = 'recipient_currency';
            logger.info(`User ${chatId} provided recipient name: ${userInput}`);
            await message.reply('💱 Great! What currency should the recipient receive?\n\nAvailable options:\n• SGD\n• MYR\n• IDR\n• THB\n• PHP\n• BND');
            return true;
        case 'recipient_currency': {
            const currency = userInput.toUpperCase();
            if (!['SGD', 'MYR', 'IDR', 'THB', 'PHP', 'BND'].includes(currency)) {
                await message.reply('❌ Please choose from available currencies: SGD, MYR, IDR, THB, PHP, or BND');
                return true;
            }
            data.recipientCurrency = currency;
            userState.transferFlow.step = 'recipient_bank';
            logger.info(`User ${chatId} selected recipient currency: ${currency}`);
            await message.reply('🏦 Perfect! Now please provide the recipient\'s bank name (e.g., BCA, Mandiri, BNI, etc.)');
            return true;
        }
        case 'recipient_bank':
            data.recipientBank = userInput;
            userState.transferFlow.step = 'recipient_account';
            logger.info(`User ${chatId} provided recipient bank: ${userInput}`);
            await message.reply('🔢 Excellent! Now please provide the recipient\'s account number:');
            return true;
        case 'recipient_account':
            // Simple validation for account number (should be numbers)
            if (!/^\d+$/.test(userInput)) {
                await message.reply('❌ Account number should only contain numbers. Please try again:');
                return true;
            }
            data.recipientAccount = userInput;
            userState.transferFlow.step = 'sender_currency';
            logger.info(`User ${chatId} provided recipient account: ${userInput}`);
            await message.reply('💱 Excellent! What currency would you like to send?\n\nAvailable options:\n• SGD\n• MYR\n• IDR\n• THB\n• PHP\n• BND');
            return true;
        case 'sender_currency': {
            const currency = userInput.toUpperCase();
            if (!['SGD', 'MYR', 'IDR', 'THB', 'PHP', 'BND'].includes(currency)) {
                await message.reply('❌ Please choose from available currencies: SGD, MYR, IDR, THB, PHP or BND');
                return true;
            }
            data.senderCurrency = currency;
            userState.transferFlow.step = 'amount';
            logger.info(`User ${chatId} selected currency: ${currency}`);
            await message.reply(`💰 How much ${currency} would you like to transfer?`);
            return true;
        }
        case 'amount': {
            // Simple validation for amount (should be a positive number)
            const amount = parseFloat(userInput);
            if (isNaN(amount) || amount <= 0) {
                await message.reply('❌ Please enter a valid amount (positive number only):');
                return true;
            }
            data.amount = userInput;
            userState.transferFlow.step = 'confirmation';
            logger.info(`User ${chatId} provided amount: ${userInput}`);
            // Show confirmation
            await message.reply(`📋 Please confirm your transfer details:

👤 Recipient Name: ${data.recipientName}
💱 Recipient Currency: ${data.recipientCurrency}
🏦 Bank: ${data.recipientBank}
🔢 Account Number: ${data.recipientAccount}
� Sender Currency: ${data.senderCurrency}
💰 Amount: ${data.amount} ${data.senderCurrency}

Type "confirm" to proceed or "cancel" to abort the transfer.`);
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
            }
            else if (userInput.toLowerCase() === 'cancel') {
                logger.info(`User ${chatId} cancelled transfer`);
                delete userState.transferFlow;
                await message.reply('❌ Transfer cancelled. How else can I help you today?');
                return true;
            }
            else {
                await message.reply('Please type "confirm" to proceed or "cancel" to abort the transfer.');
                return true;
            }
    }
    return false;
}
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
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
        if (handled)
            return;
    }
    // Handle credential verification
    if (userState.awaitingCredential) {
        const credential = message.body.trim();
        if (verifyCredential(credential)) {
            userState.isVerified = true;
            userState.awaitingCredential = false;
            logger.info(`User ${chatId} successfully verified with credential: ${credential}`);
            await message.reply(`✅ Credential verified successfully! Welcome back to TrustBridge. How can I assist you today?

📋 Available services:
• Type "transfer" - Transfer funds
• Type "history" - View transaction history
• Type "settings" - Account settings`);
        }
        else {
            logger.warn(`Failed credential verification attempt from ${chatId}: ${credential}`);
            await message.reply('❌ Invalid credential. Please check and try again, or contact support if you need assistance.');
        }
        return;
    }
    // Handle initial greeting
    if (message.body.toLowerCase() === 'hi' || message.body.toLowerCase() === 'hello' || message.body.toLowerCase() === 'hey') {
        // Check if user is already verified
        if (userState.isVerified) {
            await message.reply(`👋 Welcome back! You're already verified. How can I help you today?

📋 Available services:
• Type "transfer" - Transfer funds
• Type "history" - View transaction history
• Type "settings" - Account settings`);
            return;
        }
        // Send welcome message with text instructions
        await message.reply(`Hi! Welcome to TrustBridge! 🌉
Your trusted partner in bridging the gap between traditional finance and the decentralized world.

Do you have a TrustBridge account?

📝 Please reply with:
• Type "yes" - If you have an account
• Type "no" - If you need to create an account`);
        return;
    }
    // Handle text responses
    if (message.body.toLowerCase() === 'yes') {
        userState.awaitingCredential = true;
        await message.reply('🔐 Great! Please provide your registered unique credential to proceed with the verification process.');
        return;
    }
    if (message.body.toLowerCase() === 'no') {
        const websiteUrl = process.env.TRUSTBRIDGE_WEBSITE || 'https://trustbridge-finance.vercel.app/';
        logger.info(`Directing new user ${chatId} to create account at ${websiteUrl}`);
        await message.reply(`📝 No worries! To create your TrustBridge account, please visit our website at:\n\n🌐 ${websiteUrl}\n\nClick on the "Sign Up" button and follow the instructions to set up your account. Once you have your credentials, come back here and say "hi" to link your account!`);
        return;
    }
    // Handle main menu options (only for verified users)
    if (userState.isVerified) {
        const enabledFeatures = {
            // balance: process.env.ENABLE_BALANCE_CHECK === 'true', // Temporarily disabled
            transfer: process.env.ENABLE_TRANSFER_FEATURE === 'true'
        };
        switch (message.body.toLowerCase()) {
            // case 'balance':
            //   if (enabledFeatures.balance) {
            //     logger.info(`User ${chatId} checked balance`);
            //     await message.reply('💰 Your current balance:\n🇸🇬 SGD: $1,250.00\n🇲🇾 MYR: RM 2,500.00\n🇮🇩 IDR: Rp 5,000,000');
            //   } else {
            //     await message.reply('❌ Balance checking is currently disabled.');
            //   }
            //   break;
            case 'transfer':
                if (enabledFeatures.transfer) {
                    logger.info(`User ${chatId} initiated transfer flow`);
                    // Initialize transfer flow
                    userState.transferFlow = {
                        step: 'recipient_name',
                        data: {}
                    };
                    await message.reply(`💸 Let's start your transfer process!

👤 First, please provide the recipient's full name:`);
                }
                else {
                    await message.reply('❌ Transfer feature is currently disabled.');
                }
                break;
            case 'history':
                logger.info(`User ${chatId} viewed transaction history`);
                await message.reply(`📊 Your recent transactions:

1. Transfer to John Doe - BCA Bank - $500 SGD - 2 days ago ✅
2. Received from Alice Smith - 1000 MYR - 5 days ago ✅
3. Transfer to Bob Wilson - Mandiri Bank - 2000000 IDR - 1 week ago ✅

💬 Type "transfer" to make a new transfer.`);
                break;
            case 'settings':
                logger.info(`User ${chatId} accessed settings`);
                await message.reply(`⚙️ Account Settings:

1. Update Profile
2. Security Settings  
3. Notification Preferences
4. Logout

💬 Select an option by typing the number or name.`);
                break;
        }
    }
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
//# sourceMappingURL=index.js.map