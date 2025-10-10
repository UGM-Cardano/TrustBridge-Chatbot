import logger from '../logger.js';
import { BackendService } from './backendService.js';
import type { AuthResponse, User } from '../types/index.js';

interface UserSession {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class AuthService {
  private static sessions: Map<string, UserSession> = new Map();
  private static readonly TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes buffer

  /**
   * Login or register a user via WhatsApp number
   */
  static async loginOrRegister(whatsappNumber: string, countryCode: string = '+62'): Promise<User> {
    try {
      logger.info(`AuthService: Login/Register for ${whatsappNumber}`);

      // Check if user already has a valid session
      const existingSession = this.sessions.get(whatsappNumber);
      if (existingSession && this.isSessionValid(existingSession)) {
        logger.info(`Using existing session for ${whatsappNumber}`);
        return existingSession.user;
      }

      // Authenticate with backend
      const authResponse: AuthResponse = await BackendService.authenticate(whatsappNumber, countryCode);

      // Store session
      const session: UserSession = {
        user: authResponse.user,
        accessToken: authResponse.tokens.accessToken,
        refreshToken: authResponse.tokens.refreshToken,
        expiresAt: Date.now() + 3600000, // 1 hour from now (adjust based on your JWT expiry)
      };

      this.sessions.set(whatsappNumber, session);
      logger.info(`Session created for ${whatsappNumber}, user ID: ${authResponse.user.id}`);

      return authResponse.user;
    } catch (error) {
      logger.error(`AuthService: Login failed for ${whatsappNumber}:`, error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current user session
   */
  static getSession(whatsappNumber: string): UserSession | null {
    const session = this.sessions.get(whatsappNumber);

    if (!session) {
      return null;
    }

    if (!this.isSessionValid(session)) {
      // Session expired, remove it
      this.sessions.delete(whatsappNumber);
      return null;
    }

    return session;
  }

  /**
   * Get user info from session
   */
  static getUser(whatsappNumber: string): User | null {
    const session = this.getSession(whatsappNumber);
    return session ? session.user : null;
  }

  /**
   * Get access token for a user
   */
  static async getAccessToken(whatsappNumber: string): Promise<string | null> {
    const session = this.getSession(whatsappNumber);

    if (!session) {
      return null;
    }

    // Check if token is about to expire
    if (this.isTokenExpiringSoon(session)) {
      logger.info(`Token expiring soon for ${whatsappNumber}, refreshing...`);
      await this.refreshSession(whatsappNumber);
      const refreshedSession = this.sessions.get(whatsappNumber);
      return refreshedSession ? refreshedSession.accessToken : null;
    }

    return session.accessToken;
  }

  /**
   * Check if session is valid
   */
  private static isSessionValid(session: UserSession): boolean {
    return Date.now() < session.expiresAt;
  }

  /**
   * Check if token is expiring soon (within buffer time)
   */
  private static isTokenExpiringSoon(session: UserSession): boolean {
    return Date.now() >= (session.expiresAt - this.TOKEN_EXPIRY_BUFFER);
  }

  /**
   * Refresh user session (token refresh logic)
   * Note: This requires /api/auth/refresh endpoint on backend
   */
  private static async refreshSession(whatsappNumber: string): Promise<void> {
    try {
      const session = this.sessions.get(whatsappNumber);
      if (!session) {
        throw new Error('No session to refresh');
      }

      // For now, just re-authenticate
      // In production, you'd call /api/auth/refresh with refreshToken
      logger.info(`Re-authenticating ${whatsappNumber} to refresh session`);
      await this.loginOrRegister(whatsappNumber);
    } catch (error) {
      logger.error(`Failed to refresh session for ${whatsappNumber}:`, error);
      // Clear invalid session
      this.sessions.delete(whatsappNumber);
      throw error;
    }
  }

  /**
   * Ensure user is authenticated, login if not
   */
  static async ensureAuthenticated(whatsappNumber: string): Promise<User> {
    const user = this.getUser(whatsappNumber);

    if (user) {
      return user;
    }

    // Not authenticated, login
    return await this.loginOrRegister(whatsappNumber);
  }

  /**
   * Logout user (clear session)
   */
  static logout(whatsappNumber: string): void {
    this.sessions.delete(whatsappNumber);
    BackendService.clearAuth(whatsappNumber);
    logger.info(`User ${whatsappNumber} logged out`);
  }

  /**
   * Clear all sessions (for admin/testing purposes)
   */
  static clearAllSessions(): void {
    this.sessions.clear();
    BackendService.clearAuth();
    logger.info('All user sessions cleared');
  }

  /**
   * Get session count (for monitoring)
   */
  static getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all active sessions (for monitoring)
   */
  static getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}
