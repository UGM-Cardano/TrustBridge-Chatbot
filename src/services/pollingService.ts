import pkg from 'whatsapp-web.js';
import logger from '../logger.js';
import { BackendService } from './backendService.js';

const { Client } = pkg;

interface PollingTask {
  transferId: string;
  chatId: string;
  startTime: number;
  lastStatus: string;
  pollCount: number;
}

export class PollingService {
  private static client: typeof Client.prototype | null = null;
  private static activeTasks: Map<string, PollingTask> = new Map();
  private static pollingInterval: NodeJS.Timeout | null = null;

  // Configuration
  private static readonly POLL_INTERVAL = 15000; // 15 seconds
  private static readonly MAX_POLL_DURATION = 30 * 60 * 1000; // 30 minutes
  private static readonly MAX_POLL_COUNT = 120; // Max 120 polls (30 minutes / 15 seconds)

  /**
   * Initialize polling service with WhatsApp client
   */
  static initialize(whatsappClient: typeof Client.prototype): void {
    this.client = whatsappClient;
    logger.info('PollingService initialized');
  }

  /**
   * Start polling for a transaction
   */
  static startPolling(transferId: string, chatId: string): void {
    if (this.activeTasks.has(transferId)) {
      logger.warn(`Already polling for transfer ${transferId}`);
      return;
    }

    const task: PollingTask = {
      transferId,
      chatId,
      startTime: Date.now(),
      lastStatus: 'PENDING',
      pollCount: 0,
    };

    this.activeTasks.set(transferId, task);
    logger.info(`Started polling for transfer ${transferId}`);

    // Start polling loop if not already running
    if (!this.pollingInterval) {
      this.startPollingLoop();
    }
  }

  /**
   * Stop polling for a specific transaction
   */
  static stopPolling(transferId: string): void {
    if (this.activeTasks.delete(transferId)) {
      logger.info(`Stopped polling for transfer ${transferId}`);
    }

    // Stop polling loop if no active tasks
    if (this.activeTasks.size === 0 && this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      logger.info('Polling loop stopped (no active tasks)');
    }
  }

  /**
   * Start the main polling loop
   */
  private static startPollingLoop(): void {
    logger.info('Starting polling loop');

    this.pollingInterval = setInterval(async () => {
      await this.pollAllTasks();
    }, this.POLL_INTERVAL);
  }

  /**
   * Poll all active tasks
   */
  private static async pollAllTasks(): Promise<void> {
    const tasks = Array.from(this.activeTasks.values());

    for (const task of tasks) {
      await this.pollTask(task);
    }
  }

  /**
   * Poll a single task
   */
  private static async pollTask(task: PollingTask): Promise<void> {
    try {
      task.pollCount++;
      const elapsed = Date.now() - task.startTime;

      // Check if polling should stop
      if (elapsed > this.MAX_POLL_DURATION || task.pollCount > this.MAX_POLL_COUNT) {
        logger.warn(`Polling timeout for transfer ${task.transferId}`);
        await this.sendTimeoutMessage(task);
        this.stopPolling(task.transferId);
        return;
      }

      // Fetch transaction status from backend
      const status = await BackendService.getTransactionStatus(task.transferId);

      if (status.status !== task.lastStatus) {
        // Status changed, notify user
        logger.info(`Transfer ${task.transferId} status changed: ${task.lastStatus} -> ${status.status}`);
        task.lastStatus = status.status;
        await this.sendStatusUpdate(task, status);

        // Stop polling if transaction is in terminal state
        if (this.isTerminalStatus(status.status)) {
          this.stopPolling(task.transferId);
        }
      }
    } catch (error) {
      logger.error(`Error polling transfer ${task.transferId}:`, error);

      // If too many errors, stop polling
      if (task.pollCount > 10) {
        await this.sendErrorMessage(task);
        this.stopPolling(task.transferId);
      }
    }
  }

