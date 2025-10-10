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
      let message = `🔔 Transaction Update\n\nTransaction ID: ${task.transferId}\n`;

      switch (status.status.toUpperCase()) {
        case 'PAID':
          message += `Status: ✅ Payment Confirmed\n\n`;
          message += `Your payment has been received and is being processed. You'll receive another update when the transaction is completed.`;
          break;

        case 'PROCESSING':
          message += `Status: ⏳ Processing\n\n`;
          message += `Your transaction is being processed on the blockchain. This may take a few minutes.`;
          break;

        case 'COMPLETED':
          message += `Status: ✅ Completed\n\n`;
          message += `Your transfer has been completed successfully!`;

          if (status.blockchainTx) {
            message += `\n\n🔗 Blockchain Transaction:\n${status.blockchainTx}`;
          }

          message += `\n\nThank you for using TrustBridge! 🌉`;
          break;

        case 'FAILED':
          message += `Status: ❌ Failed\n\n`;
          message += `Unfortunately, your transaction failed. Please contact support or try again.`;
          break;

        case 'CANCELLED':
          message += `Status: ⚠️ Cancelled\n\n`;
          message += `Your transaction has been cancelled.`;
          break;

        default:
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
