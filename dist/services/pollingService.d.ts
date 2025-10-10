import pkg from 'whatsapp-web.js';
declare const Client: typeof pkg.Client;
export declare class PollingService {
    private static client;
    private static activeTasks;
    private static pollingInterval;
    private static readonly POLL_INTERVAL;
    private static readonly MAX_POLL_DURATION;
    private static readonly MAX_POLL_COUNT;
    /**
     * Initialize polling service with WhatsApp client
     */
    static initialize(whatsappClient: typeof Client.prototype): void;
    /**
     * Start polling for a transaction
     */
    static startPolling(transferId: string, chatId: string): void;
    /**
     * Stop polling for a specific transaction
     */
    static stopPolling(transferId: string): void;
    /**
     * Start the main polling loop
     */
    private static startPollingLoop;
    /**
     * Poll all active tasks
     */
    private static pollAllTasks;
    /**
     * Poll a single task
     */
    private static pollTask;
    /**
     * Check if status is terminal (no more updates expected)
     */
    private static isTerminalStatus;
    /**
     * Send status update to user
     */
    private static sendStatusUpdate;
    /**
     * Send timeout message to user
     */
    private static sendTimeoutMessage;
    /**
     * Send error message to user
     */
    private static sendErrorMessage;
    /**
     * Get active polling tasks count
     */
    static getActiveTasksCount(): number;
    /**
     * Get all active transfer IDs
     */
    static getActiveTransfers(): string[];
    /**
     * Stop all polling tasks (for shutdown)
     */
    static stopAll(): void;
}
export {};
//# sourceMappingURL=pollingService.d.ts.map