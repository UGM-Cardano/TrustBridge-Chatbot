import 'dotenv/config';
import logger from './logger.js';
const FREECURRENCY_API_KEY = process.env.FREECURRENCY_API_KEY || '';
if (!FREECURRENCY_API_KEY) {
    logger.warn('[FiatExchange] FREECURRENCY_API_KEY not configured — fiat API calls will fail');
}
else {
    logger.info(`[FiatExchange] FREECURRENCY_API_KEY configured (length ${FREECURRENCY_API_KEY.length})`);
}
// Lazy-load the CommonJS library using dynamic import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let freecurrencyapiClient = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFreecurrencyClient() {
    if (!freecurrencyapiClient) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = await import('@everapi/freecurrencyapi-js');
        const Freecurrencyapi = mod.default || mod;
        freecurrencyapiClient = new Freecurrencyapi(FREECURRENCY_API_KEY);
    }
    return freecurrencyapiClient;
}
// Simple cache: map from base currency to { rates, timestamp }
const fiatCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// Daftar mata uang fiat yang didukung oleh modul fiatExchange.
// Taruh daftar di sini supaya mudah dibaca dan dipelihara.
export const SUPPORTED_FIAT = [
    'USD', // US Dollar
    'EUR', // Euro
    'JPY', // Japanese Yen
    'AUD', // Australian Dollar
    'CAD', // Canadian Dollar
    'SGD', // Singapore Dollar
    'MYR', // Malaysian Ringgit
    'THB', // Thai Baht
    'PHP', // Philippine Peso
    'BND', // Brunei Dollar
    'CNY', // Chinese Yuan
    'IDR' // Indonesian Rupiah (if needed)
];
async function fetchLatest(base = 'USD') {
    const cacheKey = base;
    const cached = fiatCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        logger.info(`[FiatExchange] Using cached rates for base=${base}`);
        return cached.rates;
    }
    if (!FREECURRENCY_API_KEY) {
        throw new Error('FREECURRENCY_API_KEY not configured');
    }
    logger.info(`[FiatExchange] Fetching fiat rates from FreeCurrencyAPI for base=${base}`);
    try {
        // Get the client (lazy-loaded CommonJS module)
        const client = await getFreecurrencyClient();
        // Use the official wrapper library's .latest() method
        // Note: omit 'currencies' param to get all supported currencies
        const response = await client.latest({
            base_currency: base
        });
        if (!response || typeof response !== 'object' || !response.data) {
            logger.error('[FiatExchange] Unexpected API payload', response);
            throw new Error('Fiat API returned unexpected payload');
        }
        const rates = response.data || {};
        fiatCache.set(cacheKey, { rates, timestamp: Date.now() });
        return rates;
    }
    catch (err) {
        logger.error('[FiatExchange] fetchLatest error:', err);
        throw err;
    }
}
export async function getFiatRate(from, to) {
    if (from === to)
        return 1.0;
    // FreeCurrencyAPI uses a base; we'll fetch rates with base=from and look up `to`.
    try {
        const rates = await fetchLatest(from);
        const rate = rates[to];
        if (typeof rate !== 'number') {
            // If API doesn't provide direct, fetch base USD and compute via USD
            logger.warn(`[FiatExchange] Rate ${from}->${to} not found; attempting via USD fallback`);
            const ratesFromUSD = await fetchLatest('USD');
            const fromToUSD = 1 / (ratesFromUSD[from] || 1);
            const usdToTarget = ratesFromUSD[to] || 1;
            return fromToUSD * usdToTarget;
        }
        return rate;
    }
    catch (err) {
        logger.error('[FiatExchange] getFiatRate error', err);
        throw err;
    }
}
export async function convertFiat(amount, from, to) {
    const rate = await getFiatRate(from, to);
    return amount * rate;
}
export function clearFiatCache() {
    fiatCache.clear();
}
export function getFiatCacheStats() {
    return { size: fiatCache.size, keys: Array.from(fiatCache.keys()) };
}
export default { getFiatRate, convertFiat, clearFiatCache, getFiatCacheStats };
//# sourceMappingURL=fiatExchange.js.map