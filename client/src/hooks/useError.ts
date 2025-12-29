/**
 * Frontend Error Handling System
 * Provides consistent error handling for React components
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ============================================================
// ERROR TYPES
// ============================================================

export enum FrontendErrorType {
  NETWORK = 'NETWORK_ERROR',
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTH_ERROR',
  AUTHORIZATION = 'AUTHZ_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  SERVER = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN_ERROR'
}

export interface FrontendError {
  id: string;
  type: FrontendErrorType;
  message: string;
  details?: any;
  timestamp: Date;
  component?: string;
  action?: string;
  retryable: boolean;
  dismissed: boolean;
}

// ============================================================
// ERROR CONTEXT
// ============================================================

interface ErrorContextType {
  errors: FrontendError[];
  addError: (error: Omit<FrontendError, 'id' | 'timestamp' | 'dismissed'>) => void;
  dismissError: (errorId: string) => void;
  dismissAllErrors: () => void;
  retryError: (errorId: string) => void;
  clearErrors: () => void;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

export const useError = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
};

// ============================================================
// ERROR PROVIDER
// ============================================================

interface ErrorProviderProps {
  children: ReactNode;
}

export const ErrorProvider: React.FC<ErrorProviderProps> = ({ children }) => {
  const [errors, setErrors] = useState<FrontendError[]>([]);

  const addError = useCallback((errorData: Omit<FrontendError, 'id' | 'timestamp' | 'dismissed'>) => {
    const error: FrontendError = {
      ...errorData,
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      dismissed: false
    };

    setErrors(prev => [...prev, error]);

    // Auto-dismiss non-critical errors after 5 seconds
    if (error.type !== FrontendErrorType.AUTHENTICATION && 
        error.type !== FrontendErrorType.AUTHORIZATION &&
        error.type !== FrontendErrorType.SERVER) {
      setTimeout(() => {
        dismissError(error.id);
      }, 5000);
    }
  }, []);

  const dismissError = useCallback((errorId: string) => {
    setErrors(prev => prev.map(error => 
      error.id === errorId ? { ...error, dismissed: true } : error
    ));
  }, []);

  const dismissAllErrors = useCallback(() => {
    setErrors(prev => prev.map(error => ({ ...error, dismissed: true })));
  }, []);

  const retryError = useCallback((errorId: string) => {
    setErrors(prev => prev.filter(error => error.id !== errorId));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const value = {
    errors,
    addError,
    dismissError,
    dismissAllErrors,
    retryError,
    clearErrors
  };

  return (
    <ErrorContext.Provider value={value}>
      {children}
    </ErrorContext.Provider>
  );
};

// ============================================================
// ERROR BOUNDARY
// ============================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, { hasError: boolean; error: Error | null }> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to error monitoring service
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Report to error context if available
    const errorContext = React.useContext(ErrorContext);
    if (errorContext) {
      errorContext.addError({
        type: FrontendErrorType.UNKNOWN,
        message: error.message,
        details: errorInfo,
        component: 'ErrorBoundary',
        action: 'component render',
        retryable: false
      });
    }

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error!} resetError={this.resetError} />;
      }

      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>Please refresh the page or contact support if the problem persists.</p>
          <button onClick={this.resetError}>Try again</button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details>
              <summary>Error details</summary>
              <pre>{this.state.error.stack}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================
// ERROR COMPONENTS
// ============================================================

interface ErrorDisplayProps {
  error: FrontendError;
  onRetry?: (errorId: string) => void;
  onDismiss?: (errorId: string) => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onRetry, onDismiss }) => {
  const getErrorIcon = () => {
    switch (error.type) {
      case FrontendErrorType.NETWORK:
        return '🌐';
      case FrontendErrorType.VALIDATION:
        return '⚠️';
      case FrontendErrorType.AUTHENTICATION:
      case FrontendErrorType.AUTHORIZATION:
        return '🔒';
      case FrontendErrorType.NOT_FOUND:
        return '🔍';
      case FrontendErrorType.TIMEOUT:
        return '⏰';
      case FrontendErrorType.SERVER:
        return '💥';
      default:
        return '❌';
    }
  };

  const getErrorColor = () => {
    switch (error.type) {
      case FrontendErrorType.AUTHENTICATION:
      case FrontendErrorType.AUTHORIZATION:
      case FrontendErrorType.SERVER:
        return 'bg-red-50 border-red-200 text-red-800';
      case FrontendErrorType.VALIDATION:
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case FrontendErrorType.NETWORK:
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${getErrorColor()} ${error.dismissed ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <span className="text-2xl" aria-hidden="true">{getErrorIcon()}</span>
          <div className="flex-1">
            <h3 className="font-semibold">{error.message}</h3>
            {error.details && (
              <div className="mt-2 text-sm opacity-75">
                Details: {JSON.stringify(error.details)}
              </div>
            )}
            {error.component && (
              <div className="mt-1 text-xs opacity-50">
                Component: {error.component}
              </div>
            )}
            <div className="mt-1 text-xs opacity-50">
              {error.timestamp.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex space-x-2">
          {error.retryable && onRetry && (
            <button
              onClick={() => onRetry(error.id)}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Retry
            </button>
          )}
          <button
            onClick={() => onDismiss?.(error.id)}
            className="px-3 py-1 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// ERROR HOOKS
// ============================================================

export const useErrorHandler = () => {
  const { addError, dismissError } = useError();

  const handleApiError = useCallback((error: any, context?: { component?: string; action?: string }) => {
    let errorType = FrontendErrorType.UNKNOWN;
    let message = 'An unexpected error occurred';
    let retryable = false;

    // Determine error type and message
    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 400:
          errorType = FrontendErrorType.VALIDATION;
          message = error.response.data?.message || 'Invalid request';
          break;
        case 401:
          errorType = FrontendErrorType.AUTHENTICATION;
          message = 'Authentication required';
          break;
        case 403:
          errorType = FrontendErrorType.AUTHORIZATION;
          message = 'Access denied';
          break;
        case 404:
          errorType = FrontendErrorType.NOT_FOUND;
          message = 'Resource not found';
          break;
        case 429:
          errorType = FrontendErrorType.TIMEOUT;
          message = 'Too many requests';
          retryable = true;
          break;
        case 500:
        case 502:
        case 503:
          errorType = FrontendErrorType.SERVER;
          message = 'Server error';
          retryable = true;
          break;
        default:
          message = `Server error (${status})`;
          retryable = true;
      }
    } else if (error.request) {
      errorType = FrontendErrorType.NETWORK;
      message = 'Network error - please check your connection';
      retryable = true;
    } else {
      message = error.message || 'An unexpected error occurred';
    }

    addError({
      type: errorType,
      message,
      details: error.response?.data,
      component: context?.component,
      action: context?.action,
      retryable
    });
  }, [addError]);

  return {
    handleApiError,
    addError,
    dismissError
  };
};

// ============================================================
// ASYNC ERROR HANDLER HOOK
// ============================================================

export const useAsyncError = () => {
  const { handleApiError } = useErrorHandler();

  const executeAsync = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    context?: { component?: string; action?: string }
  ): Promise<T | null> => {
    try {
      return await asyncFn();
    } catch (error) {
      handleApiError(error, context);
      return null;
    }
  }, [handleApiError]);

  return { executeAsync };
};

// ============================================================
// ERROR UTILITIES
// ============================================================

export const createError = (
  type: FrontendErrorType,
  message: string,
  details?: any,
  component?: string,
  action?: string,
  retryable: boolean = false
): Omit<FrontendError, 'id' | 'timestamp' | 'dismissed'> => ({
  type,
  message,
  details,
  component,
  action,
  retryable
});

export const isNetworkError = (error: FrontendError): boolean => {
  return error.type === FrontendErrorType.NETWORK;
};

export const isAuthError = (error: FrontendError): boolean => {
  return error.type === FrontendErrorType.AUTHENTICATION || 
         error.type === FrontendErrorType.AUTHORIZATION;
};

export const isServerError = (error: FrontendError): boolean => {
  return error.type === FrontendErrorType.SERVER;
};

export const isValidationError = (error: FrontendError): boolean => {
  return error.type === FrontendErrorType.VALIDATION;
};

export default {
  ErrorProvider,
  useError,
  ErrorBoundary,
  ErrorDisplay,
  useErrorHandler,
  useAsyncError,
  createError,
  isNetworkError,
  isAuthError,
  isServerError,
  isValidationError
};
