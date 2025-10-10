// TypeScript Types for TrustBridge Backend Integration

export interface User {
  id: string;
  whatsappNumber: string;
  countryCode: string;
  status: 'PENDING_KYC' | 'VERIFIED' | 'SUSPENDED';
  kycNftTokenId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface TransactionQuote {
  sourceAmount: number;
  targetAmount: number;
  exchangeRate: number;
  feeAmount: number;
  totalAmount: number;
  timestamp: number;
}

export interface Transaction {
  id: string;
  senderId: string;
  recipientPhone: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: number;
  targetAmount: number;
  exchangeRate: number;
  feeAmount: number;
  totalAmount: number;
  status: 'PENDING' | 'PAID' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  blockchainTxHash?: string;
  recipientBankAccount?: string;
  paymentLink?: string;
  createdAt: string;
  completedAt?: string;
}

export interface CreateTransactionRequest {
  recipientPhone: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: number;
  recipientBankAccount?: string;
  recipientBank?: string;
  recipientName?: string;
  paymentMethod?: 'WALLET' | 'MASTERCARD';
  card?: {
    number: string;
    cvc: string;
    expiry: string;
  };
}

export interface WebhookPayload {
  transactionId: string;
  recipientPhone: string;
  status: 'PENDING' | 'PAID' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  timestamp: number;
  signature: string;
  data?: {
    sourceAmount?: number;
    sourceCurrency?: string;
    targetAmount?: number;
    targetCurrency?: string;
    recipientName?: string;
    recipientBank?: string;
    recipientAccount?: string;
    failureReason?: string;
    blockchainTxHash?: string;
  };
}

export interface BackendError {
  error: string;
  details?: string;
}
