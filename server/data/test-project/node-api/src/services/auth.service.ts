/**
 * Authentication Service
 * Business logic for user authentication
 */

import { dbService } from './db.service';
import { User } from '../types';

class AuthService {
  /**
   * Find user by email
   */
  async findUserByEmail(email: string): Promise<User | null> {
    const users = await dbService.query<User>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return users[0] || null;
  }

  /**
   * Find user by ID
   */
  async findUserById(id: string): Promise<User | null> {
    const users = await dbService.query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return users[0] || null;
  }

  /**
   * Create a new user
   */
  async createUser(data: { email: string; password: string; name?: string }): Promise<User> {
    const result = await dbService.query<User>(
      `INSERT INTO users (email, password, name, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [data.email, data.password, data.name || null]
    );
    return result[0];
  }

  /**
   * Store refresh token for user
   */
  async storeRefreshToken(userId: string, token: string): Promise<void> {
    await dbService.query(
      `INSERT INTO refresh_tokens (user_id, token, created_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '7 days')`,
      [userId, token]
    );
  }

  /**
   * Validate refresh token
   * Returns true if token is valid and not expired/revoked
   */
  async validateRefreshToken(token: string): Promise<boolean> {
    const result = await dbService.query<{ valid: boolean }>(
      `SELECT EXISTS(
        SELECT 1 FROM refresh_tokens 
        WHERE token = $1 
        AND revoked = false 
        AND expires_at > NOW()
      ) as valid`,
      [token]
    );
    return result[0]?.valid || false;
  }

  /**
   * Revoke a refresh token
   */
  async revokeRefreshToken(token: string): Promise<void> {
    await dbService.query(
      'UPDATE refresh_tokens SET revoked = true WHERE token = $1',
      [token]
    );
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await dbService.query(
      'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1',
      [userId]
    );
  }
}

export const authService = new AuthService();
export default authService;

