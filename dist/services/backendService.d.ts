import type { TransactionQuote, Transaction, CreateTransactionRequest } from '../types/index.js';
export declare class BackendService {
    /**
     * Get transaction quote (exchange rate calculation)
     */
    static getQuote(whatsappNumber: string, sourceCurrency: string, targetCurrency: string, sourceAmount: number): Promise<TransactionQuote>;
    /**
     * Create transaction
     */
    static createTransaction(whatsappNumber: string, request: CreateTransactionRequest): Promise<Transaction>;
    /**
     * Get transaction status
     */
    static getTransactionStatus(whatsappNumber: string, transactionId: string): Promise<Transaction>;
    /**
     * Get transaction history
     */
    static getTransactionHistory(whatsappNumber: string, limit?: number): Promise<Transaction[]>;
    /**
     * Check if backend is healthy
     */
    static healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=backendService.d.ts.map