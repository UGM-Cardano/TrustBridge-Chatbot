import axios, { AxiosError } from 'axios';
import logger from '../logger.js';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
export class AuthService {
    static tokenCache = new Map();
    /**
     * Login or register user via WhatsApp number
     */
    static async loginOrRegister(whatsappNumber, countryCode = 'ID') {
        try {
            logger.info(`[AuthService] Logging in user: ${whatsappNumber}`);
            const response = await axios.post(`${BACKEND_URL}/api/auth/login`, {
                whatsappNumber,
                countryCode
            }, {
                timeout: 10000
            });
            const { user, tokens } = response.data;
            // Cache token (expires in 1 hour)
            this.tokenCache.set(whatsappNumber, {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: Date.now() + 60 * 60 * 1000 // 1 hour
            });
            logger.info(`[AuthService] Login successful for ${whatsappNumber}`);
            return response.data;
        }
        catch (error) {
            const axiosError = error;
            logger.error(`[AuthService] Login failed for ${whatsappNumber}:`, axiosError.response?.data || axiosError.message);
            throw new Error(axiosError.response?.data?.error || 'Login failed');
        }
    }
    /**
     * Get cached access token for user
     */
    static getAccessToken(whatsappNumber) {
        const cached = this.tokenCache.get(whatsappNumber);
        if (!cached) {
            return null;
        }
        // Check if token expired
        if (Date.now() > cached.expiresAt) {
            this.tokenCache.delete(whatsappNumber);
            return null;
        }
        return cached.accessToken;
    }
    /**
     * Refresh access token
     */
    static async refreshToken(whatsappNumber) {
        try {
            const cached = this.tokenCache.get(whatsappNumber);
            if (!cached || !cached.refreshToken) {
                throw new Error('No refresh token available');
            }
            logger.info(`[AuthService] Refreshing token for ${whatsappNumber}`);
            const response = await axios.post(`${BACKEND_URL}/api/auth/refresh`, {
                refreshToken: cached.refreshToken
            });
            const { accessToken, refreshToken } = response.data.tokens;
            // Update cache
            this.tokenCache.set(whatsappNumber, {
                accessToken,
                refreshToken,
                expiresAt: Date.now() + 60 * 60 * 1000
            });
            return accessToken;
        }
        catch (error) {
            const axiosError = error;
            logger.error(`[AuthService] Token refresh failed:`, axiosError.response?.data || axiosError.message);
            this.tokenCache.delete(whatsappNumber);
            throw new Error('Token refresh failed');
        }
    }
    /**
     * Get user info from backend
     */
    static async getCurrentUser(whatsappNumber) {
        try {
            let accessToken = this.getAccessToken(whatsappNumber);
            // Refresh if expired
            if (!accessToken) {
                accessToken = await this.refreshToken(whatsappNumber);
            }
            const response = await axios.get(`${BACKEND_URL}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            return response.data.user;
        }
        catch (error) {
            const axiosError = error;
            logger.error(`[AuthService] Get user failed:`, axiosError.response?.data || axiosError.message);
            throw new Error('Failed to get user info');
        }
    }
    /**
     * Logout user
     */
    static async logout(whatsappNumber) {
        try {
            const accessToken = this.getAccessToken(whatsappNumber);
            if (accessToken) {
                await axios.post(`${BACKEND_URL}/api/auth/logout`, {}, {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
            }
            this.tokenCache.delete(whatsappNumber);
            logger.info(`[AuthService] Logout successful for ${whatsappNumber}`);
        }
        catch (error) {
            const axiosError = error;
            logger.error(`[AuthService] Logout failed:`, axiosError.response?.data || axiosError.message);
            this.tokenCache.delete(whatsappNumber);
        }
    }
    /**
     * Clear all cached tokens
     */
    static clearCache() {
        this.tokenCache.clear();
        logger.info('[AuthService] Token cache cleared');
    }
}
//# sourceMappingURL=authService.js.map