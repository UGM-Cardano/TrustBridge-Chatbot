import 'dotenv/config';
declare const FALLBACK_RATES: Record<string, Record<string, number>>;
export { SUPPORTED_FIAT } from './fiatExchange.js';
export declare function testCMCConnection(): Promise<{
    success: boolean;
    message: string;
    data?: unknown;
}>;
export declare function fetchCryptoPrice(fromSymbol: string, toSymbol: string): Promise<number>;
export declare function getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number>;
export declare function calculateRecipientAmount(senderAmount: number, fromCurrency: string, toCurrency: string): Promise<number>;
export declare function getCurrentRates(): Promise<{
    usdtToIdr: number;
    timestamp: string;
    source: 'api' | 'fallback';
    cached: boolean;
    cacheAge?: string;
}>;
export declare function forceRefreshRates(): Promise<{
    success: boolean;
    message: string;
    rates?: {
        usdtToIdr: number;
    };
}>;
export { FALLBACK_RATES };
export declare function clearExchangeRateCache(): void;
export declare function getCacheStats(): {
    size: number;
    keys: string[];
};
//# sourceMappingURL=exchangeRate.d.ts.map