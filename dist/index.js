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
// Function to get exchange rate between currencies
function getExchangeRate(fromCurrency, toCurrency) {
    // Mock exchange rates - in production this would call a real API
    const rates = {
        SGD: { MYR: 3.5, IDR: 11500, THB: 26.5, PHP: 42.0, BND: 1.0 },
        MYR: { SGD: 0.29, IDR: 3285, THB: 7.6, PHP: 12.0, BND: 0.29 },
        IDR: { SGD: 0.000087, MYR: 0.0003, THB: 0.0023, PHP: 0.0036, BND: 0.000087 },
        THB: { SGD: 0.038, MYR: 0.13, IDR: 435, PHP: 1.58, BND: 0.038 },
        PHP: { SGD: 0.024, MYR: 0.083, IDR: 277, THB: 0.63, BND: 0.024 },
        BND: { SGD: 1.0, MYR: 3.5, IDR: 11500, THB: 26.5, PHP: 42.0 }
    };
    if (fromCurrency === toCurrency)
        return 1.0;
    return rates[fromCurrency]?.[toCurrency] || 1.0;
}
// Function to calculate recipient amount
function calculateRecipientAmount(senderAmount, fromCurrency, toCurrency) {
    const rate = getExchangeRate(fromCurrency, toCurrency);
    return senderAmount * rate;
}
// Function to calculate transfer fees (mock implementation)
function calculateTransferFee(amount) {
    // Mock fee structure - in production this would be based on real fee schedules
    const feePercentage = 0.015; // 1.5% fee
    const fee = amount * feePercentage;
    return { fee, feePercentage };
}
// Helper function to handle signup flow
async function handleSignupFlow(message, userState, chatId) {
    if (!userState.signupFlow)
        return false;
    const { step, data } = userState.signupFlow;
    const userInput = message.body.trim();
    // Handle "back" command
    if (userInput.toLowerCase() === 'back') {
        switch (step) {
            case 'doc_type':
                // Can't go back from first step, cancel signup instead
                delete userState.signupFlow;
                logger.info(`User ${chatId} cancelled signup from doc_type step`);
                await message.reply(`❌ Signup cancelled. 

🚀 To start over, type:
• "signup" - To create a new account
• "login" - If you already have an account`);
                return true;
            case 'id_number':
                // Go back to document type selection
                userState.signupFlow.step = 'doc_type';
                delete data.docType; // Clear previous selection
                logger.info(`User ${chatId} went back to doc_type step`);
                await message.reply(`📄 Back to document type selection:

• KTP - Indonesian ID Card
• PASSPORT - International Passport  
• SIM - Indonesian Driver License
• NRIC - Singapore National Registration ID

Please type one of the options above:
💡 Type "back" to cancel signup`);
                return true;
            case 'name':
                // Go back to ID number input
                userState.signupFlow.step = 'id_number';
                delete data.idNumber; // Clear previous input
                logger.info(`User ${chatId} went back to id_number step`);
                await message.reply(`📄 Back to ${data.docType} number entry.

Please enter your ${data.docType} number:
💡 Type "back" to change document type`);
                return true;
            case 'phone':
                // Go back to name input
                userState.signupFlow.step = 'name';
                delete data.name; // Clear previous input
                logger.info(`User ${chatId} went back to name step`);
                await message.reply(`👤 Back to name entry.

Please enter your full name as it appears on your document:
💡 Type "back" to change ID number`);
                return true;
        }
    }
    switch (step) {
        case 'doc_type': {
            const docType = userInput.toUpperCase();
            if (!['KTP', 'PASSPORT', 'SIM', 'NRIC'].includes(docType)) {
                await message.reply(`❌ Please choose from available document types:
• KTP - Indonesian ID Card
• PASSPORT - International Passport
• SIM - Indonesian Driver License
• NRIC - Singapore National Registration ID

💡 Type "back" to cancel signup`);
                return true;
            }
            data.docType = docType;
            userState.signupFlow.step = 'id_number';
            logger.info(`User ${chatId} selected document type: ${docType}`);
            await message.reply(`📄 Great! You selected ${docType}. Now please enter your ${docType} number:

💡 Type "back" to change document type`);
            return true;
        }
        case 'id_number': {
            // Basic validation for ID number (alphanumeric, minimum 8 characters)
            if (userInput.length < 8 || !/^[A-Za-z0-9]+$/.test(userInput)) {
                await message.reply(`❌ Please enter a valid ID number (minimum 8 characters, letters and numbers only):

💡 Type "back" to change document type`);
                return true;
            }
            data.idNumber = userInput;
            userState.signupFlow.step = 'name';
            logger.info(`User ${chatId} provided ID number: ${userInput.substring(0, 4)}****`);
            await message.reply(`👤 Perfect! Now please enter your full name as it appears on your document:

💡 Type "back" to change ID number`);
            return true;
        }
        case 'name': {
            if (userInput.length < 2) {
                await message.reply(`❌ Please enter a valid full name (minimum 2 characters):

💡 Type "back" to change ID number`);
                return true;
            }
            data.name = userInput;
            userState.signupFlow.step = 'phone';
            logger.info(`User ${chatId} provided name: ${userInput}`);
            await message.reply(`📱 Excellent! Finally, please enter your phone number (with country code, e.g., +62812345678):

💡 Type "back" to change name`);
            return true;
        }
        case 'phone': {
            // Basic phone validation (starts with + and has at least 10 digits)
            if (!/^\+\d{10,15}$/.test(userInput)) {
                await message.reply(`❌ Please enter a valid phone number with country code (e.g., +62812345678):

💡 Type "back" to change name`);
                return true;
            }
            data.phone = userInput;
            logger.info(`User ${chatId} completed signup with phone: ${userInput}`);
            // Complete signup process
            userState.isVerified = true;
            delete userState.signupFlow;
            await message.reply(`✅ Account created successfully! 🎉

📋 Your KYC information has been submitted:
👤 Name: ${data.name}
📄 Document: ${data.docType}
📱 Phone: ${data.phone}

Welcome to TrustBridge! Your account is now ready for use.

📋 Available services:
• Type "transfer" - Transfer funds
• Type "history" - View transaction history
• Type "settings" - Account settings`);
            return true;
        }
    }
    return false;
}
// Helper function to handle transfer flow
async function handleTransferFlow(message, userState, chatId) {
    if (!userState.transferFlow)
        return false;
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
• Type "settings" - Account settings`);
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

Available options:
• SGD
• MYR
• IDR
• THB
• PHP
• BND

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
            case 'sender_currency':
                // Go back to recipient account
                userState.transferFlow.step = 'recipient_account';
                delete data.recipientAccount; // Clear previous input
                logger.info(`User ${chatId} went back to recipient_account step`);
                await message.reply(`🔢 Back to account number entry.

Please provide the recipient's account number:
💡 Type "back" to change bank name`);
                return true;
            case 'amount':
                // Go back to sender currency
                userState.transferFlow.step = 'sender_currency';
                delete data.senderCurrency; // Clear previous input
                logger.info(`User ${chatId} went back to sender_currency step`);
                await message.reply(`💱 Back to sender currency selection.

What currency would you like to send?

Available options:
• SGD
• MYR
• IDR
• THB
• PHP
• BND

💡 Type "back" to change account number`);
                return true;
            case 'confirmation':
                // Go back to amount
                userState.transferFlow.step = 'amount';
                delete data.amount; // Clear previous input
                logger.info(`User ${chatId} went back to amount step`);
                await message.reply(`💰 Back to amount entry.

How much ${data.senderCurrency} would you like to transfer?
💡 Type "back" to change sender currency`);
                return true;
        }
    }
    switch (step) {
        case 'recipient_name':
            data.recipientName = userInput;
            userState.transferFlow.step = 'recipient_currency';
            logger.info(`User ${chatId} provided recipient name: ${userInput}`);
            await message.reply(`💱 Great! What currency should the recipient receive?

Available options:
• SGD
• MYR
• IDR
• THB
• PHP
• BND

💡 Type "back" to change recipient name`);
            return true;
        case 'recipient_currency': {
            const currency = userInput.toUpperCase();
            if (!['SGD', 'MYR', 'IDR', 'THB', 'PHP', 'BND'].includes(currency)) {
                await message.reply(`❌ Please choose from available currencies: SGD, MYR, IDR, THB, PHP, or BND

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
            userState.transferFlow.step = 'sender_currency';
            logger.info(`User ${chatId} provided recipient account: ${userInput}`);
            await message.reply(`💱 Excellent! What currency would you like to send?

Available options:
• SGD
• MYR
• IDR
• THB
• PHP
• BND

💡 Type "back" to change account number`);
            return true;
        case 'sender_currency': {
            const currency = userInput.toUpperCase();
            if (!['SGD', 'MYR', 'IDR', 'THB', 'PHP', 'BND'].includes(currency)) {
                await message.reply(`❌ Please choose from available currencies: SGD, MYR, IDR, THB, PHP or BND

💡 Type "back" to change account number`);
                return true;
            }
            data.senderCurrency = currency;
            userState.transferFlow.step = 'amount';
            logger.info(`User ${chatId} selected currency: ${currency}`);
            await message.reply(`💰 How much ${currency} would you like to transfer?

💡 Type "back" to change sender currency`);
            return true;
        }
        case 'amount': {
            // Simple validation for amount (should be a positive number)
            const amount = parseFloat(userInput);
            if (isNaN(amount) || amount <= 0) {
                await message.reply(`❌ Please enter a valid amount (positive number only):

💡 Type "back" to change sender currency`);
                return true;
            }
            data.amount = userInput;
            userState.transferFlow.step = 'confirmation';
            logger.info(`User ${chatId} provided amount: ${userInput}`);
            // Calculate exchange rate and recipient amount
            const senderAmount = parseFloat(userInput);
            const exchangeRate = getExchangeRate(data.senderCurrency, data.recipientCurrency);
            const recipientAmount = calculateRecipientAmount(senderAmount, data.senderCurrency, data.recipientCurrency);
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
            }
            else if (userInput.toLowerCase() === 'cancel') {
                logger.info(`User ${chatId} cancelled transfer`);
                delete userState.transferFlow;
                await message.reply(`❌ Transfer cancelled. How else can I help you today?

📋 Available services:
• Type "transfer" - Start a new transfer
• Type "history" - View transaction history
• Type "settings" - Account settings`);
                return true;
            }
            else {
                await message.reply('Please type "confirm" to proceed, "cancel" to abort, or "back" to change amount.');
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
    // Handle signup flow if active
    if (userState.signupFlow) {
        const handled = await handleSignupFlow(message, userState, chatId);
        if (handled)
            return;
    }
    // Handle interruption confirmation
    if (userState.awaitingInterruptConfirmation) {
        const userInput = message.body.trim().toLowerCase();
        if (userInput === 'yes' || userInput === 'y') {
            // User confirmed cancellation
            const interruptType = userState.awaitingInterruptConfirmation.type;
            const originalMessage = userState.awaitingInterruptConfirmation.originalMessage;
            // Clear all active flows and interruption state
            delete userState.transferFlow;
            delete userState.signupFlow;
            delete userState.awaitingInterruptConfirmation;
            logger.info(`User ${chatId} confirmed interruption of active flow`);
            // Handle the original message that caused the interruption
            if (interruptType === 'greeting') {
                // Process the greeting
                if (userState.isVerified) {
                    await message.reply(`👋 Welcome back! You're already verified. How can I help you today?

📋 Available services:
• Type "transfer" - Transfer funds
• Type "history" - View transaction history
• Type "settings" - Account settings`);
                }
                else {
                    await message.reply(`Hi! Welcome to TrustBridge! 🌉
Your trusted partner to send money across different countries faster using blockchain technology.

🚀 Get started with TrustBridge:

📝 Please reply with:
• Type "login" - If you already have an account
• Type "signup" - To create a new account`);
                }
            }
            else if (interruptType === 'menu') {
                // Handle menu actions (login/signup/transfer)
                if (originalMessage.toLowerCase() === 'login') {
                    userState.awaitingCredential = true;
                    logger.info(`User ${chatId} chose to login after cancelling flow`);
                    await message.reply('🔐 Great! Please provide your registered unique credential to proceed with the verification process.');
                }
                else if (originalMessage.toLowerCase() === 'signup') {
                    // Initialize signup flow
                    userState.signupFlow = {
                        step: 'doc_type',
                        data: {}
                    };
                    logger.info(`User ${chatId} started signup flow after cancelling previous flow`);
                    await message.reply(`📝 Welcome to TrustBridge signup! Let's collect your KYC information.

📄 First, please choose your document type:

• KTP - Indonesian ID Card
• PASSPORT - International Passport  
• SIM - Indonesian Driver License
• NRIC - Singapore National Registration ID

Please type one of the options above:
💡 Type "back" to cancel signup`);
                }
                else if (originalMessage.toLowerCase() === 'transfer') {
                    // Initialize transfer flow
                    userState.transferFlow = {
                        step: 'recipient_name',
                        data: {}
                    };
                    logger.info(`User ${chatId} started transfer flow after cancelling previous flow`);
                    await message.reply(`💸 Let's start your transfer process!

👤 First, please provide the recipient's full name:
💡 Type "back" to cancel transfer`);
                }
            }
            return;
        }
        else if (userInput === 'no' || userInput === 'n') {
            // User wants to continue with current flow
            delete userState.awaitingInterruptConfirmation;
            logger.info(`User ${chatId} chose to continue with active flow`);
            await message.reply(`✅ Continuing with your current process. Please continue where you left off.

💡 Type "back" if you need to go to the previous step.`);
            return;
        }
        else {
            // Invalid response
            await message.reply(`Please respond with:
• "yes" or "y" - To cancel current process
• "no" or "n" - To continue current process`);
            return;
        }
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
        // Check if user is in an active flow
        if (userState.transferFlow || userState.signupFlow) {
            const flowType = userState.transferFlow ? 'transfer' : 'signup';
            userState.awaitingInterruptConfirmation = {
                type: 'greeting',
                originalMessage: message.body
            };
            logger.info(`User ${chatId} attempted greeting while in ${flowType} flow`);
            await message.reply(`⚠️ You are currently in the middle of a ${flowType} process.

Are you sure you want to cancel your current ${flowType} and start over?

📝 Please respond:
• Type "yes" or "y" - To cancel current ${flowType}
• Type "no" or "n" - To continue your ${flowType}`);
            return;
        }
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
Your trusted partner to send money across different countries faster using blockchain technology.

🚀 Get started with TrustBridge:

📝 Please reply with:
• Type "login" - If you already have an account
• Type "signup" - To create a new account`);
        return;
    }
    // Handle text responses
    if (message.body.toLowerCase() === 'login') {
        // Check if user is in an active flow
        if (userState.transferFlow || userState.signupFlow) {
            const flowType = userState.transferFlow ? 'transfer' : 'signup';
            userState.awaitingInterruptConfirmation = {
                type: 'menu',
                originalMessage: message.body
            };
            logger.info(`User ${chatId} attempted login while in ${flowType} flow`);
            await message.reply(`⚠️ You are currently in the middle of a ${flowType} process.

Are you sure you want to cancel your current ${flowType} and switch to login?

📝 Please respond:
• Type "yes" or "y" - To cancel current ${flowType} and login
• Type "no" or "n" - To continue your ${flowType}`);
            return;
        }
        userState.awaitingCredential = true;
        logger.info(`User ${chatId} chose to login`);
        await message.reply('🔐 Great! Please provide your registered unique credential to proceed with the verification process.');
        return;
    }
    if (message.body.toLowerCase() === 'signup') {
        // Check if user is in an active flow
        if (userState.transferFlow || userState.signupFlow) {
            const flowType = userState.transferFlow ? 'transfer' : 'signup';
            userState.awaitingInterruptConfirmation = {
                type: 'menu',
                originalMessage: message.body
            };
            logger.info(`User ${chatId} attempted signup while in ${flowType} flow`);
            await message.reply(`⚠️ You are currently in the middle of a ${flowType} process.

Are you sure you want to cancel your current ${flowType} and start a new signup?

📝 Please respond:
• Type "yes" or "y" - To cancel current ${flowType} and signup
• Type "no" or "n" - To continue your ${flowType}`);
            return;
        }
        // Initialize signup flow
        userState.signupFlow = {
            step: 'doc_type',
            data: {}
        };
        logger.info(`User ${chatId} started signup flow`);
        await message.reply(`📝 Welcome to TrustBridge signup! Let's collect your KYC information.

📄 First, please choose your document type:

• KTP - Indonesian ID Card
• PASSPORT - International Passport  
• SIM - Indonesian Driver License
• NRIC - Singapore National Registration ID

Please type one of the options above:
💡 Type "back" to cancel signup`);
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
                    // Check if user is in an active flow (but allow if already in transfer flow)
                    if (userState.signupFlow) {
                        userState.awaitingInterruptConfirmation = {
                            type: 'menu',
                            originalMessage: message.body
                        };
                        logger.info(`User ${chatId} attempted transfer while in signup flow`);
                        await message.reply(`⚠️ You are currently in the middle of a signup process.

Are you sure you want to cancel your current signup and start a transfer?

📝 Please respond:
• Type "yes" or "y" - To cancel signup and start transfer
• Type "no" or "n" - To continue your signup`);
                        return;
                    }
                    logger.info(`User ${chatId} initiated transfer flow`);
                    // Initialize transfer flow
                    userState.transferFlow = {
                        //recipient's name should not be numeric
                        step: 'recipient_name',
                        data: {}
                    };
                    await message.reply(`💸 Let's start your transfer process!

👤 First, please provide the recipient's full name:
💡 Type "back" to cancel transfer`);
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