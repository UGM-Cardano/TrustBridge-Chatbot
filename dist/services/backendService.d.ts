import type { CreateTransactionRequest, Transaction, AuthResponse } from '../types/index.js';
export declare class BackendService {
    private static apiClient;
    private static accessTokens;
    private static userIds;
    static initialize(): void;
    /**
     * Authenticate user with backend using WhatsApp number
     */
    static authenticate(whatsappNumber: string, countryCode?: string): Promise<AuthResponse>;
    /**
     * Get or create authentication for a user
     */
    static ensureAuthenticated(whatsappNumber: string): Promise<string>;
    /**
     * Get access token for authenticated request
     */
    private static getAuthHeader;
    /**
     * Calculate transfer amounts before initiating transaction
     */
    static calculateTransfer(senderCurrency: string, recipientCurrency: string, amount: number, paymentMethod: 'WALLET' | 'MASTERCARD'): Promise<{
        senderAmount: number;
        recipientAmount: number;
        exchangeRate: number;
        fee: {
            percentage: number;
            amount: number;
        };
        totalAmount: number;
    }>;
    /**
     * Create a new transaction
     */
    static createTransaction(whatsappNumber: string, request: CreateTransactionRequest): Promise<Transaction>;
    /**
     * Get transaction status
     */
    static getTransactionStatus(transferId: string): Promise<{
        transferId: string;
        status: string;
        blockchainTx?: string;
    }>;
    /**
     * Get detailed transaction information
     */
    static getTransactionDetails(transferId: string): Promise<any>;
    /**
     * Get transaction history for authenticated user
     */
    static getTransactionHistory(whatsappNumber: string, limit?: number): Promise<any[]>;
    /**
     * Handle API errors with proper logging
     */
    private static handleError;
    /**
     * Clear authentication cache (for testing or logout)
     */
    static clearAuth(whatsappNumber?: string): void;
}
//# sourceMappingURL=backendService.d.ts.map