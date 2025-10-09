import 'dotenv/config';
export declare const SUPPORTED_FIAT: string[];
export declare function getFiatRate(from: string, to: string): Promise<number>;
export declare function convertFiat(amount: number, from: string, to: string): Promise<number>;
export declare function clearFiatCache(): void;
export declare function getFiatCacheStats(): {
    size: number;
    keys: string[];
};
declare const _default: {
    getFiatRate: typeof getFiatRate;
    convertFiat: typeof convertFiat;
    clearFiatCache: typeof clearFiatCache;
    getFiatCacheStats: typeof getFiatCacheStats;
};
export default _default;
//# sourceMappingURL=fiatExchange.d.ts.map