import React from 'react';

interface Notification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
  read: boolean;
  timestamp?: string;
  actionLabel?: string;
  actionHref?: string;
}

interface NotificationListProps {
  notifications: Notification[];
  onMarkAsRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  maxHeight?: string;
}

const NotificationList: React.FC<NotificationListProps> = ({
  notifications,
  onMarkAsRead,
  onDelete,
  maxHeight = '400px'
}) => {
  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'info': return 'ℹ️';
      default: return '🔔';
    }
  };

  const getTypeColor = (type: Notification['type']) => {
    switch (type) {
      case 'success': return 'border-l-green-500';
      case 'warning': return 'border-l-yellow-500';
      case 'error': return 'border-l-red-500';
      case 'info': return 'border-l-blue-500';
      default: return 'border-l-gray-500';
    }
  };

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleClick = (notification: Notification) => {
    if (!notification.read && onMarkAsRead) {
      onMarkAsRead(notification.id);
    }
    if (notification.actionHref) {
      window.location.href = notification.actionHref;
    }
  };

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500">
        <svg
          className="w-12 h-12 mb-2 opacity-50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        <p className="text-sm">No notifications</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto" style={{ maxHeight }}>
      {notifications.map((notification) => (
        <div
          key={notification.id}
          onClick={() => handleClick(notification)}
          className={`
            px-4 py-3 border-l-4 border-b border-b-[#2d2d2d] 
            ${getTypeColor(notification.type)}
            ${!notification.read ? 'bg-[#2d2d2d]/50' : ''}
            ${notification.actionHref ? 'cursor-pointer hover:bg-[#2d2d2d]' : ''}
            transition-colors
          `}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <span className="text-lg flex-shrink-0">{getIcon(notification.type)}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${notification.read ? 'text-gray-400' : 'text-white'}`}>
                  {notification.title}
                </p>
                {notification.message && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {notification.message}
                  </p>
                )}
                {notification.actionLabel && (
                  <span className="text-xs text-purple-400 mt-1 inline-block">
                    {notification.actionLabel} →
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {notification.timestamp && (
                <span className="text-xs text-gray-600">
                  {formatTime(notification.timestamp)}
                </span>
              )}
              {!notification.read && (
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationList;

