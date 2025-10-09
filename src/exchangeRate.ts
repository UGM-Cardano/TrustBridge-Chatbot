import 'dotenv/config';
import logger from './logger.js';
import { SUPPORTED_FIAT as FIAT_CURRENCIES, getFiatRate } from './fiatExchange.js';

// CoinMarketCap API configuration
const CMC_API_KEY = process.env.CMC_API_KEY || '';
const CMC_BASE_URL = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';

// Log API key status (without exposing the key)
if (CMC_API_KEY) {
  logger.info(`[ExchangeRate] CoinMarketCap API key configured (length: ${CMC_API_KEY.length})`);
  logger.info(`[ExchangeRate] First 8 chars: ${CMC_API_KEY.substring(0, 8)}...`);
} else {
  logger.warn('[ExchangeRate] CoinMarketCap API key not configured - will use fallback rates');
}

// Cache for exchange rates (to avoid hitting API limits)
const exchangeRateCache = new Map<string, { rate: number; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Auto-refresh cache in background
setInterval(() => {
  const now = Date.now();
  const expiredKeys: string[] = [];
  
  for (const [key, cached] of exchangeRateCache.entries()) {
    if (now - cached.timestamp > CACHE_DURATION) {
      expiredKeys.push(key);
    }
  }
  
  if (expiredKeys.length > 0) {
    logger.info(`[ExchangeRate] Auto-clearing ${expiredKeys.length} expired cache entries: ${expiredKeys.join(', ')}`);
    expiredKeys.forEach(key => exchangeRateCache.delete(key));
  }
}, 60 * 1000); // Check every minute

// Fallback rates if API fails (USDT↔IDR only)
const FALLBACK_RATES: Record<string, Record<string, number>> = {
  USDT: { IDR: 16740 },
  IDR: { USDT: 0.0000597 }
};

// Supported fiat currencies for card payments (re-exported from fiatExchange)
export { SUPPORTED_FIAT } from './fiatExchange.js';

// Test CoinMarketCap API connection
export async function testCMCConnection(): Promise<{ success: boolean; message: string; data?: unknown }> {
  if (!CMC_API_KEY) {
    return {
      success: false,
      message: 'API key not configured in environment'
    };
  }

  try {
    logger.info('[ExchangeRate] Testing CoinMarketCap API connection...');
    logger.info(`[ExchangeRate] API Key length: ${CMC_API_KEY.length}`);
    logger.info(`[ExchangeRate] API Key first 12 chars: ${CMC_API_KEY.substring(0, 12)}...`);
    logger.info(`[ExchangeRate] API Key last 4 chars: ...${CMC_API_KEY.slice(-4)}`);
    
    const testUrl = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=1';
    
    const headers = {
      'X-CMC_PRO_API_KEY': CMC_API_KEY,
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate'
    };
    
    logger.info('[ExchangeRate] Request headers:', JSON.stringify(headers, null, 2));
    
    const response = await fetch(testUrl, { headers });

    logger.info(`[ExchangeRate] Response status: ${response.status}`);
    logger.info(`[ExchangeRate] Response headers:`, JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[ExchangeRate] API test failed: ${response.status} ${response.statusText}`);
      logger.error(`[ExchangeRate] Response body: ${errorText}`);
      
      return {
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
        data: {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          headers: Object.fromEntries(response.headers.entries())
        }
      };
    }

    const data = await response.json();
    
    if (data.status?.error_code !== 0) {
      logger.error(`[ExchangeRate] API error: ${data.status?.error_message}`);
      return {
        success: false,
        message: data.status?.error_message || 'Unknown API error',
        data: data.status
      };
    }

    logger.info('[ExchangeRate] CoinMarketCap API connection successful');
    return {
      success: true,
      message: 'API connection successful',
      data: data.status
    };

  } catch (error) {
    logger.error(`[ExchangeRate] Connection test failed:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Network error: ${errorMessage}`
    };
  }
}

// Fetch crypto price from CoinMarketCap
export async function fetchCryptoPrice(fromSymbol: string, toSymbol: string): Promise<number> {
  if (!CMC_API_KEY) {
    throw new Error('CoinMarketCap API key not configured');
  }

  logger.info(`[ExchangeRate] Fetching ${fromSymbol} -> ${toSymbol} from CoinMarketCap`);
  
  const url = `${CMC_BASE_URL}?symbol=${fromSymbol}&convert=${toSymbol}`;
  const headers = {
    'X-CMC_PRO_API_KEY': CMC_API_KEY,
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate'
  };
  
  logger.info(`[ExchangeRate] Request URL: ${url}`);
  logger.info(`[ExchangeRate] API Key being sent: ${CMC_API_KEY.substring(0, 8)}...${CMC_API_KEY.slice(-4)}`);
  
  const response = await fetch(url, { headers });

  logger.info(`[ExchangeRate] Response status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`[ExchangeRate] Quote API error: ${response.status} ${response.statusText}`);
    logger.error(`[ExchangeRate] Response headers:`, JSON.stringify(Object.fromEntries(response.headers.entries())));
    logger.error(`[ExchangeRate] Response body: ${errorText}`);
    throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.status?.error_code !== 0) {
    logger.error(`[ExchangeRate] API error: ${data.status?.error_message}`);
    logger.error(`[ExchangeRate] Full status:`, JSON.stringify(data.status));
    throw new Error(`API error: ${data.status?.error_message}`);
  }

  const cryptoData = data.data?.[fromSymbol];
  if (!cryptoData?.quote?.[toSymbol]) {
    logger.error(`[ExchangeRate] Invalid data structure for ${fromSymbol}->${toSymbol}`);
    logger.error(`[ExchangeRate] Available data keys:`, Object.keys(data.data || {}));
    if (data.data?.[fromSymbol]) {
      logger.error(`[ExchangeRate] Available quote currencies:`, Object.keys(data.data[fromSymbol].quote || {}));
    }
    throw new Error(`Price data not found for ${fromSymbol} -> ${toSymbol}`);
  }

  const price = cryptoData.quote[toSymbol].price;
  logger.info(`[ExchangeRate] ${fromSymbol} -> ${toSymbol} rate: ${price}`);
  return price;
}



// Main function to get exchange rate with caching
export async function getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
  // Same currency
  if (fromCurrency === toCurrency) {
    return 1.0;
  }

  const cacheKey = `${fromCurrency}-${toCurrency}`;
  
  // Check cache first
  const cached = exchangeRateCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    logger.info(`[ExchangeRate] Using cached rate for ${fromCurrency} -> ${toCurrency}: ${cached.rate}`);
    return cached.rate;
  }

  try {
    let rate: number;

    // Check if both currencies are fiat - use FreeCurrencyAPI
    const fromIsFiat = FIAT_CURRENCIES.includes(fromCurrency);
    const toIsFiat = FIAT_CURRENCIES.includes(toCurrency);

    if (fromIsFiat && toIsFiat) {
      logger.info(`[ExchangeRate] Fiat-to-fiat detected: ${fromCurrency} -> ${toCurrency}, using FreeCurrencyAPI`);
      rate = await getFiatRate(fromCurrency, toCurrency);
    }
    // Handle USDT to IDR conversion
    else if (fromCurrency === 'USDT' && toCurrency === 'IDR') {
      logger.info('[ExchangeRate] Getting USDT->IDR directly from CoinMarketCap');
      rate = await fetchCryptoPrice('USDT', 'IDR');
    } else if (fromCurrency === 'IDR' && toCurrency === 'USDT') {
      logger.info('[ExchangeRate] Getting IDR->USDT by inverting USDT->IDR rate');
      // Since CMC doesn't support IDR as base currency, we'll use USDT->IDR and invert
      const usdtToIdr = await fetchCryptoPrice('USDT', 'IDR');
      rate = 1 / usdtToIdr;
    } else {
      // Try direct conversion from CoinMarketCap for any other currency pairs
      rate = await fetchCryptoPrice(fromCurrency, toCurrency);
    }

    // Cache the result
    exchangeRateCache.set(cacheKey, { rate, timestamp: Date.now() });
    logger.info(`[ExchangeRate] Fresh rate: 1 ${fromCurrency} = ${rate} ${toCurrency}`);
    return rate;
    
  } catch (error) {
    logger.error(`[ExchangeRate] Failed to fetch from API:`, error);
    
    // Fall back to hardcoded rates
    const fallbackRate = FALLBACK_RATES[fromCurrency]?.[toCurrency];
    if (fallbackRate) {
      logger.info(`[ExchangeRate] Using fallback rate: 1 ${fromCurrency} = ${fallbackRate} ${toCurrency}`);
      return fallbackRate;
    }
    
    logger.warn(`[ExchangeRate] No fallback rate available for ${fromCurrency} -> ${toCurrency}, using 1.0`);
    return 1.0;
  }
}

