import type { User } from '../types/index.js';
interface UserSession {
    user: User;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}
export declare class AuthService {
    private static sessions;
    private static readonly TOKEN_EXPIRY_BUFFER;
    /**
     * Login or register a user via WhatsApp number
     */
    static loginOrRegister(whatsappNumber: string, countryCode?: string): Promise<User>;
    /**
     * Get current user session
     */
    static getSession(whatsappNumber: string): UserSession | null;
    /**
     * Get user info from session
     */
    static getUser(whatsappNumber: string): User | null;
    /**
     * Get access token for a user
     */
    static getAccessToken(whatsappNumber: string): Promise<string | null>;
    /**
     * Check if session is valid
     */
    private static isSessionValid;
    /**
     * Check if token is expiring soon (within buffer time)
     */
    private static isTokenExpiringSoon;
    /**
     * Refresh user session (token refresh logic)
     * Note: This requires /api/auth/refresh endpoint on backend
     */
    private static refreshSession;
    /**
     * Ensure user is authenticated, login if not
     */
    static ensureAuthenticated(whatsappNumber: string): Promise<User>;
    /**
     * Logout user (clear session)
     */
    static logout(whatsappNumber: string): void;
    /**
     * Clear all sessions (for admin/testing purposes)
     */
    static clearAllSessions(): void;
    /**
     * Get session count (for monitoring)
     */
    static getSessionCount(): number;
    /**
     * Get all active sessions (for monitoring)
     */
    static getActiveSessions(): string[];
}
export {};
//# sourceMappingURL=authService.d.ts.map