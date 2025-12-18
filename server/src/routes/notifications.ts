/**
 * Notifications API Routes
 */

import { Router } from 'express';
import { notifications } from '../services/notifications.js';

const router = Router();

/**
 * GET /api/notifications
 * Get all notifications
 */
router.get('/', (req, res) => {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = parseInt(req.query.limit as string) || 20;
    
    const notificationList = notifications.getAll(unreadOnly, limit);
    const unreadCount = notifications.getUnreadCount();
    
    res.json({
      notifications: notificationList,
      unreadCount
    });
  } catch (error: any) {
    console.error('[Notifications] Failed to get notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark notification as read
 */
router.post('/:id/read', (req, res) => {
  try {
    const { id } = req.params;
    notifications.markAsRead(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Notifications] Failed to mark as read:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
router.post('/read-all', (req, res) => {
  try {
    notifications.markAllAsRead();
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Notifications] Failed to mark all as read:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a specific notification
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    notifications.delete(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Notifications] Failed to delete notification:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/notifications
 * Clear all notifications
 */
router.delete('/', (req, res) => {
  try {
    notifications.clearAll();
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Notifications] Failed to clear notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

