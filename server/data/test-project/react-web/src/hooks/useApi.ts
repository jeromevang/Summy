/**
 * useApi Hook
 * Custom hook for making API requests
 * 
 * BUG: Missing proper error boundary handling - errors can crash components
 * BUG: No request cancellation on unmount - can cause memory leaks
 */

import { useState, useCallback } from 'react';
import { api } from '../services/api';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

interface UseApiReturn<T> extends UseApiState<T> {
  get: <R = T>(url: string) => Promise<R | null>;
  post: <R = T>(url: string, body: any) => Promise<R | null>;
  put: <R = T>(url: string, body: any) => Promise<R | null>;
  delete: (url: string) => Promise<boolean>;
  reset: () => void;
}

export function useApi<T = any>(): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  // BUG: No AbortController for request cancellation
  // This can cause "Can't perform a React state update on an unmounted component"
  
  const get = useCallback(async <R = T>(url: string): Promise<R | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    // BUG: No try-catch wrapper - errors will propagate up
    const response = await api.get(url);
    setState(prev => ({ ...prev, data: response as any, loading: false }));
    return response as R;
    
    // Missing: catch block for error handling
    // Missing: finally block to ensure loading is set to false
  }, []);

  const post = useCallback(async <R = T>(url: string, body: any): Promise<R | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    const response = await api.post(url, body);
    setState(prev => ({ ...prev, data: response as any, loading: false }));
    return response as R;
  }, []);

  const put = useCallback(async <R = T>(url: string, body: any): Promise<R | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    const response = await api.put(url, body);
    setState(prev => ({ ...prev, data: response as any, loading: false }));
    return response as R;
  }, []);

  const del = useCallback(async (url: string): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    await api.delete(url);
    setState(prev => ({ ...prev, loading: false }));
    return true;
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    get,
    post,
    put,
    delete: del,
    reset,
  };
}

export default useApi;

