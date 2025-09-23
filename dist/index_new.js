import 'dotenv/config';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import logger from './logger.js';
const { Client, LocalAuth } = pkg;
const userStates = new Map();
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});
client.on('qr', (qr) => {
    logger.info('QR code received, please scan it.');
    qrcode.generate(qr, { small: true });
});
client.on('ready', () => {
    logger.info('WhatsApp client is ready!');
});
client.on('message', async (message) => {
    try {
        // Skip messages from status or groups
        if (message.from.includes('@g.us') || message.from.includes('status@broadcast')) {
            return;
        }
        const chatId = message.from;
        const userInput = message.body.trim();
        logger.info(`Message from ${chatId}: ${userInput}`);
        // Handle transfer flow
        if (await handleTransferFlow(message, chatId, userInput)) {
            return;
        }
        // Handle commands
        if (userInput.toLowerCase() === '/start') {
            logger.info(`User ${chatId} started conversation`);
            await message.reply('👋 Welcome to Trust Bridge!\n\nAvailable commands:\n• `/transfer` - Start a new transfer\n• `/help` - Get help\n• `/status` - Check your transfer status');
        }
        else if (userInput.toLowerCase() === '/transfer') {
            logger.info(`User ${chatId} initiated transfer`);
            await startTransferFlow(message, chatId);
        }
        else if (userInput.toLowerCase() === '/help') {
            logger.info(`User ${chatId} requested help`);
            await message.reply('🤖 *Trust Bridge Help*\n\n*Commands:*\n• `/transfer` - Start a new transfer\n• `/status` - Check transfer status\n\n*Transfer Process:*\n1. Choose sender currency\n2. Enter amount\n3. Enter recipient details\n4. Confirm transfer\n\nNeed more help? Contact our support team!');
        }
        else if (userInput.toLowerCase() === '/status') {
            logger.info(`User ${chatId} checked status`);
            // TODO: Implement balance check when ready
            await message.reply('💼 Balance feature is currently under maintenance. Please try again later.');
        }
        else {
            logger.info(`User ${chatId} sent unrecognized command: ${userInput}`);
            await message.reply('❓ Sorry, I didn\'t understand that command. Type `/help` to see available commands.');
        }
    }
    catch (error) {
        logger.error('Error handling message:', error);
        await message.reply('❌ Sorry, there was an error processing your request. Please try again.');
    }
});
async function startTransferFlow(message, chatId) {
    userStates.set(chatId, {
        transferFlow: {
            step: 'sender_currency',
            data: {}
        }
    });
    logger.info(`Transfer flow started for user ${chatId}`);
    await message.reply('💱 *New Transfer*\n\nWhich currency would you like to send?\n• USD\n• ADA\n• IDR\n\nPlease type your choice:');
}
async function handleTransferFlow(message, chatId, userInput) {
    const userState = userStates.get(chatId);
    if (!userState?.transferFlow) {
        return false;
    }
    const { step, data } = userState.transferFlow;
    switch (step) {
        case 'sender_currency': {
            const currency = userInput.toUpperCase();
            if (!['USD', 'ADA', 'IDR'].includes(currency)) {
                await message.reply('❌ Please choose from available currencies: USD, ADA, or IDR');
                return true;
            }
            data.senderCurrency = currency;
            userState.transferFlow.step = 'amount';
            logger.info(`User ${chatId} selected sender currency: ${currency}`);
            await message.reply(`💰 How much ${currency} would you like to transfer?`);
            return true;
        }
        case 'amount': {
            const amount = parseFloat(userInput);
            if (isNaN(amount) || amount <= 0) {
                await message.reply('❌ Please enter a valid amount (numbers only)');
                return true;
            }
            data.amount = amount;
            userState.transferFlow.step = 'recipient_name';
            logger.info(`User ${chatId} entered amount: ${amount}`);
            await message.reply('👤 What is the recipient\'s name?');
            return true;
        }
        case 'recipient_name': {
            if (userInput.length < 2) {
                await message.reply('❌ Please enter a valid recipient name (at least 2 characters)');
                return true;
            }
            data.recipientName = userInput;
            userState.transferFlow.step = 'recipient_currency';
            logger.info(`User ${chatId} entered recipient name: ${userInput}`);
            await message.reply('💱 Which currency should the recipient receive?\n• USD\n• ADA\n• IDR\n\nPlease type your choice:');
            return true;
        }
        case 'recipient_currency': {
            const currency = userInput.toUpperCase();
            if (!['USD', 'ADA', 'IDR'].includes(currency)) {
                await message.reply('❌ Please choose from available currencies: USD, ADA, or IDR');
                return true;
            }
            data.recipientCurrency = currency;
            userState.transferFlow.step = 'recipient_bank';
            logger.info(`User ${chatId} selected recipient currency: ${currency}`);
            await message.reply('🏦 What is the recipient\'s bank name?');
            return true;
        }
        case 'recipient_bank': {
            if (userInput.length < 2) {
                await message.reply('❌ Please enter a valid bank name');
                return true;
            }
            data.recipientBank = userInput;
            userState.transferFlow.step = 'recipient_account';
            logger.info(`User ${chatId} entered recipient bank: ${userInput}`);
            await message.reply('🔢 What is the recipient\'s account number?');
            return true;
        }
        case 'recipient_account': {
            if (userInput.length < 5) {
                await message.reply('❌ Please enter a valid account number (at least 5 digits)');
                return true;
            }
            data.recipientAccount = userInput;
            userState.transferFlow.step = 'memo';
            logger.info(`User ${chatId} entered recipient account: ${userInput}`);
            await message.reply('📝 Add a memo for this transfer (optional - type "skip" to skip):');
            return true;
        }
        case 'memo': {
            if (userInput.toLowerCase() !== 'skip') {
                data.memo = userInput;
                logger.info(`User ${chatId} added memo: ${userInput}`);
            }
            else {
                logger.info(`User ${chatId} skipped memo`);
            }
            userState.transferFlow.step = 'confirmation';
            await showTransferConfirmation(message, data);
            return true;
        }
        case 'confirmation': {
            if (userInput.toLowerCase() === 'confirm') {
                await processTransfer(message, chatId, data);
                userStates.delete(chatId);
                return true;
            }
            else if (userInput.toLowerCase() === 'cancel') {
                userStates.delete(chatId);
                logger.info(`User ${chatId} cancelled transfer`);
                await message.reply('❌ Transfer cancelled. Type `/transfer` to start a new transfer.');
                return true;
            }
            else {
                await message.reply('Please type "confirm" to proceed or "cancel" to cancel the transfer.');
                return true;
            }
        }
    }
    return false;
}
async function showTransferConfirmation(message, transferData) {
    const memo = transferData.memo ? `\n📝 *Memo:* ${transferData.memo}` : '';
    const confirmation = `📋 *Transfer Confirmation*

💰 *Amount:* ${transferData.amount} ${transferData.senderCurrency}
🔄 *Converting to:* ${transferData.recipientCurrency}
👤 *Recipient:* ${transferData.recipientName}
🏦 *Bank:* ${transferData.recipientBank}
🔢 *Account:* ${transferData.recipientAccount}${memo}

Type "confirm" to proceed or "cancel" to cancel.`;
    await message.reply(confirmation);
}
async function processTransfer(message, chatId, transferData) {
    logger.info(`Processing transfer for user ${chatId}:`, transferData);
    // TODO: Implement actual transfer logic here
    // This is where you'd integrate with your backend/blockchain/payment processor
    const transferId = `TXN${Date.now()}`;
    const successMessage = `✅ *Transfer Initiated Successfully!*

🆔 *Transaction ID:* ${transferId}
💰 *Amount:* ${transferData.amount} ${transferData.senderCurrency} to ${transferData.recipientCurrency}
👤 *To:* ${transferData.recipientName}
🏦 *Bank:* ${transferData.recipientBank}

Your transfer is being processed. You'll receive updates as it progresses.

Type /status to check your transfer status anytime.`;
    await message.reply(successMessage);
}
client.initialize();
process.on('SIGINT', () => {
    logger.info('Shutting down gracefully...');
    client.destroy();
    process.exit(0);
});
export default client;
//# sourceMappingURL=index_new.js.map