import axios, { AxiosError } from 'axios';
import logger from '../logger.js';
import { AuthService } from './authService.js';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
export class BackendService {
    /**
     * Get transaction quote (exchange rate calculation)
     */
    static async getQuote(whatsappNumber, sourceCurrency, targetCurrency, sourceAmount) {
        try {
            logger.info(`[BackendService] Getting quote: ${sourceAmount} ${sourceCurrency} -> ${targetCurrency}`);
            // Get access token
            let accessToken = AuthService.getAccessToken(whatsappNumber);
            if (!accessToken) {
                // Auto login if no token
                const auth = await AuthService.loginOrRegister(whatsappNumber);
                accessToken = auth.tokens.accessToken;
            }
            const response = await axios.get(`${BACKEND_URL}/api/transaction/quote`, {
                params: {
                    sourceCurrency,
                    targetCurrency,
                    sourceAmount
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                timeout: 10000
            });
            logger.info(`[BackendService] Quote received: ${JSON.stringify(response.data.quote)}`);
            return response.data.quote;
        }
        catch (error) {
            const axiosError = error;
            logger.error(`[BackendService] Get quote failed:`, axiosError.response?.data || axiosError.message);
            throw new Error(axiosError.response?.data?.error || 'Failed to get quote');
        }
    }
    /**
     * Create transaction
     */
    static async createTransaction(whatsappNumber, request) {
        try {
            logger.info(`[BackendService] Creating transaction for ${whatsappNumber}`);
            // Get access token
            let accessToken = AuthService.getAccessToken(whatsappNumber);
            if (!accessToken) {
                const auth = await AuthService.loginOrRegister(whatsappNumber);
                accessToken = auth.tokens.accessToken;
            }
            const response = await axios.post(`${BACKEND_URL}/api/transaction/create`, request, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });
            logger.info(`[BackendService] Transaction created: ${response.data.transaction.id}`);
            return response.data.transaction;
        }
        catch (error) {
            const axiosError = error;
            logger.error(`[BackendService] Create transaction failed:`, axiosError.response?.data || axiosError.message);
            throw new Error(axiosError.response?.data?.error || 'Failed to create transaction');
        }
    }
    /**
     * Get transaction status
     */
    static async getTransactionStatus(whatsappNumber, transactionId) {
        try {
            logger.info(`[BackendService] Getting transaction status: ${transactionId}`);
            let accessToken = AuthService.getAccessToken(whatsappNumber);
            if (!accessToken) {
                accessToken = await AuthService.refreshToken(whatsappNumber);
            }
            const response = await axios.get(`${BACKEND_URL}/api/transaction/${transactionId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                timeout: 10000
            });
            return response.data.transaction;
        }
        catch (error) {
            const axiosError = error;
            logger.error(`[BackendService] Get transaction status failed:`, axiosError.response?.data || axiosError.message);
            throw new Error(axiosError.response?.data?.error || 'Failed to get transaction status');
        }
    }
    /**
     * Get transaction history
     */
    static async getTransactionHistory(whatsappNumber, limit = 10) {
        try {
            logger.info(`[BackendService] Getting transaction history for ${whatsappNumber}`);
            let accessToken = AuthService.getAccessToken(whatsappNumber);
            if (!accessToken) {
                accessToken = await AuthService.refreshToken(whatsappNumber);
            }
            const response = await axios.get(`${BACKEND_URL}/api/transaction/history`, {
                params: { limit },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                timeout: 10000
            });
            return response.data.transactions;
        }
        catch (error) {
            const axiosError = error;
            logger.error(`[BackendService] Get history failed:`, axiosError.response?.data || axiosError.message);
            throw new Error(axiosError.response?.data?.error || 'Failed to get transaction history');
        }
    }
    /**
     * Check if backend is healthy
     */
    static async healthCheck() {
        try {
            const response = await axios.get(`${BACKEND_URL}/`, { timeout: 5000 });
            return response.status === 200;
        }
        catch (error) {
            logger.error('[BackendService] Health check failed:', error);
            return false;
        }
    }
}
//# sourceMappingURL=backendService.js.map