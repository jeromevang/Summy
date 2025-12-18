import React, { useState, useEffect, useCallback } from 'react';

interface ToastItem {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    const duration = toast.duration || 5000;
    const timer = setTimeout(handleDismiss, duration);
    return () => clearTimeout(timer);
  }, [handleDismiss, toast.duration]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'info': return 'ℹ️';
      default: return '🔔';
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case 'success': return 'border-green-500';
      case 'warning': return 'border-yellow-500';
      case 'error': return 'border-red-500';
      case 'info': return 'border-blue-500';
      default: return 'border-gray-500';
    }
  };

  return (
    <div
      className={`
        flex items-start gap-3 p-4 bg-[#1a1a1a] border border-[#2d2d2d] ${getBorderColor()}
        border-l-4 rounded-lg shadow-lg min-w-[300px] max-w-[400px]
        transform transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
      `}
    >
      <span className="text-xl flex-shrink-0">{getIcon()}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm">{toast.title}</p>
        {toast.message && (
          <p className="text-gray-400 text-xs mt-0.5 truncate">{toast.message}</p>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="text-gray-500 hover:text-gray-300 flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

// Toast Container - manages multiple toasts
interface ToastContainerProps {
  websocketUrl?: string;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  websocketUrl = `ws://${window.location.hostname}:3001`
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Setup WebSocket for real-time notifications
  useEffect(() => {
    const ws = new WebSocket(websocketUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification' && data.action === 'new' && data.data) {
          const notification = data.data;
          // Show toast for new notifications
          addToast({
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            duration: 5000
          });
        }
      } catch (e) {
        // Not JSON, ignore
      }
    };

    return () => ws.close();
  }, [websocketUrl]);

  const addToast = (toast: ToastItem) => {
    setToasts(prev => [...prev, toast]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
};

export default Toast;

