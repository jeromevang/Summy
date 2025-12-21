/**
 * User Routes
 * CRUD operations for user management
 */

import { Router, Request, Response } from 'express';
import { userService } from '../services/user.service';
import { AuthenticatedRequest } from '../types';

export const usersRouter = Router();

/**
 * GET /api/users
 * List all users (admin only)
 */
usersRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    
    const users = await userService.listUsers({
      page: Number(page),
      limit: Number(limit),
      search: search as string,
    });
    
    res.json(users);
  } catch (error: any) {
    console.error('Failed to list users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * GET /api/users/:id
 * Get user by ID
 */
usersRouter.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove sensitive data
    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (error: any) {
    console.error('Failed to get user:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * PUT /api/users/:id
 * Update user
 */
usersRouter.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;
    
    // Users can only update their own profile (unless admin)
    if (req.user?.id !== id && !req.user?.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const updatedUser = await userService.updateUser(id, { name, email });
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { password, ...safeUser } = updatedUser;
    res.json(safeUser);
  } catch (error: any) {
    console.error('Failed to update user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/users/:id
 * Delete user (admin only)
 */
usersRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    await userService.deleteUser(id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Failed to delete user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * GET /api/users/me
 * Get current user profile
 */
usersRouter.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const user = await userService.getUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (error: any) {
    console.error('Failed to get profile:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

