/**
 * User Service
 * Business logic for user management
 */

import { dbService } from './db.service';
import { User } from '../types';

interface ListUsersOptions {
  page: number;
  limit: number;
  search?: string;
}

interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class UserService {
  /**
   * List users with pagination
   */
  async listUsers(options: ListUsersOptions): Promise<PaginatedResult<Omit<User, 'password'>>> {
    const { page, limit, search } = options;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT id, email, name, created_at, is_admin FROM users WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
    const params: any[] = [];
    
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (email ILIKE $${params.length} OR name ILIKE $${params.length})`;
      countQuery += ` AND (email ILIKE $${params.length} OR name ILIKE $${params.length})`;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const [users, countResult] = await Promise.all([
      dbService.query<Omit<User, 'password'>>(query, params),
      dbService.query<{ count: string }>(countQuery, params.slice(0, -2)),
    ]);
    
    const total = parseInt(countResult[0]?.count || '0', 10);
    
    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    const users = await dbService.query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return users[0] || null;
  }

  /**
   * Update user
   */
  async updateUser(id: string, data: { name?: string; email?: string }): Promise<User | null> {
    const result = await dbService.query<User>(
      `UPDATE users 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [data.name, data.email, id]
    );
    return result[0] || null;
  }

  /**
   * Delete user
   */
  async deleteUser(id: string): Promise<void> {
    await dbService.query('DELETE FROM users WHERE id = $1', [id]);
  }

  /**
   * Check if user is admin
   */
  async isAdmin(id: string): Promise<boolean> {
    const result = await dbService.query<{ is_admin: boolean }>(
      'SELECT is_admin FROM users WHERE id = $1',
      [id]
    );
    return result[0]?.is_admin || false;
  }
}

export const userService = new UserService();
export default userService;

