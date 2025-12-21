/**
 * Type Definitions
 * Shared types for the API
 */

import { Request } from 'express';

// ============================================================
// USER TYPES
// ============================================================

export interface User {
  id: string;
  email: string;
  password: string;
  name?: string;
  isAdmin?: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface UserDTO {
  id: string;
  email: string;
  name?: string;
  isAdmin?: boolean;
}

// ============================================================
// PRODUCT TYPES
// ============================================================

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  stock: number;
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface CreateProductDTO {
  name: string;
  description?: string;
  price: number;
  category?: string;
  stock?: number;
}

export interface UpdateProductDTO {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  stock?: number;
}

// ============================================================
// AUTH TYPES
// ============================================================

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  revoked: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

// ============================================================
// REQUEST TYPES
// ============================================================

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    isAdmin: boolean;
  };
}

// ============================================================
// PAGINATION
// ============================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================
// ERROR TYPES
// ============================================================

export interface ApiError {
  error: string;
  code?: string;
  details?: any;
}