  /**
   * Check if status is terminal (no more updates expected)
   */
  private static isTerminalStatus(status: string): boolean {
    return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status.toUpperCase());
  }

  /**
   * Create detailed completion summary message
   */
  private static async createCompletionSummary(details: any): Promise<string> {
    try {
      const sender = details.sender || {};
      const recipient = details.recipient || {};
      const fees = details.fees || {};
      const blockchain = details.blockchain || {};

      // Format amounts
      const senderAmount = sender.amount || 0;
      const recipientAmount = recipient.amount || 0;
      const feeAmount = fees.amount || 0;
      const totalCharged = sender.totalCharged || (senderAmount + feeAmount);

      // Format currencies with symbols
      const senderCurrencyDisplay = this.formatCurrency(senderAmount, sender.currency);
      const recipientCurrencyDisplay = this.formatCurrency(recipientAmount, recipient.currency);
      const feeDisplay = this.formatCurrency(feeAmount, sender.currency);
      const totalDisplay = this.formatCurrency(totalCharged, sender.currency);

      let message = `✅ *Transfer Completed Successfully!*\n\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      // Transfer Summary
      message += `📤 *You Sent*\n`;
      message += `   ${senderCurrencyDisplay}\n\n`;

      message += `📥 *Recipient Receives*\n`;
      message += `   ${recipientCurrencyDisplay}\n`;
      message += `   ${recipient.name || 'N/A'}\n`;
      message += `   ${recipient.bank || 'N/A'} - ${recipient.account || 'N/A'}\n\n`;

      message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      // Transaction Details
      message += `💳 *Transaction Details*\n`;
      message += `   Fee: ${feeDisplay} (${fees.percentage || 0}%)\n`;
      message += `   Total: ${totalDisplay}\n`;
      message += `   Rate: ${this.formatExchangeRate(sender.currency, recipient.currency, recipientAmount / senderAmount)}\n\n`;

      // Blockchain Info (optional, hidden by default)
      if (blockchain.mockADAAmount) {
        message += `⛓️ *Blockchain*\n`;
        message += `   Via mockADA Hub\n`;
        message += `   ${blockchain.mockADAAmount.toFixed(2)} mockADA used\n\n`;
      }

      message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      message += `✨ *Your money is on the way!*\n`;
      message += `The recipient will receive the funds in their bank account shortly.\n\n`;

      message += `Thank you for using TrustBridge! 🌉`;

      return message;
    } catch (error) {
      logger.error('Error creating completion summary:', error);
      // Return fallback message
      return `✅ *Transfer Completed!*\n\nYour transfer has been completed successfully!\n\nThank you for using TrustBridge! 🌉`;
    }
  }

  /**
   * Format currency with symbol
   */
  private static formatCurrency(amount: number, currency: string): string {
    const symbols: Record<string, string> = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CNY': '¥',
      'IDR': 'Rp',
      'PHP': '₱',
      'THB': '฿',
      'MYR': 'RM',
      'SGD': 'S$',
      'INR': '₹',
      'VND': '₫',
      'AED': 'د.إ',
      'MXN': '$',
    };

    const symbol = symbols[currency] || currency;
    const formatted = amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    // For currencies that use symbol-first format
    if (['USD', 'EUR', 'GBP', 'SGD', 'MXN'].includes(currency)) {
      return `${symbol}${formatted}`;
    }

    // For currencies that use symbol-last format
    return `${symbol} ${formatted}`;
  }

  /**
   * Format exchange rate
   */
  private static formatExchangeRate(from: string, to: string, rate: number): string {
    const formatted = rate.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    });
    return `1 ${from} = ${formatted} ${to}`;
  }

  /**
   * Send status update to user
   */
  private static async sendStatusUpdate(
    task: PollingTask,
    status: { transferId: string; status: string; blockchainTx?: string }
  ): Promise<void> {
    if (!this.client) {
      logger.error('WhatsApp client not initialized');
      return;
    }

    try {
      let message = '';

      switch (status.status.toUpperCase()) {
        case 'PAID':
          message = `🔔 *Transaction Update*\n\n`;
          message += `Transaction ID: ${task.transferId}\n`;
          message += `Status: ✅ Payment Confirmed\n\n`;
          message += `Your payment has been received and is being processed. You'll receive another update when the transaction is completed.`;
          break;

        case 'PROCESSING':
          message = `🔔 *Transaction Update*\n\n`;
          message += `Transaction ID: ${task.transferId}\n`;
          message += `Status: ⏳ Processing\n\n`;
          message += `Your transaction is being processed on the blockchain. This may take a few moments.`;
          break;

        case 'COMPLETED':
          // Fetch full transfer details for summary
          try {
            const details = await BackendService.getTransactionDetails(task.transferId);
            message = await this.createCompletionSummary(details);
          } catch (error) {
            // Fallback to simple message if details fetch fails
            logger.error('Failed to fetch transfer details:', error);
            message = `✅ *Transfer Completed!*\n\n`;
            message += `Transaction ID: ${task.transferId}\n\n`;
            message += `Your transfer has been completed successfully!\n\n`;
            message += `Thank you for using TrustBridge! 🌉`;
          }
          break;

        case 'FAILED':
          message = `❌ *Transaction Failed*\n\n`;
          message += `Transaction ID: ${task.transferId}\n\n`;
          message += `Unfortunately, your transaction failed. Please contact support or try again.`;
          break;

        case 'CANCELLED':
          message = `⚠️ *Transaction Cancelled*\n\n`;
          message += `Transaction ID: ${task.transferId}\n\n`;
          message += `Your transaction has been cancelled.`;
          break;

        default:
          message = `🔔 *Transaction Update*\n\n`;
          message += `Transaction ID: ${task.transferId}\n`;
          message += `Status: ${status.status}\n\n`;
          message += `We'll notify you when there are more updates.`;
      }

      await this.client.sendMessage(task.chatId, message);
      logger.info(`Status update sent to ${task.chatId} for transfer ${task.transferId}`);
    } catch (error) {
      logger.error(`Failed to send status update:`, error);
    }
  }

  /**
   * Send timeout message to user
   */
  private static async sendTimeoutMessage(task: PollingTask): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const message = `⏰ Transaction Status Update\n\n` +
        `Transaction ID: ${task.transferId}\n\n` +
        `We're still processing your transaction, but automatic updates have stopped. ` +
        `You can check your transaction status manually by typing "history" or contact support for assistance.\n\n` +
        `Thank you for your patience! 🙏`;

      await this.client.sendMessage(task.chatId, message);
    } catch (error) {
      logger.error(`Failed to send timeout message:`, error);
    }
  }

  /**
   * Send error message to user
   */
  private static async sendErrorMessage(task: PollingTask): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const message = `⚠️ Status Update Error\n\n` +
        `Transaction ID: ${task.transferId}\n\n` +
        `We encountered an error while checking your transaction status. ` +
        `Your transaction is likely still being processed. ` +
        `Please check your transaction history or contact support.\n\n` +
        `Type "history" to view your transactions.`;

      await this.client.sendMessage(task.chatId, message);
    } catch (error) {
      logger.error(`Failed to send error message:`, error);
    }
  }

  /**
   * Get active polling tasks count
   */
  static getActiveTasksCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Get all active transfer IDs
   */
  static getActiveTransfers(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  /**
   * Stop all polling tasks (for shutdown)
   */
  static stopAll(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.activeTasks.clear();
    logger.info('All polling tasks stopped');
  }
}
