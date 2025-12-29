/**
 * Memoization Utilities
 * Provides memoization patterns for expensive calculations and data transformations
 */

import { useMemo, useCallback } from 'react';

/**
 * Memoize expensive calculations with dependency tracking
 */
export const useMemoizedCalculation = <T>(
  dependencies: any[],
  calculation: () => T,
  debugName?: string
): T => {
  return useMemo(() => {
    const start = performance.now();
    const result = calculation();
    const duration = performance.now() - start;
    
    if (process.env.NODE_ENV === 'development' && duration > 16) {
      console.log(`Memoized calculation "${debugName || 'unnamed'}" took ${duration.toFixed(2)}ms`);
    }
    
    return result;
  }, dependencies);
};

/**
 * Memoize async operations with caching
 */
export const useMemoizedAsync = <T>(
  dependencies: any[],
  asyncOperation: () => Promise<T>,
  cacheKey?: string
): { data: T | null; loading: boolean; error: Error | null } => {
  const [state, setState] = React.useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({ data: null, loading: false, error: null });

  useMemo(() => {
    let cancelled = false;
    
    const execute = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      try {
        const result = await asyncOperation();
        if (!cancelled) {
          setState({ data: result, loading: false, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ data: null, loading: false, error: error as Error });
        }
      }
    };

    execute();

    return () => {
      cancelled = true;
    };
  }, dependencies);

  return state;
};

/**
 * Debounced memoization for input-based calculations
 */
export const useDebouncedMemo = <T>(
  value: any,
  calculation: (value: any) => T,
  delay: number = 300
): T | undefined => {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return useMemo(() => {
    return calculation(debouncedValue);
  }, [debouncedValue, calculation]);
};

/**
 * Lazy initialization for expensive objects
 */
export const useLazyInit = <T>(
  initializer: () => T,
  dependencies: any[] = []
): T => {
  return useMemo(() => {
    return initializer();
  }, dependencies);
};

/**
 * Conditional memoization based on data size
 */
export const useConditionalMemo = <T>(
  dependencies: any[],
  calculation: () => T,
  condition: (deps: any[]) => boolean
): T => {
  const shouldMemoize = useMemo(() => {
    return condition(dependencies);
  }, dependencies);

  return useMemo(() => {
    return calculation();
  }, shouldMemoize ? dependencies : []);
};

/**
 * Cache manager for expensive operations
 */
class CacheManager {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  set(key: string, data: any, ttl: number = 5 * 60 * 1000) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear() {
    this.cache.clear();
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }
}

const globalCache = new CacheManager();

/**
 * Cached async operation with TTL
 */
export const useCachedAsync = <T>(
  key: string,
  asyncOperation: () => Promise<T>,
  ttl: number = 5 * 60 * 1000
): { data: T | null; loading: boolean; error: Error | null; refresh: () => Promise<void> } => {
  const [state, setState] = React.useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({ data: null, loading: false, error: null });

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const result = await asyncOperation();
      globalCache.set(key, result, ttl);
      setState({ data: result, loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error: error as Error });
    }
  }, [key, asyncOperation, ttl]);

  React.useEffect(() => {
    const cached = globalCache.get(key);
    if (cached) {
      setState({ data: cached, loading: false, error: null });
    } else {
      refresh();
    }
  }, [key, refresh]);

  return { ...state, refresh };
};

/**
 * Batched updates for multiple state changes
 */
export const useBatchedUpdates = <T extends Record<string, any>>(
  initialState: T
): [T, (updates: Partial<T>) => void] => {
  const [state, setState] = React.useState<T>(initialState);
  const pendingUpdates = React.useRef<Partial<T>>({});

  const updateState = useCallback((updates: Partial<T>) => {
    pendingUpdates.current = { ...pendingUpdates.current, ...updates };
    
    // Batch updates using requestAnimationFrame
    requestAnimationFrame(() => {
      setState(prevState => {
        const result = { ...prevState, ...pendingUpdates.current };
        pendingUpdates.current = {};
        return result;
      });
    });
  }, []);

  return [state, updateState];
};

/**
 * Virtualization data preparation
 */
export const useVirtualizedData = <T>(
  data: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) => {
  const [scrollTop, setScrollTop] = React.useState(0);

  const virtualization = useMemo(() => {
    const totalItems = data.length;
    const visibleItems = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      totalItems - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    const visibleData = data.slice(startIndex, endIndex + 1);
    const totalHeight = totalItems * itemHeight;
    const offsetY = startIndex * itemHeight;

    return {
      visibleData,
      totalHeight,
      offsetY,
      startIndex,
      endIndex,
      visibleCount: visibleData.length
    };
  }, [data, itemHeight, containerHeight, scrollTop, overscan]);

  return {
    ...virtualization,
    setScrollTop
  };
};

/**
 * Performance monitoring for renders
 */
export const useRenderCount = (componentName: string) => {
  const renderCount = React.useRef(0);
  
  React.useEffect(() => {
    renderCount.current += 1;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`${componentName} rendered ${renderCount.current} times`);
    }
  });

  return renderCount.current;
};
