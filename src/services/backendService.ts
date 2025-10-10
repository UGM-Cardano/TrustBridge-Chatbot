import axios, { type AxiosInstance, AxiosError } from 'axios';
import logger from '../logger.js';
import type { CreateTransactionRequest, Transaction, AuthResponse } from '../types/index.js';

export class BackendService {
  private static apiClient: AxiosInstance;
  private static accessTokens: Map<string, string> = new Map();
  private static userIds: Map<string, string> = new Map();

  static initialize() {
    const baseURL = process.env.BACKEND_API_URL || 'https://api-trustbridge.izcy.tech';
    const timeout = parseInt(process.env.BACKEND_API_TIMEOUT || '30000', 10);

    this.apiClient = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info(`BackendService initialized with baseURL: ${baseURL}`);
  }

  /**
   * Authenticate user with backend using WhatsApp number
   */
  static async authenticate(whatsappNumber: string, countryCode: string = '+62'): Promise<AuthResponse> {
    try {
      logger.info(`Authenticating user: ${whatsappNumber}`);

      const response = await this.apiClient.post<AuthResponse>('/api/auth/login', {
        whatsappNumber,
        countryCode,
      });

      if (response.data && response.data.tokens) {
        // Store tokens for this user
        this.accessTokens.set(whatsappNumber, response.data.tokens.accessToken);
        this.userIds.set(whatsappNumber, response.data.user.id);
        logger.info(`User authenticated successfully: ${whatsappNumber}`);
      }

      return response.data;
    } catch (error) {
      this.handleError('Authentication failed', error);
      throw error;
    }
  }

  /**
   * Get or create authentication for a user
   */
  static async ensureAuthenticated(whatsappNumber: string): Promise<string> {
    // Check if we already have a valid token
    const existingToken = this.accessTokens.get(whatsappNumber);
    if (existingToken) {
      return existingToken;
    }

    // Authenticate user
    const authResponse = await this.authenticate(whatsappNumber);
    return authResponse.tokens.accessToken;
  }

