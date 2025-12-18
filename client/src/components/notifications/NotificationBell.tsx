import React, { useState, useEffect, useRef } from 'react';
import NotificationList from './NotificationList';

interface Notification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
  read: boolean;
  timestamp?: string;
}

interface NotificationBellProps {
  websocketUrl?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ 
  websocketUrl = `ws://${window.location.hostname}:3001` 
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial notifications
  useEffect(() => {
    fetchNotifications();
  }, []);

  // Setup WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(websocketUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Notifications] WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification') {
          handleNotificationEvent(data);
        }
      } catch (e) {
        // Not JSON, ignore
      }
    };

    ws.onclose = () => {
      console.log('[Notifications] WebSocket disconnected');
    };

    return () => {
      ws.close();
    };
  }, [websocketUrl]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  const handleNotificationEvent = (data: any) => {
    if (data.action === 'new' && data.data) {
      setNotifications(prev => [data.data, ...prev].slice(0, 50));
      setUnreadCount(data.unreadCount || 0);
    } else if (data.action === 'read') {
      setUnreadCount(data.unreadCount || 0);
      if (data.data?.id) {
        setNotifications(prev => 
          prev.map(n => n.id === data.data.id ? { ...n, read: true } : n)
        );
      } else {
        // Mark all as read
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    } else if (data.action === 'clear') {
      if (data.data?.id) {
        setNotifications(prev => prev.filter(n => n.id !== data.data.id));
      } else {
        setNotifications([]);
      }
      setUnreadCount(0);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const clearAll = async () => {
    try {
      await fetch('/api/notifications', { method: 'DELETE' });
      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center bg-purple-500 text-white text-xs font-bold rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-[#1a1a1a] border border-[#2d2d2d] rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d2d2d]">
            <h3 className="text-white font-medium">Notifications</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-purple-400 hover:text-purple-300"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-gray-500 hover:text-gray-400"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <NotificationList
            notifications={notifications}
            onMarkAsRead={markAsRead}
            maxHeight="320px"
          />
        </div>
      )}
    </div>
  );
};

export default NotificationBell;

