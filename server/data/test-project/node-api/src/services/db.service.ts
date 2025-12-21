/**
 * Database Service
 * Handles PostgreSQL connection and queries
 * 
 * BUG: Connection pool leak - connections are acquired but not always released
 */

import { Pool, PoolClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/testdb';

class DatabaseService {
  private pool: Pool | null = null;
  private activeConnections: PoolClient[] = [];  // BUG: Tracking but not cleaning up

  /**
   * Initialize connection pool
   */
  async connect(): Promise<void> {
    if (this.pool) {
      console.log('Database already connected');
      return;
    }

    this.pool = new Pool({
      connectionString: DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await this.pool.connect();
    console.log('Database connection established');
    client.release();
  }

  /**
   * Execute a query
   * 
   * BUG: In some code paths, the client is acquired but not released,
   * leading to connection pool exhaustion under load.
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    this.activeConnections.push(client);  // Track connection
    
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
      // BUG: Connection not released on error path!
    }
    // BUG: If an exception occurs, client.release() is never called
    // This should be in a finally block
  }

  /**
   * Execute a query with proper cleanup (correct implementation)
   */
  async safeQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();  // Always release
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close connection pool
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('Database disconnected');
    }
  }

  /**
   * Get pool statistics (for debugging)
   */
  getStats(): { total: number; idle: number; waiting: number } | null {
    if (!this.pool) return null;
    
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}

export const dbService = new DatabaseService();
export default dbService;

