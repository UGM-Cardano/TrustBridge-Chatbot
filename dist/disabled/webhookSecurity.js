import crypto from 'crypto';
import logger from '../logger.js';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
if (!WEBHOOK_SECRET) {
    logger.warn('[WebhookSecurity] WEBHOOK_SECRET not set - webhook verification disabled!');
}
/**
 * Generate HMAC SHA256 signature for webhook payload
 */
export function generateSignature(payload) {
    if (!WEBHOOK_SECRET) {
        throw new Error('WEBHOOK_SECRET not configured');
    }
    return crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');
}
/**
 * Verify webhook signature
 */
export function verifySignature(payload, signature) {
    if (!WEBHOOK_SECRET) {
        logger.warn('[WebhookSecurity] Skipping signature verification - no secret configured');
        return true; // Allow in development
    }
    try {
        const expectedSignature = generateSignature(payload);
        // Timing-safe comparison to prevent timing attacks
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        const actualBuffer = Buffer.from(signature, 'hex');
        if (expectedBuffer.length !== actualBuffer.length) {
            return false;
        }
        return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    }
    catch (error) {
        logger.error('[WebhookSecurity] Signature verification error:', error);
        return false;
    }
}
/**
 * Extract signature from request headers
 */
export function extractSignature(headers) {
    const signature = headers['x-webhook-signature'];
    if (!signature) {
        return null;
    }
    // Handle both single string and array of strings
    const result = Array.isArray(signature) ? signature[0] : signature;
    return result || null;
}
//# sourceMappingURL=webhookSecurity.js.map