  /**
   * Get access token for authenticated request
   */
  private static async getAuthHeader(whatsappNumber: string): Promise<Record<string, string>> {
    const token = await this.ensureAuthenticated(whatsappNumber);
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Calculate transfer amounts before initiating transaction
   */
  static async calculateTransfer(
    senderCurrency: string,
    recipientCurrency: string,
    amount: number,
    paymentMethod: 'WALLET' | 'MASTERCARD'
  ): Promise<{
    senderAmount: number;
    recipientAmount: number;
    exchangeRate: number;
    fee: { percentage: number; amount: number };
    totalAmount: number;
  }> {
    try {
      logger.info(`Calculating transfer: ${amount} ${senderCurrency} -> ${recipientCurrency}`);

      const response = await this.apiClient.post('/api/transfer/calculate', {
        senderCurrency,
        recipientCurrency,
        amount,
        paymentMethod,
      });

      if (response.data && response.data.success) {
        return response.data.data;
      }

      throw new Error('Invalid response from calculate endpoint');
    } catch (error) {
      this.handleError('Transfer calculation failed', error);
      throw error;
    }
  }

  /**
   * Create a new transaction
   */
  static async createTransaction(
    whatsappNumber: string,
    request: CreateTransactionRequest
  ): Promise<Transaction> {
    try {
      logger.info(`Creating transaction for ${whatsappNumber}:`, JSON.stringify(request, null, 2));

      // Ensure user is authenticated
      await this.ensureAuthenticated(whatsappNumber);
      const authHeaders = await this.getAuthHeader(whatsappNumber);

      // Build the payload for the backend
      const payload = {
        paymentMethod: request.paymentMethod || 'WALLET',
        senderCurrency: request.sourceCurrency,
        senderAmount: request.sourceAmount,
        recipientName: request.recipientName,
        recipientCurrency: request.targetCurrency,
        recipientBank: request.recipientBank, // Bank name (e.g., BNI, BCA)
        recipientAccount: request.recipientBankAccount, // Account number
        cardDetails: request.card,
      };

      const response = await this.apiClient.post('/api/transfer/initiate', payload, {
        headers: authHeaders,
      });

      if (response.data && response.data.success) {
        const transferData = response.data.data;

        // Map backend response to Transaction format
        const transaction: Transaction = {
          id: transferData.id,
          senderId: this.userIds.get(whatsappNumber) || '',
          recipientPhone: request.recipientPhone,
          sourceCurrency: request.sourceCurrency,
          targetCurrency: request.targetCurrency,
          sourceAmount: request.sourceAmount,
          targetAmount: transferData.recipient?.expectedAmount || 0,
          exchangeRate: transferData.conversion?.exchangeRate || 0,
          feeAmount: transferData.fees?.amount || 0,
          totalAmount: transferData.sender?.totalAmount || 0,
          status: 'PENDING',
          ...(request.recipientBankAccount && { recipientBankAccount: request.recipientBankAccount }),
          ...(transferData.paymentLink && { paymentLink: transferData.paymentLink }),
          createdAt: transferData.createdAt || new Date().toISOString(),
        };

        logger.info(`Transaction created successfully: ${transaction.id}`);
        return transaction;
      }

      throw new Error('Invalid response from initiate endpoint');
    } catch (error) {
      this.handleError('Transaction creation failed', error);
      throw error;
    }
  }

  /**
   * Get transaction status
   */
  static async getTransactionStatus(transferId: string): Promise<{
    transferId: string;
    status: string;
    blockchainTx?: string;
  }> {
    try {
      const response = await this.apiClient.get(`/api/transfer/status/${transferId}`);

      if (response.data && response.data.success) {
        return response.data.data;
      }

      throw new Error('Invalid response from status endpoint');
    } catch (error) {
      this.handleError('Failed to get transaction status', error);
      throw error;
    }
  }

  /**
   * Get detailed transaction information
   */
  static async getTransactionDetails(transferId: string): Promise<any> {
    try {
      const response = await this.apiClient.get(`/api/transfer/details/${transferId}`);

      if (response.data && response.data.success) {
        return response.data.data;
      }

      throw new Error('Invalid response from details endpoint');
    } catch (error) {
      this.handleError('Failed to get transaction details', error);
      throw error;
    }
  }

  /**
   * Get transaction history for authenticated user
   */
  static async getTransactionHistory(whatsappNumber: string, limit: number = 10): Promise<any[]> {
    try {
      logger.info(`Fetching transaction history for ${whatsappNumber}`);

      // Ensure user is authenticated
      await this.ensureAuthenticated(whatsappNumber);
      const authHeaders = await this.getAuthHeader(whatsappNumber);

      const response = await this.apiClient.get(`/api/transactions/history?limit=${limit}`, {
        headers: authHeaders,
      });

      if (response.data && response.data.success) {
        return response.data.transactions || [];
      }

      throw new Error('Invalid response from history endpoint');
    } catch (error) {
      this.handleError('Failed to get transaction history', error);
      throw error;
    }
  }

  /**
   * Handle API errors with proper logging
   */
  private static handleError(message: string, error: unknown): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;

      logger.error(`${message}:`, {
        status,
        data,
        message: axiosError.message,
      });

      // Handle specific error cases
      if (status === 401) {
        // Clear stored tokens on authentication failure
        this.accessTokens.clear();
        this.userIds.clear();
      }
    } else {
      logger.error(`${message}:`, error);
    }
  }

  /**
   * Clear authentication cache (for testing or logout)
   */
  static clearAuth(whatsappNumber?: string): void {
    if (whatsappNumber) {
      this.accessTokens.delete(whatsappNumber);
      this.userIds.delete(whatsappNumber);
      logger.info(`Cleared auth cache for ${whatsappNumber}`);
    } else {
      this.accessTokens.clear();
      this.userIds.clear();
      logger.info('Cleared all auth cache');
    }
  }
}

// Initialize on module load
BackendService.initialize();
