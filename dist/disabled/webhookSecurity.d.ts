/**
 * Generate HMAC SHA256 signature for webhook payload
 */
export declare function generateSignature(payload: string): string;
/**
 * Verify webhook signature
 */
export declare function verifySignature(payload: string, signature: string): boolean;
/**
 * Extract signature from request headers
 */
export declare function extractSignature(headers: Record<string, string | string[] | undefined>): string | null;
//# sourceMappingURL=webhookSecurity.d.ts.map