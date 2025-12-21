/**
 * Shared Type Definitions
 * Common types used across the test project
 */

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
  metadata?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface User {
  id: string;
  email: string;
  name?: string;
  isAdmin?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  stock: number;
  imageUrl?: string;
  createdAt: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export type StatusType = 'pending' | 'active' | 'completed' | 'cancelled';

export interface AuditLog {
  id: string;
  action: string;
  userId: string;
  targetType: string;
  targetId: string;
  timestamp: string;
  details?: Record<string, any>;
}

