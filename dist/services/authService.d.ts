import type { AuthResponse, User } from '../types/index.js';
export declare class AuthService {
    private static tokenCache;
    /**
     * Login or register user via WhatsApp number
     */
    static loginOrRegister(whatsappNumber: string, countryCode?: string): Promise<AuthResponse>;
    /**
     * Get cached access token for user
     */
    static getAccessToken(whatsappNumber: string): string | null;
    /**
     * Refresh access token
     */
    static refreshToken(whatsappNumber: string): Promise<string>;
    /**
     * Get user info from backend
     */
    static getCurrentUser(whatsappNumber: string): Promise<User>;
    /**
     * Logout user
     */
    static logout(whatsappNumber: string): Promise<void>;
    /**
     * Clear all cached tokens
     */
    static clearCache(): void;
}
//# sourceMappingURL=authService.d.ts.map