// Calculate recipient amount
export async function calculateRecipientAmount(senderAmount: number, fromCurrency: string, toCurrency: string): Promise<number> {
  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return senderAmount * rate;
}

// Get current exchange rates for display
export async function getCurrentRates(): Promise<{
  usdtToIdr: number;
  timestamp: string;
  source: 'api' | 'fallback';
  cached: boolean;
  cacheAge?: string;
}> {
  try {
    const usdtKey = 'USDT-IDR';
    const now = Date.now();
    
    // Check if rate is cached and fresh
    const usdtCached = exchangeRateCache.get(usdtKey);
    const usdtIsFresh = usdtCached && (now - usdtCached.timestamp < CACHE_DURATION);
    
    const usdtToIdr = await getExchangeRate('USDT', 'IDR');
    
    // Calculate cache age for display
    let cacheAge: string | undefined;
    if (usdtIsFresh) {
      const ageMinutes = Math.floor((now - usdtCached!.timestamp) / (1000 * 60));
      cacheAge = ageMinutes === 0 ? 'Just now' : `${ageMinutes} minute(s) ago`;
    }
    
    return {
      usdtToIdr,
      timestamp: new Date().toLocaleString('id-ID'),
      source: 'api',
      cached: !!usdtIsFresh,
      ...(cacheAge && { cacheAge })
    };
  } catch (error) {
    logger.error('[ExchangeRate] Failed to get current rates:', error);
    
    return {
      usdtToIdr: FALLBACK_RATES.USDT?.IDR || 16740,
      timestamp: new Date().toLocaleString('id-ID'),
      source: 'fallback',
      cached: false
    };
  }
}

// Force refresh rates (bypass cache)
export async function forceRefreshRates(): Promise<{
  success: boolean;
  message: string;
  rates?: { usdtToIdr: number };
}> {
  try {
    logger.info('[ExchangeRate] Force refreshing exchange rates...');
    
    // Clear relevant cache entries
    exchangeRateCache.delete('USDT-IDR');
    
    // Fetch fresh rate
    const usdtToIdr = await getExchangeRate('USDT', 'IDR');
    
    return {
      success: true,
      message: 'USDT rate refreshed successfully',
      rates: { usdtToIdr }
    };
  } catch (error) {
    logger.error('[ExchangeRate] Failed to force refresh rates:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Export fallback rates for external use
export { FALLBACK_RATES };

// Export cache management functions
export function clearExchangeRateCache(): void {
  exchangeRateCache.clear();
  logger.info('[ExchangeRate] Cache cleared');
}

export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: exchangeRateCache.size,
    keys: Array.from(exchangeRateCache.keys())
  };
}