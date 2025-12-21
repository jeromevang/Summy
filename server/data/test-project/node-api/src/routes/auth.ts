/**
 * Authentication Routes
 * Handles login, register, and token refresh
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authService } from '../services/auth.service';
import { User } from '../types';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
const TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '7d';

/**
 * POST /api/auth/register
 * Register a new user
 */
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const existingUser = await authService.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await authService.createUser({ email, password: hashedPassword, name });
    
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    const refreshToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
    
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name }, token, refreshToken });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return tokens
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await authService.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    const refreshToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
    
    // Store refresh token
    await authService.storeRefreshToken(user.id, refreshToken);
    
    res.json({ user: { id: user.id, email: user.email, name: user.name }, token, refreshToken });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 * 
 * BUG: The refresh token is not properly validated before issuing a new access token.
 * An attacker could use an expired or revoked refresh token to get new access tokens.
 */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    // BUG: Not checking if refresh token is revoked or expired in database
    // Should call: await authService.validateRefreshToken(refreshToken)
    const decoded = jwt.decode(refreshToken) as any;
    
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
    // Issue new access token without proper validation
    const user = await authService.findUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const newToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    
    res.json({ token: newToken });
  } catch (error: any) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

